-- ============================================================================
-- Migration 0005 (Phase 5): Dashboard + รายงาน
-- ฟังก์ชันทั้งหมดเป็น SECURITY INVOKER: RLS ของผู้เรียกบังคับใช้ตามปกติ
--   -> Page Admin เห็นตัวเลขเฉพาะเพจ/ลูกค้า/งานของตน, รายได้เห็นได้เฉพาะผู้ที่ได้รับอนุญาต
-- นิยามสำคัญ
--   รอบสัญญา (cycle)  = 1 รอบต่ออายุ; รายได้นับตามเดือนที่ "รอบสัญญาเริ่ม"
--   ไม่ต่อสัญญา      = รอบสุดท้ายที่สิ้นสุดแล้วในช่วงที่เลือกและไม่มีรอบถัดไป หรือยกเลิกบริการในช่วงนั้น
--   อัตรารักษาลูกค้า  = รอบที่สิ้นสุดแล้วและต่อ ÷ (รอบที่สิ้นสุดแล้วและต่อ + ไม่ต่อสัญญา)
-- ============================================================================

create view public.contract_cycles with (security_invoker = true) as
select c.id as contract_id, c.customer_id, c.contract_no, g.k as cycle_no,
       case when g.k = c.cycle_no then c.start_date else pr.previous_start_date end as start_date,
       case when g.k = c.cycle_no then c.end_date   else pr.previous_end_date   end as end_date,
       (g.k < c.cycle_no) as renewed_after,
       c.status, c.cancelled_at, c.cancel_reason,
       f.monthly_fee, f.ad_budget
  from public.contracts c
 cross join lateral generate_series(1, c.cycle_no) as g (k)
  left join public.contract_renewals pr on pr.contract_id = c.id and pr.cycle_no = g.k + 1
  left join public.contract_financials f on f.contract_id = c.id and f.cycle_no = g.k;

grant select on public.contract_cycles to authenticated;
revoke all on public.contract_cycles from anon;

create function public.dashboard_summary(p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_today date := public.bangkok_today();
  v_rev boolean := public.can_view_revenue();
  v_chart_from date;
  v_res jsonb;
  v_months jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'ช่วงวันที่ไม่ถูกต้อง' using errcode = '22023';
  end if;
  if p_to - p_from > 1100 then
    raise exception 'เลือกช่วงวันที่ได้ไม่เกิน 3 ปี' using errcode = '22023';
  end if;
  v_chart_from := least(date_trunc('month', p_from)::date, (date_trunc('month', p_to) - interval '5 months')::date);

  select coalesce(jsonb_agg(row_to_json(m) order by m.month), '[]'::jsonb) into v_months
  from (
    select to_char(ms, 'YYYY-MM') as month,
      (select count(*) from public.customers where started_at between ms and me) as new_customers,
      (select count(*) from (select cp.page_id, min(cy.start_date) fs
                               from public.contract_pages cp
                               join public.contract_cycles cy on cy.contract_id = cp.contract_id and cy.cycle_no = 1
                              group by cp.page_id) x where x.fs between ms and me) as new_pages,
      (select count(*) from public.contract_renewals where (renewed_at at time zone 'Asia/Bangkok')::date between ms and me) as renewed,
      (select count(distinct contract_id) from public.contract_cycles
        where not renewed_after
          and ((end_date between ms and least(me, v_today - 1)) or (cancelled_at between ms and me))) as lost,
      case when v_rev then (select coalesce(sum(monthly_fee), 0) from public.contract_cycles where start_date between ms and me) end as revenue
    from (select d::date as ms, (d + interval '1 month' - interval '1 day')::date as me
            from generate_series(v_chart_from, date_trunc('month', p_to)::date, interval '1 month') d) mm
  ) m;

  select jsonb_build_object(
    'customers_total', (select count(*) from public.customers),
    'pages_active',    (select count(*) from public.pages where status = 'active'),
    'pages_new',       (select count(*) from (select cp.page_id, min(cy.start_date) fs
                                                from public.contract_pages cp
                                                join public.contract_cycles cy on cy.contract_id = cp.contract_id and cy.cycle_no = 1
                                               group by cp.page_id) x where x.fs between p_from and p_to),
    'contracts_expiring', (select count(*) from public.contracts
                            where status not in ('cancelled', 'expired') and end_date between v_today and v_today + 7),
    'contracts_renewed',  (select count(*) from public.contract_renewals
                            where (renewed_at at time zone 'Asia/Bangkok')::date between p_from and p_to),
    'contracts_lost',     (select count(distinct contract_id) from public.contract_cycles
                            where not renewed_after
                              and ((end_date between p_from and least(p_to, v_today - 1)) or (cancelled_at between p_from and p_to))),
    'revenue',         case when v_rev then (select coalesce(sum(monthly_fee), 0) from public.contract_cycles where start_date between p_from and p_to) end,
    'staff_active',    case when public.is_management() then (select count(*) from public.profiles where status = 'active') end,
    'tasks_open',      (select count(*) from public.tasks where status <> 'done'),
    'tasks_overdue',   (select count(*) from public.tasks where status <> 'done' and due_date < v_today),
    'briefs_pending',  (select count(*) from public.customer_briefs where status in ('new', 'in_review')),
    'monthly',         v_months
  ) into v_res;
  return v_res;
end $$;

-- รายงานสำหรับ Owner/Manager
create function public.report_data(p_from date, p_to date) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_today date := public.bangkok_today();
  v_sum jsonb;
  v_ended int; v_ended_renewed int; v_lost int;
  v_rate numeric;
begin
  if not public.is_management() then
    raise exception 'ไม่มีสิทธิ์ดูรายงาน' using errcode = '42501';
  end if;
  v_sum := public.dashboard_summary(p_from, p_to);

  select count(*) filter (where renewed_after), count(*) into v_ended_renewed, v_ended
    from public.contract_cycles where end_date between p_from and least(p_to, v_today - 1);
  v_lost := (v_sum ->> 'contracts_lost')::int;
  v_rate := case when v_ended_renewed + v_lost > 0 then round(100.0 * v_ended_renewed / (v_ended_renewed + v_lost), 1) end;

  return jsonb_build_object(
    'summary', v_sum,
    'retention', jsonb_build_object('renewed', v_ended_renewed, 'lost', v_lost, 'rate', v_rate),
    'staff_pages', (select coalesce(jsonb_agg(jsonb_build_object('staff', s.full_name, 'code', s.employee_code, 'pages', s.n) order by s.n desc, s.full_name), '[]'::jsonb)
                      from (select p.full_name, p.employee_code,
                                   (select count(*) from public.page_assignments pa join public.pages pg on pg.id = pa.page_id
                                     where pa.staff_id = p.id and pg.status = 'active') as n
                              from public.profiles p where p.status = 'active') s),
    'staff_tasks', (select coalesce(jsonb_agg(jsonb_build_object('staff', s.full_name, 'done', s.done, 'overdue', s.overdue, 'open', s.open) order by s.done desc, s.full_name), '[]'::jsonb)
                      from (select p.full_name,
                                   (select count(*) from public.tasks t where t.assignee_id = p.id and t.status = 'done'
                                       and (t.completed_at at time zone 'Asia/Bangkok')::date between p_from and p_to) as done,
                                   (select count(*) from public.tasks t where t.assignee_id = p.id and t.status <> 'done' and t.due_date < v_today) as overdue,
                                   (select count(*) from public.tasks t where t.assignee_id = p.id and t.status <> 'done') as open
                              from public.profiles p where p.status = 'active') s),
    'cancel_reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n) order by r.n desc, r.reason), '[]'::jsonb)
                         from (select coalesce(nullif(trim(cancel_reason), ''), '(ไม่ระบุ)') as reason, count(distinct contract_id) as n
                                 from public.contract_cycles
                                where status = 'cancelled' and not renewed_after and cancelled_at between p_from and p_to
                                group by 1) r),
    'renewed_list', (select coalesce(jsonb_agg(x order by x.renewed_on), '[]'::jsonb)
                       from (select c.contract_no, cu.business_name as customer, r.cycle_no, r.new_start_date, r.new_end_date,
                                    (r.renewed_at at time zone 'Asia/Bangkok')::date as renewed_on
                               from public.contract_renewals r join public.contracts c on c.id = r.contract_id
                               join public.customers cu on cu.id = c.customer_id
                              where (r.renewed_at at time zone 'Asia/Bangkok')::date between p_from and p_to) x),
    'lost_list', (select coalesce(jsonb_agg(x order by x.end_date), '[]'::jsonb)
                    from (select distinct on (cy.contract_id) cy.contract_no, cu.business_name as customer, cy.end_date, cy.cancelled_at, cy.status, cy.cancel_reason
                            from public.contract_cycles cy join public.customers cu on cu.id = cy.customer_id
                           where not cy.renewed_after
                             and ((cy.end_date between p_from and least(p_to, v_today - 1)) or (cy.cancelled_at between p_from and p_to))
                           order by cy.contract_id) x)
  );
end $$;

revoke all on function public.dashboard_summary(date, date), public.report_data(date, date) from public, anon;
grant execute on function public.dashboard_summary(date, date), public.report_data(date, date) to authenticated;
