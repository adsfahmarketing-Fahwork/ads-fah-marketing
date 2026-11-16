-- ============================================================================
-- Migration 0004 (Phase 4): งาน + ระบบแจ้งเตือน + งานประจำวัน (สัญญาใกล้หมด / งานเกินกำหนด)
-- หมายเหตุ: "เกินกำหนด" ของงานคำนวณจาก due_date (ไม่เก็บทับสถานะจริง) เพื่อไม่ให้สูญเสียสถานะเดิม
-- ============================================================================

alter type public.notification_type add value if not exists 'task_assigned';

alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_idx on public.notifications (recipient_id, dedupe_key) where dedupe_key is not null;

-- notify: เพิ่ม dedupe_key กันแจ้งเตือนซ้ำ และคืนค่าว่าสร้างจริงหรือไม่
drop function public.notify(uuid, public.notification_type, text, text, text, uuid);
create function public.notify(
  p_recipient uuid, p_type public.notification_type, p_title text, p_body text,
  p_entity_type text, p_entity_id uuid, p_dedupe text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer := 0;
begin
  if exists (select 1 from public.profiles where id = p_recipient and status = 'active') then
    insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, dedupe_key)
    values (p_recipient, p_type, p_title, p_body, p_entity_type, p_entity_id, p_dedupe)
    on conflict (recipient_id, dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics n = row_count;
  end if;
  return n > 0;
end $$;

create function public.task_status_label(s public.task_status) returns text
language sql immutable as $$
  select case s when 'todo' then 'รอดำเนินการ' when 'in_progress' then 'กำลังดำเนินการ'
    when 'in_review' then 'รอตรวจสอบ' when 'done' then 'เสร็จสิ้น' else 'เกินกำหนด' end
$$;

-- ผู้รับผิดชอบที่เป็น Page Admin ต้องดูแลเพจที่ระบุในงานนั้นจริง
create function public.validate_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_role public.user_role;
begin
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id and new.page_id is not distinct from old.page_id then
    return new;
  end if;
  if new.assignee_id is not null and new.page_id is not null then
    select role into v_role from public.profiles where id = new.assignee_id and status = 'active';
    if v_role is null then
      raise exception 'ผู้รับผิดชอบงานต้องเป็นพนักงานที่ปฏิบัติงานอยู่' using errcode = '22023';
    end if;
    if v_role = 'page_admin' and not exists (
         select 1 from public.page_assignments where page_id = new.page_id and staff_id = new.assignee_id) then
      raise exception 'พนักงานคนนี้ไม่ได้รับผิดชอบเพจที่เลือก กรุณามอบหมายเพจให้ก่อน' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_validate before insert or update on public.tasks for each row execute function public.validate_task();

-- แจ้งเตือน + บันทึกประวัติการอัปเดตสถานะเป็นความคิดเห็นของระบบ
create function public.trg_task_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); r uuid;
begin
  if tg_op = 'INSERT' then
    if new.assignee_id is not null and new.assignee_id is distinct from v_actor then
      perform public.notify(new.assignee_id, 'task_assigned', 'คุณได้รับมอบหมายงานใหม่', new.title, 'task', new.id);
    end if;
    return null;
  end if;
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null and new.assignee_id is distinct from v_actor then
    perform public.notify(new.assignee_id, 'task_assigned', 'คุณได้รับมอบหมายงานใหม่', new.title, 'task', new.id);
  end if;
  if new.status is distinct from old.status then
    insert into public.task_comments (task_id, author_id, body)
    values (new.id, v_actor, 'เปลี่ยนสถานะ: ' || public.task_status_label(old.status) || ' → ' || public.task_status_label(new.status));
    for r in select distinct u from (values (new.created_by), (new.assignee_id)) v (u)
             where u is not null and u is distinct from v_actor loop
      perform public.notify(r, 'task_status_changed', 'อัปเดตสถานะงาน', new.title || ' → ' || public.task_status_label(new.status), 'task', new.id);
    end loop;
  end if;
  return null;
end $$;
create trigger tasks_notify after insert or update on public.tasks for each row execute function public.trg_task_notify();

-- ผู้รับแจ้งเตือนของสัญญา: ผู้ดูแลเพจในสัญญา + Owner/Manager ที่ใช้งานอยู่
create function public.contract_recipients(p_contract uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select pa.staff_id from public.contract_pages cp join public.page_assignments pa on pa.page_id = cp.page_id
   where cp.contract_id = p_contract
  union
  select id from public.profiles where role in ('owner', 'manager') and status = 'active'
$$;

-- ต่อสัญญา: เพิ่มการแจ้งเตือน (ปรับจาก 0002)
create or replace function public.renew_contract(
  p_contract_id   uuid,
  p_start_date    date default null,
  p_duration_days integer default null,
  p_monthly_fee   numeric default null,
  p_ad_budget     numeric default null,
  p_notes         text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.contracts%rowtype;
  v_new_start date; v_dur integer; v_cycle integer; v_fee numeric; v_budget numeric; v_renewal uuid; u uuid; v_name text;
begin
  if not public.is_management() then
    raise exception 'ไม่มีสิทธิ์ต่อสัญญา' using errcode = '42501';
  end if;
  select * into c from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'ไม่พบสัญญา' using errcode = 'P0002'; end if;
  if c.status = 'cancelled' then
    raise exception 'สัญญาที่ยกเลิกแล้วต่ออายุไม่ได้' using errcode = '23514';
  end if;
  v_new_start := coalesce(p_start_date, c.end_date + 1);
  v_dur := coalesce(p_duration_days, c.duration_days);
  v_cycle := c.cycle_no + 1;
  if v_new_start <= c.end_date then
    raise exception 'วันเริ่มรอบใหม่ต้องอยู่หลังวันสิ้นสุดรอบเดิม' using errcode = '22023';
  end if;
  select f.monthly_fee, f.ad_budget into v_fee, v_budget
    from public.contract_financials f where f.contract_id = c.id and f.cycle_no = c.cycle_no;
  v_fee := coalesce(p_monthly_fee, v_fee, 0);
  v_budget := coalesce(p_ad_budget, v_budget, 0);
  insert into public.contract_renewals (contract_id, cycle_no, previous_start_date, previous_end_date, new_start_date, new_end_date, notes)
  values (c.id, v_cycle, c.start_date, c.end_date, v_new_start, v_new_start + (v_dur - 1), p_notes)
  returning id into v_renewal;
  insert into public.contract_financials (contract_id, cycle_no, monthly_fee, ad_budget) values (c.id, v_cycle, v_fee, v_budget);
  update public.contracts
     set start_date = v_new_start, duration_days = v_dur, cycle_no = v_cycle,
         status = case when v_new_start <= public.bangkok_today() then 'renewed' else 'pending_start' end::public.contract_status
   where id = c.id;
  perform public.refresh_contract_statuses();

  select business_name into v_name from public.customers where id = c.customer_id;
  for u in select * from public.contract_recipients(c.id) loop
    perform public.notify(u, 'contract_renewed', 'ต่อสัญญาแล้ว',
      v_name || ' · ' || c.contract_no || ' · รอบที่ ' || v_cycle, 'contract', c.id, 'renewed:' || c.id || ':' || v_cycle);
  end loop;
  return v_renewal;
end $$;

-- แจ้งเตือนสัญญาใกล้หมด (7/3/1 วัน) และหมดอายุ — ส่งแต่ละขั้นครั้งเดียวต่อรอบสัญญา
create function public.notify_contract_events() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_today date := public.bangkok_today(); r record; u uuid; t integer; n integer := 0;
begin
  for r in
    select c.id, c.contract_no, c.cycle_no, c.end_date, cu.business_name, (c.end_date - v_today) as days_left
      from public.contracts c join public.customers cu on cu.id = c.customer_id
     where c.status in ('active', 'expiring', 'renewed') and c.end_date >= v_today and c.end_date - v_today <= 7
  loop
    t := case when r.days_left <= 1 then 1 when r.days_left <= 3 then 3 else 7 end;
    for u in select * from public.contract_recipients(r.id) loop
      if public.notify(u, 'contract_expiring', 'สัญญาใกล้หมดอายุ',
           r.business_name || ' · ' || r.contract_no || ' · เหลือ ' || r.days_left || ' วัน (สิ้นสุด ' || to_char(r.end_date, 'DD/MM/YYYY') || ')',
           'contract', r.id, 'exp:' || r.id || ':' || r.cycle_no || ':' || t) then n := n + 1; end if;
    end loop;
  end loop;
  for r in
    select c.id, c.contract_no, c.cycle_no, c.end_date, cu.business_name
      from public.contracts c join public.customers cu on cu.id = c.customer_id
     where c.status = 'expired' and c.end_date < v_today and c.end_date >= v_today - 30
  loop
    for u in select * from public.contract_recipients(r.id) loop
      if public.notify(u, 'contract_expired', 'สัญญาหมดอายุแล้ว',
           r.business_name || ' · ' || r.contract_no || ' · สิ้นสุด ' || to_char(r.end_date, 'DD/MM/YYYY'),
           'contract', r.id, 'expired:' || r.id || ':' || r.cycle_no) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

create function public.notify_overdue_tasks() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; u uuid; n integer := 0;
begin
  for r in select id, title, due_date, assignee_id, created_by from public.tasks
            where status <> 'done' and due_date < public.bangkok_today()
  loop
    for u in select distinct x from (values (r.assignee_id), (r.created_by)) v (x) where x is not null loop
      if public.notify(u, 'task_overdue', 'งานเกินกำหนด', r.title || ' (กำหนด ' || to_char(r.due_date, 'DD/MM/YYYY') || ')',
           'task', r.id, 'task_overdue:' || r.id) then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

-- งานประจำวัน: อัปเดตสถานะสัญญา + แจ้งเตือน (เรียกจาก pg_cron และสำรองจากหน้าเว็บของ Owner/Manager)
create function public.run_daily_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_changed integer; v_contract integer; v_tasks integer;
begin
  if auth.uid() is not null and not public.is_management() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  v_changed := public.refresh_contract_statuses();
  v_contract := public.notify_contract_events();
  v_tasks := public.notify_overdue_tasks();
  return jsonb_build_object('status_changes', v_changed, 'contract_notices', v_contract, 'overdue_task_notices', v_tasks);
end $$;

-- ตั้งเวลาอัตโนมัติ 00:05 น. เวลาไทย (= 17:05 UTC) ถ้าใช้ pg_cron ได้ (Supabase) — ใน dev ที่ไม่มีจะข้าม
do $$
begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron ไม่พร้อมใช้งาน — ข้ามการตั้งเวลา'; end;
  if to_regnamespace('cron') is not null then
    perform cron.schedule('ads-fah-daily-jobs', '5 17 * * *', 'select public.run_daily_jobs()');
  end if;
end $$;

revoke all on function
  public.notify(uuid, public.notification_type, text, text, text, uuid, text), public.task_status_label(public.task_status),
  public.validate_task(), public.trg_task_notify(), public.contract_recipients(uuid), public.notify_contract_events(),
  public.notify_overdue_tasks(), public.run_daily_jobs(),
  public.renew_contract(uuid, date, integer, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.run_daily_jobs(), public.renew_contract(uuid, date, integer, numeric, numeric, text),
  public.task_status_label(public.task_status) to authenticated;
