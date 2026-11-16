-- ============================================================================
-- Migration 0002 (Phase 2): ฟังก์ชันสัญญา — สร้าง / ต่ออายุ / อัปเดตสถานะ
-- ทำงานแบบ atomic ในฐานข้อมูล และตรวจสิทธิ์ที่ฐานข้อมูล
-- ============================================================================

create function public.bangkok_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Bangkok')::date $$;

-- สร้างสัญญา + เพจในสัญญา + ค่าบริการรอบแรก ในครั้งเดียว
create function public.create_contract(
  p_customer_id   uuid,
  p_service_type  text,
  p_start_date    date,
  p_duration_days integer,
  p_monthly_fee   numeric,
  p_ad_budget     numeric,
  p_page_ids      uuid[],
  p_notes         text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_bad integer;
begin
  if not public.is_management() then
    raise exception 'ไม่มีสิทธิ์สร้างสัญญา' using errcode = '42501';
  end if;
  if coalesce(array_length(p_page_ids, 1), 0) = 0 then
    raise exception 'ต้องเลือกเพจอย่างน้อย 1 เพจ' using errcode = '22023';
  end if;
  select count(*) into v_bad from unnest(p_page_ids) pid
   where not exists (select 1 from public.pages pg where pg.id = pid and pg.customer_id = p_customer_id);
  if v_bad > 0 then
    raise exception 'เพจที่เลือกไม่ได้เป็นของลูกค้ารายนี้' using errcode = '22023';
  end if;

  insert into public.contracts (customer_id, service_type, start_date, duration_days, status, notes)
  values (p_customer_id, p_service_type, p_start_date, coalesce(p_duration_days, 30),
          case when p_start_date <= public.bangkok_today() then 'active' else 'pending_start' end::public.contract_status,
          p_notes)
  returning id into v_id;

  insert into public.contract_pages (contract_id, page_id) select v_id, unnest(p_page_ids);
  insert into public.contract_financials (contract_id, cycle_no, monthly_fee, ad_budget)
  values (v_id, 1, coalesce(p_monthly_fee, 0), coalesce(p_ad_budget, 0));

  perform public.refresh_contract_statuses();
  return v_id;
end $$;

-- ต่อสัญญา: เก็บรอบเดิมใน contract_renewals, เปิดรอบใหม่ (ค่าเริ่มต้น = ต่อจากวันสิ้นสุดเดิม +1 วัน)
create function public.renew_contract(
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
  v_new_start date;
  v_dur integer;
  v_cycle integer;
  v_fee numeric;
  v_budget numeric;
  v_renewal uuid;
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

  insert into public.contract_renewals
    (contract_id, cycle_no, previous_start_date, previous_end_date, new_start_date, new_end_date, notes)
  values (c.id, v_cycle, c.start_date, c.end_date, v_new_start, v_new_start + (v_dur - 1), p_notes)
  returning id into v_renewal;

  insert into public.contract_financials (contract_id, cycle_no, monthly_fee, ad_budget)
  values (c.id, v_cycle, v_fee, v_budget);

  update public.contracts
     set start_date = v_new_start, duration_days = v_dur, cycle_no = v_cycle,
         status = case when v_new_start <= public.bangkok_today() then 'renewed' else 'pending_start' end::public.contract_status
   where id = c.id;

  perform public.refresh_contract_statuses();
  return v_renewal;
end $$;

-- อัปเดตสถานะตามวันที่จริง (เขตเวลา Bangkok): เรียกจากหน้าเว็บ และ pg_cron ใน Phase 4
-- เริ่มแล้ว -> กำลังดูแล | เหลือ <= 7 วัน -> ใกล้หมดสัญญา | เกินวันสิ้นสุด -> หมดสัญญา
create function public.refresh_contract_statuses() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := public.bangkok_today();
  v_n integer := 0;
  v_k integer;
begin
  if auth.uid() is not null and not public.is_management() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;

  update public.contracts set status = 'expired'
   where status in ('pending_start', 'active', 'expiring', 'renewed') and end_date < v_today;
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  update public.contracts set status = 'active'
   where status = 'pending_start' and start_date <= v_today and end_date >= v_today;
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  update public.contracts set status = 'expiring'
   where status in ('active', 'renewed') and end_date >= v_today and end_date - v_today <= 7;
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  return v_n;
end $$;

revoke all on function public.bangkok_today(), public.create_contract(uuid, text, date, integer, numeric, numeric, uuid[], text),
  public.renew_contract(uuid, date, integer, numeric, numeric, text), public.refresh_contract_statuses() from public, anon;
grant execute on function public.bangkok_today(), public.create_contract(uuid, text, date, integer, numeric, numeric, uuid[], text),
  public.renew_contract(uuid, date, integer, numeric, numeric, text), public.refresh_contract_statuses() to authenticated;
