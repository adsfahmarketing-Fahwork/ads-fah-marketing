-- ADS FAH CRM: รวม migration 0001-0006 (วางแล้ว Run ครั้งเดียว) — สร้างอัตโนมัติจากไฟล์ใน migrations/

-- ===== migrations/0001_foundation.sql =====
-- ============================================================================
-- ADS FAH CRM — Migration 0001: Foundation (Phase 1)
-- โครงสร้างฐานข้อมูลทั้งหมด + Row Level Security + Audit + Trigger
-- เขตเวลาระบบ: Asia/Bangkok
-- ============================================================================

alter database postgres set timezone to 'Asia/Bangkok';
set timezone to 'Asia/Bangkok';

-- ---------------------------------------------------------------- ENUMS ----
create type public.user_role         as enum ('owner', 'manager', 'page_admin');
create type public.staff_status      as enum ('active', 'inactive');
create type public.customer_status   as enum ('lead', 'active', 'paused', 'churned');
create type public.platform_type     as enum ('facebook', 'instagram');
create type public.page_status       as enum ('active', 'paused', 'ended');
create type public.contract_status   as enum ('pending_start', 'active', 'expiring', 'expired', 'renewed', 'cancelled');
create type public.task_status       as enum ('todo', 'in_progress', 'in_review', 'done', 'overdue');
create type public.task_priority     as enum ('low', 'medium', 'high', 'urgent');
create type public.brief_status      as enum ('new', 'in_review', 'reviewed');
create type public.notification_type as enum (
  'brief_submitted', 'page_assigned', 'assignee_changed', 'contract_expiring',
  'contract_expired', 'contract_renewed', 'task_overdue', 'task_status_changed'
);

-- ------------------------------------------------------------ SEQUENCES ----
create sequence public.employee_code_seq start 1;
create sequence public.customer_code_seq start 1;
create sequence public.contract_no_seq   start 1;

-- --------------------------------------------------------------- TABLES ----

-- 1) profiles — บัญชีผู้ใช้งาน (พนักงาน) ผูกกับ auth.users
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  employee_code    text not null unique
                     default ('E-' || lpad(nextval('public.employee_code_seq')::text, 4, '0')),
  full_name        text not null default '',
  job_title        text,
  email            text not null,
  phone            text,
  role             public.user_role not null default 'page_admin',
  status           public.staff_status not null default 'active',
  can_view_revenue boolean not null default false,   -- Owner อนุญาตให้ Manager ดูรายได้
  start_date       date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint profiles_email_lower check (email = lower(email)),
  constraint profiles_phone_fmt   check (phone is null or phone ~ '^[0-9+\-\s()]{6,20}$')
);
create index profiles_role_idx   on public.profiles (role);
create index profiles_status_idx on public.profiles (status);

-- 2) customers — ข้อมูลลูกค้า (1 ลูกค้า มีได้หลายเพจ)
create table public.customers (
  id             uuid primary key default gen_random_uuid(),
  customer_code  text not null unique
                   default ('C-' || lpad(nextval('public.customer_code_seq')::text, 5, '0')),
  business_name  text not null check (char_length(business_name) between 1 and 200),
  contact_name   text check (char_length(contact_name) <= 200),
  phone          text check (phone is null or phone ~ '^[0-9+\-\s()]{6,20}$'),
  line_id        text check (char_length(line_id) <= 100),
  email          text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  business_type  text check (char_length(business_type) <= 200),
  started_at     date not null default current_date,
  status         public.customer_status not null default 'active',
  notes          text check (char_length(notes) <= 5000),
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index customers_name_idx   on public.customers (lower(business_name));
create index customers_phone_idx  on public.customers (phone);
create index customers_status_idx on public.customers (status);

-- 3) pages — เพจ Facebook / Instagram ที่บริษัทดูแล
create table public.pages (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers (id) on delete restrict,
  platform      public.platform_type not null default 'facebook',
  page_name     text not null check (char_length(page_name) between 1 and 200),
  page_url      text check (page_url is null or page_url ~* '^https?://'),
  instagram_url text check (instagram_url is null or instagram_url ~* '^https?://'),
  status        public.page_status not null default 'active',
  notes         text check (char_length(notes) <= 5000),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (customer_id, page_name)
);
create index pages_customer_idx on public.pages (customer_id);
create index pages_name_idx     on public.pages (lower(page_name));
create index pages_status_idx   on public.pages (status);

-- 4) contracts — สัญญา (1 แถว = รอบสัญญาปัจจุบัน; รอบเก่าเก็บใน contract_renewals)
--    ตัวเลขเงินแยกไป contract_financials เพื่อซ่อนจาก Page Admin ระดับฐานข้อมูล
create table public.contracts (
  id            uuid primary key default gen_random_uuid(),
  contract_no   text not null unique
                  default ('CT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.contract_no_seq')::text, 4, '0')),
  customer_id   uuid not null references public.customers (id) on delete restrict,
  service_type  text not null check (char_length(service_type) between 1 and 200),
  start_date    date not null,
  duration_days integer not null default 30 check (duration_days between 1 and 3650),
  -- 30 วันปฏิทิน นับวันเริ่มเป็นวันแรก: เริ่ม 1 ธ.ค. -> สิ้นสุด 30 ธ.ค.
  end_date      date generated always as (start_date + (duration_days - 1)) stored,
  status        public.contract_status not null default 'pending_start',
  cycle_no      integer not null default 1 check (cycle_no >= 1),
  cancel_reason text check (char_length(cancel_reason) <= 2000),
  cancelled_at  date,
  notes         text check (char_length(notes) <= 5000),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint contracts_cancel_info check (status <> 'cancelled' or (cancelled_at is not null and cancel_reason is not null))
);
create index contracts_customer_idx on public.contracts (customer_id);
create index contracts_status_idx   on public.contracts (status);
create index contracts_end_date_idx on public.contracts (end_date);

create table public.contract_pages (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  page_id     uuid not null references public.pages (id) on delete restrict,
  primary key (contract_id, page_id)
);
create index contract_pages_page_idx on public.contract_pages (page_id);

create table public.contract_financials (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  cycle_no    integer not null check (cycle_no >= 1),
  monthly_fee numeric(12, 2) not null check (monthly_fee >= 0),
  ad_budget   numeric(12, 2) not null default 0 check (ad_budget >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (contract_id, cycle_no)
);

-- 5) contract_renewals — ประวัติการต่อสัญญา (แก้ไข/ลบไม่ได้)
create table public.contract_renewals (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references public.contracts (id) on delete cascade,
  cycle_no            integer not null check (cycle_no >= 2),
  previous_start_date date not null,
  previous_end_date   date not null,
  new_start_date      date not null,
  new_end_date        date not null,
  renewed_by          uuid references public.profiles (id) on delete set null default auth.uid(),
  renewed_at          timestamptz not null default now(),
  notes               text check (char_length(notes) <= 2000),
  unique (contract_id, cycle_no),
  check (new_end_date >= new_start_date)
);

-- 6) page_assignments — มอบหมายเพจ (พนักงาน 1 คน หลายเพจ / เพจ 1 เพจ หลายคน)
create table public.page_assignments (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.pages (id) on delete cascade,
  staff_id    uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now(),
  unique (page_id, staff_id)
);
create index page_assignments_staff_idx on public.page_assignments (staff_id);

-- 7) brief_links — ลิงก์รับ Brief (เก็บเฉพาะ hash ของ token)
create table public.brief_links (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers (id) on delete cascade,
  page_id           uuid references public.pages (id) on delete cascade,
  label             text check (char_length(label) <= 200),
  token_hash        text not null unique,
  expires_at        timestamptz not null,
  revoked_at        timestamptz,
  max_submissions   integer not null default 5 check (max_submissions between 1 and 50),
  submission_count  integer not null default 0 check (submission_count >= 0),
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);
create index brief_links_customer_idx on public.brief_links (customer_id);

-- 8) customer_briefs — ข้อมูล Brief ที่ลูกค้ากรอก
create table public.customer_briefs (
  id                  uuid primary key default gen_random_uuid(),
  brief_link_id       uuid references public.brief_links (id) on delete set null,
  customer_id         uuid not null references public.customers (id) on delete cascade,
  page_id             uuid references public.pages (id) on delete set null,
  status              public.brief_status not null default 'new',
  version             integer not null default 1,
  submitted_at        timestamptz not null default now(),
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  -- ส่วนที่ 1 ข้อมูลธุรกิจ
  business_name       text not null check (char_length(business_name) between 1 and 200),
  contact_name        text not null check (char_length(contact_name) between 1 and 200),
  phone               text not null check (phone ~ '^[0-9+\-\s()]{6,20}$'),
  line_id             text check (char_length(line_id) <= 100),
  fb_page_name        text check (char_length(fb_page_name) <= 200),
  fb_page_url         text check (fb_page_url is null or fb_page_url ~* '^https?://'),
  instagram_url       text check (instagram_url is null or instagram_url ~* '^https?://'),
  product_category    text check (char_length(product_category) <= 500),
  -- ส่วนที่ 2 ข้อมูลสำหรับยิงโฆษณา
  ad_budget_monthly   numeric(12, 2) check (ad_budget_monthly is null or ad_budget_monthly >= 0),
  age_min             integer check (age_min is null or age_min between 13 and 100),
  age_max             integer check (age_max is null or age_max between 13 and 100),
  provinces           text[] not null default '{}',
  target_audience     text check (char_length(target_audience) <= 3000),
  ad_objective        text check (char_length(ad_objective) <= 1000),
  promote_items       text check (char_length(promote_items) <= 3000),
  current_promotion   text check (char_length(current_promotion) <= 3000),
  contact_link        text check (contact_link is null or char_length(contact_link) <= 500),
  extra_details       text check (char_length(extra_details) <= 5000),
  internal_notes      text check (char_length(internal_notes) <= 5000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);
create index customer_briefs_customer_idx on public.customer_briefs (customer_id);
create index customer_briefs_page_idx     on public.customer_briefs (page_id);
create index customer_briefs_status_idx   on public.customer_briefs (status);

-- ตารางจำกัดอัตราการส่งฟอร์ม (ใช้ผ่าน RPC เท่านั้น — Phase 3)
create table public.brief_submit_attempts (
  id         uuid primary key default gen_random_uuid(),
  token_hash text,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index brief_submit_attempts_ip_idx on public.brief_submit_attempts (ip_hash, created_at desc);

-- 9) tasks
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 300),
  description  text check (char_length(description) <= 5000),
  page_id      uuid references public.pages (id) on delete set null,
  assignee_id  uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  due_date     date,
  priority     public.task_priority not null default 'medium',
  status       public.task_status not null default 'todo',
  notes        text check (char_length(notes) <= 5000),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_page_idx     on public.tasks (page_id);
create index tasks_status_idx   on public.tasks (status);
create index tasks_due_idx      on public.tasks (due_date);

-- 10) task_comments — บันทึก/หมายเหตุ (เพิ่มได้อย่างเดียว เป็นประวัติการอัปเดต)
create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null default auth.uid(),
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

-- 11) notifications
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type         public.notification_type not null,
  title        text not null,
  body         text,
  entity_type  text,
  entity_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, read_at, created_at desc);

-- 12) attachments — ไฟล์แนบ (ไฟล์จริงอยู่ใน Supabase Storage)
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('brief', 'task', 'page', 'customer', 'contract')),
  entity_id    uuid not null,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) <= 255),
  mime_type    text,
  size_bytes   bigint not null check (size_bytes between 0 and 52428800),
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);

-- 13) audit_logs — ประวัติการดำเนินการ (เขียนโดย trigger เท่านั้น)
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  table_name text not null,
  record_id  uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_record_idx  on public.audit_logs (table_name, record_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- -------------------------------------------------- HELPER FUNCTIONS (RLS) --
-- security definer + search_path ว่าง: ป้องกัน RLS วนซ้ำและ search_path hijack

create function public.app_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.status = 'active'
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.app_role() is not null
$$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() = 'owner', false)
$$;

create function public.is_management() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('owner', 'manager'), false)
$$;

create function public.can_view_revenue() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
      and (p.role = 'owner' or (p.role = 'manager' and p.can_view_revenue))
  )
$$;

create function public.is_assigned_to_page(p_page uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.page_assignments pa
    join public.profiles pr on pr.id = pa.staff_id and pr.status = 'active'
    where pa.page_id = p_page and pa.staff_id = auth.uid()
  )
$$;

create function public.can_access_page(p_page uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_management() or public.is_assigned_to_page(p_page)
$$;

create function public.can_access_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_management() or exists (
    select 1 from public.pages pg
    join public.page_assignments pa on pa.page_id = pg.id
    where pg.customer_id = p_customer and pa.staff_id = auth.uid() and public.is_staff()
  )
$$;

create function public.can_access_contract(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_management() or exists (
    select 1 from public.contract_pages cp
    join public.page_assignments pa on pa.page_id = cp.page_id
    where cp.contract_id = p_contract and pa.staff_id = auth.uid() and public.is_staff()
  )
$$;

create function public.can_access_task(p_task uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_management() or exists (
    select 1 from public.tasks t
    where t.id = p_task and t.assignee_id = auth.uid() and public.is_staff()
  )
$$;

create function public.can_access_entity(p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'page'     then public.can_access_page(p_id)
    when 'customer' then public.can_access_customer(p_id)
    when 'contract' then public.can_access_contract(p_id)
    when 'task'     then public.can_access_task(p_id)
    when 'brief'    then exists (select 1 from public.customer_briefs b
                                 where b.id = p_id and public.can_access_page(b.page_id))
    else false
  end
$$;

-- ----------------------------------------------------------- TRIGGERS ------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- สร้าง profile อัตโนมัติเมื่อมี auth user ใหม่
-- role มาจาก app_metadata (ตั้งได้เฉพาะ service role / Dashboard) ไม่ใช่ user_metadata
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(nullif(new.raw_app_meta_data ->> 'role', ''), 'page_admin')::public.user_role
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- กันการยกระดับสิทธิ์ตนเอง + ต้องเหลือ Owner ที่ active อย่างน้อย 1 คน
create function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_owner() then
    if new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.can_view_revenue is distinct from old.can_view_revenue
       or new.email is distinct from old.email
       or new.employee_code is distinct from old.employee_code
       or new.id is distinct from old.id then
      raise exception 'ไม่มีสิทธิ์แก้ไขข้อมูลสิทธิ์/สถานะของบัญชี' using errcode = '42501';
    end if;
  end if;

  if old.role = 'owner' and old.status = 'active'
     and (new.role <> 'owner' or new.status <> 'active')
     and not exists (select 1 from public.profiles p
                     where p.role = 'owner' and p.status = 'active' and p.id <> old.id) then
    raise exception 'ต้องมี Owner ที่ใช้งานอยู่อย่างน้อย 1 คน' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Page Admin แก้ได้เฉพาะสถานะ/หมายเหตุของงานที่ตนรับผิดชอบ
create function public.guard_task_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_management() then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.page_id is distinct from old.page_id
       or new.assignee_id is distinct from old.assignee_id
       or new.created_by is distinct from old.created_by
       or new.due_date is distinct from old.due_date
       or new.priority is distinct from old.priority then
      raise exception 'พนักงานแก้ไขได้เฉพาะสถานะและหมายเหตุของงาน' using errcode = '42501';
    end if;
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger tasks_guard before update on public.tasks
  for each row execute function public.guard_task_update();

-- updated_at
create trigger t_profiles_upd  before update on public.profiles            for each row execute function public.set_updated_at();
create trigger t_customers_upd before update on public.customers           for each row execute function public.set_updated_at();
create trigger t_pages_upd     before update on public.pages               for each row execute function public.set_updated_at();
create trigger t_contracts_upd before update on public.contracts           for each row execute function public.set_updated_at();
create trigger t_fin_upd       before update on public.contract_financials for each row execute function public.set_updated_at();
create trigger t_briefs_upd    before update on public.customer_briefs     for each row execute function public.set_updated_at();
create trigger t_tasks_upd     before update on public.tasks               for each row execute function public.set_updated_at();

-- Audit log (ตัด token_hash ออกจากข้อมูลที่บันทึก)
create function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_j jsonb;
  new_j jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then old_j := to_jsonb(old) - 'token_hash'; end if;
  if tg_op in ('INSERT', 'UPDATE') then new_j := to_jsonb(new) - 'token_hash'; end if;
  if tg_op = 'UPDATE' and old_j = new_j then return null; end if;
  insert into public.audit_logs (actor_id, action, table_name, record_id, old_data, new_data)
  values (
    (select p.id from public.profiles p where p.id = auth.uid()),
    tg_op, tg_table_name,
    coalesce(new_j ->> 'id', old_j ->> 'id')::uuid,
    old_j, new_j
  );
  return null;
end $$;

create trigger a_profiles  after insert or update or delete on public.profiles            for each row execute function public.audit_row();
create trigger a_customers after insert or update or delete on public.customers           for each row execute function public.audit_row();
create trigger a_pages     after insert or update or delete on public.pages               for each row execute function public.audit_row();
create trigger a_contracts after insert or update or delete on public.contracts           for each row execute function public.audit_row();
create trigger a_fin       after insert or update or delete on public.contract_financials for each row execute function public.audit_row();
create trigger a_renewals  after insert or update or delete on public.contract_renewals   for each row execute function public.audit_row();
create trigger a_assign    after insert or update or delete on public.page_assignments   for each row execute function public.audit_row();
create trigger a_links     after insert or update or delete on public.brief_links         for each row execute function public.audit_row();
create trigger a_briefs    after insert or update or delete on public.customer_briefs     for each row execute function public.audit_row();
create trigger a_tasks     after insert or update or delete on public.tasks               for each row execute function public.audit_row();

-- ------------------------------------------------ ROW LEVEL SECURITY -------
alter table public.profiles              enable row level security;
alter table public.customers             enable row level security;
alter table public.pages                 enable row level security;
alter table public.contracts             enable row level security;
alter table public.contract_pages        enable row level security;
alter table public.contract_financials   enable row level security;
alter table public.contract_renewals     enable row level security;
alter table public.page_assignments      enable row level security;
alter table public.brief_links           enable row level security;
alter table public.customer_briefs       enable row level security;
alter table public.brief_submit_attempts enable row level security;
alter table public.tasks                 enable row level security;
alter table public.task_comments         enable row level security;
alter table public.notifications         enable row level security;
alter table public.attachments           enable row level security;
alter table public.audit_logs            enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_management()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_owner()))
  with check (id = (select auth.uid()) or (select public.is_owner()));
-- (ไม่มี insert/delete policy: สร้าง/ลบบัญชีผ่าน service role เท่านั้น)

-- customers
create policy customers_select on public.customers for select to authenticated
  using ((select public.can_access_customer(id)));
create policy customers_insert on public.customers for insert to authenticated
  with check ((select public.is_management()));
create policy customers_update on public.customers for update to authenticated
  using ((select public.is_management())) with check ((select public.is_management()));
create policy customers_delete on public.customers for delete to authenticated
  using ((select public.is_owner()));

-- pages
create policy pages_select on public.pages for select to authenticated
  using ((select public.can_access_page(id)));
create policy pages_insert on public.pages for insert to authenticated
  with check ((select public.is_management()));
create policy pages_update on public.pages for update to authenticated
  using ((select public.is_management())) with check ((select public.is_management()));
create policy pages_delete on public.pages for delete to authenticated
  using ((select public.is_owner()));

-- contracts
create policy contracts_select on public.contracts for select to authenticated
  using ((select public.can_access_contract(id)));
create policy contracts_insert on public.contracts for insert to authenticated
  with check ((select public.is_management()));
create policy contracts_update on public.contracts for update to authenticated
  using ((select public.is_management())) with check ((select public.is_management()));
create policy contracts_delete on public.contracts for delete to authenticated
  using ((select public.is_owner()));

create policy contract_pages_select on public.contract_pages for select to authenticated
  using ((select public.can_access_contract(contract_id)));
create policy contract_pages_write on public.contract_pages for all to authenticated
  using ((select public.is_management())) with check ((select public.is_management()));

-- ข้อมูลเงิน: เห็นได้เฉพาะ Owner และ Manager ที่ได้รับอนุญาต
create policy fin_select on public.contract_financials for select to authenticated
  using ((select public.can_view_revenue()));
create policy fin_insert on public.contract_financials for insert to authenticated
  with check ((select public.is_management()));
create policy fin_update on public.contract_financials for update to authenticated
  using ((select public.can_view_revenue())) with check ((select public.can_view_revenue()));
create policy fin_delete on public.contract_financials for delete to authenticated
  using ((select public.is_owner()));

create policy renewals_select on public.contract_renewals for select to authenticated
  using ((select public.can_access_contract(contract_id)));
create policy renewals_insert on public.contract_renewals for insert to authenticated
  with check ((select public.is_management()));

-- page_assignments
create policy assign_select on public.page_assignments for select to authenticated
  using (staff_id = (select auth.uid()) or (select public.is_management()));
create policy assign_write on public.page_assignments for all to authenticated
  using ((select public.is_management())) with check ((select public.is_management()));

-- brief_links (Owner/Manager เท่านั้น; ลูกค้าใช้ผ่าน RPC ใน Phase 3)
create policy links_select on public.brief_links for select to authenticated
  using ((select public.is_management()));
create policy links_insert on public.brief_links for insert to authenticated
  with check ((select public.is_management()));
create policy links_update on public.brief_links for update to authenticated
  using ((select public.is_management())) with check ((select public.is_management()));

-- customer_briefs (insert ผ่าน RPC เท่านั้น)
create policy briefs_select on public.customer_briefs for select to authenticated
  using ((select public.can_access_page(page_id)));
create policy briefs_update on public.customer_briefs for update to authenticated
  using ((select public.can_access_page(page_id))) with check ((select public.can_access_page(page_id)));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using ((select public.can_access_task(id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check ((select public.is_management()));
create policy tasks_update on public.tasks for update to authenticated
  using ((select public.can_access_task(id))) with check ((select public.can_access_task(id)));
create policy tasks_delete on public.tasks for delete to authenticated
  using ((select public.is_management()));

create policy comments_select on public.task_comments for select to authenticated
  using ((select public.can_access_task(task_id)));
create policy comments_insert on public.task_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.can_access_task(task_id)));

-- notifications (เห็น/อ่านได้เฉพาะของตนเอง)
create policy notif_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notif_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- attachments
create policy attach_select on public.attachments for select to authenticated
  using ((select public.can_access_entity(entity_type, entity_id)));
create policy attach_insert on public.attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (select public.can_access_entity(entity_type, entity_id)));
create policy attach_delete on public.attachments for delete to authenticated
  using ((select public.is_management()));

-- audit_logs: Owner อ่านได้อย่างเดียว
create policy audit_select on public.audit_logs for select to authenticated
  using ((select public.is_owner()));

-- brief_submit_attempts: ไม่มี policy = ไม่มีใครเข้าถึงได้นอกจาก service role / security definer RPC

-- รายชื่อพนักงานแบบย่อ (ชื่อ/ตำแหน่ง) สำหรับแสดงชื่อผู้รับผิดชอบ ให้พนักงานทุกคนเห็น
create view public.staff_directory as
  select id, full_name, job_title, role
  from public.profiles
  where status = 'active' and public.is_staff();

-- ------------------------------------------------------------ PRIVILEGES ---
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon, public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ตารางที่แก้ไขไม่ได้ / จำกัดคอลัมน์
revoke insert, update, delete on public.audit_logs        from authenticated;
revoke update, delete         on public.task_comments     from authenticated;
revoke update, delete         on public.contract_renewals from authenticated;
revoke all                    on public.brief_submit_attempts from authenticated;
revoke insert, delete         on public.profiles          from authenticated;
revoke insert, delete         on public.customer_briefs   from authenticated;
revoke update, insert, delete on public.notifications     from authenticated;
grant  update (read_at)       on public.notifications     to authenticated;
revoke delete                 on public.brief_links       from authenticated;

-- ===== migrations/0002_contract_functions.sql =====
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

-- ===== migrations/0003_assignments_briefs.sql =====
-- ============================================================================
-- Migration 0003 (Phase 3): มอบหมายเพจ, ลิงก์ Brief, ฟอร์มสาธารณะ (ผ่าน RPC), Storage
-- ============================================================================

-- ---------------------------------------------------------- notifications --
create function public.notify(
  p_recipient uuid, p_type public.notification_type, p_title text, p_body text, p_entity_type text, p_entity_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = p_recipient and status = 'active') then
    insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
    values (p_recipient, p_type, p_title, p_body, p_entity_type, p_entity_id);
  end if;
end $$;

create function public.trg_assignment_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if tg_op = 'INSERT' then
    select page_name into v_name from public.pages where id = new.page_id;
    perform public.notify(new.staff_id, 'page_assigned', 'คุณได้รับมอบหมายเพจใหม่', v_name, 'page', new.page_id);
  else
    select page_name into v_name from public.pages where id = old.page_id;
    if v_name is not null then   -- ข้ามกรณีเพจถูกลบ (cascade)
      perform public.notify(old.staff_id, 'assignee_changed', 'คุณไม่ได้รับผิดชอบเพจนี้แล้ว', v_name, 'page', old.page_id);
    end if;
  end if;
  return null;
end $$;

create trigger assignment_notify_ins after insert on public.page_assignments for each row execute function public.trg_assignment_notify();
create trigger assignment_notify_del after delete on public.page_assignments for each row execute function public.trg_assignment_notify();

-- แทนที่ชุดผู้รับผิดชอบของเพจแบบ atomic (Owner/Manager เท่านั้น)
create function public.set_page_assignments(p_page_id uuid, p_staff_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_management() then
    raise exception 'ไม่มีสิทธิ์มอบหมายเพจ' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pages where id = p_page_id) then
    raise exception 'ไม่พบเพจ' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(p_staff_ids) s
             where not exists (select 1 from public.profiles p where p.id = s and p.status = 'active')) then
    raise exception 'เลือกพนักงานที่ปิดใช้งานหรือไม่มีอยู่ในระบบไม่ได้' using errcode = '22023';
  end if;
  delete from public.page_assignments where page_id = p_page_id and staff_id <> all (coalesce(p_staff_ids, '{}'));
  insert into public.page_assignments (page_id, staff_id)
    select p_page_id, s from unnest(coalesce(p_staff_ids, '{}')) s on conflict do nothing;
end $$;

-- ------------------------------------------------------------ brief links --
create function public.brief_token_hash(p_token text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p_token, 'UTF8')), 'hex') $$;

-- สร้างลิงก์: token สุ่ม ~244 bit คืนค่าครั้งเดียว เก็บเฉพาะ hash
create function public.create_brief_link(
  p_customer_id uuid, p_page_id uuid, p_label text default null, p_expires_days integer default 14, p_max_submissions integer default 5
) returns table (link_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_id uuid;
begin
  if not public.is_management() then
    raise exception 'ไม่มีสิทธิ์สร้างลิงก์ Brief' using errcode = '42501';
  end if;
  if p_expires_days is null or p_expires_days not between 1 and 90 then
    raise exception 'วันหมดอายุต้องอยู่ระหว่าง 1–90 วัน' using errcode = '22023';
  end if;
  if p_page_id is null or not exists (select 1 from public.pages where id = p_page_id and customer_id = p_customer_id) then
    raise exception 'ต้องเลือกเพจของลูกค้ารายนี้' using errcode = '22023';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.brief_links (customer_id, page_id, label, token_hash, expires_at, max_submissions)
  values (p_customer_id, p_page_id, nullif(trim(p_label), ''), public.brief_token_hash(v_token),
          now() + make_interval(days => p_expires_days), coalesce(p_max_submissions, 5))
  returning id into v_id;
  return query select v_id, v_token;
end $$;

-- ตรวจสถานะลิงก์ (ใช้ร่วมกันใน info / submit / storage)
create function public.brief_link_state(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when l.id is null then 'not_found'
    when l.revoked_at is not null then 'revoked'
    when l.expires_at <= now() then 'expired'
    when l.submission_count >= l.max_submissions then 'used_up'
    else 'ok' end
  from (select 1) x left join public.brief_links l on l.id = p_id
$$;

-- ลูกค้า (anon): ดูว่าลิงก์ใช้ได้ไหม + ชื่อธุรกิจ/เพจเพื่อแสดงในฟอร์ม
create function public.get_brief_link_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.brief_links%rowtype; v_state text;
begin
  select * into l from public.brief_links where token_hash = public.brief_token_hash(coalesce(p_token, ''));
  if not found then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  v_state := public.brief_link_state(l.id);
  if v_state <> 'ok' then return jsonb_build_object('valid', false, 'reason', v_state); end if;
  return jsonb_build_object(
    'valid', true, 'link_id', l.id,
    'business_name', (select business_name from public.customers where id = l.customer_id),
    'page_name', (select page_name from public.pages where id = l.page_id));
end $$;

-- ส่ง Brief จากลูกค้า: ตรวจข้อมูล + จำกัดอัตรา + บันทึก + แจ้งเตือน (atomic)
create function public.submit_brief(p_token text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.brief_links%rowtype;
  v_hash text := public.brief_token_hash(coalesce(p_token, ''));
  v_state text;
  v_id uuid;
  v_biz text; v_contact text; v_phone text;
  v_age_min int; v_age_max int; v_budget numeric;
  v_prov text[];
  v_files jsonb; v_f jsonb; v_prefix text;
  v_page_name text;
  v_found boolean;
  r record;
begin
  -- จำกัดอัตราทั้งระบบ (กันถูกยิงถล่ม) และเก็บบันทึกความพยายาม
  if (select count(*) from public.brief_submit_attempts where created_at > now() - interval '10 minutes') > 300 then
    raise exception 'ระบบมีผู้ใช้งานจำนวนมาก กรุณาลองใหม่ภายหลัง' using errcode = '54000';
  end if;
  select * into l from public.brief_links where token_hash = v_hash for update;
  v_found := found;
  insert into public.brief_submit_attempts (token_hash) values (case when v_found then v_hash end);
  if not v_found then raise exception 'ลิงก์ไม่ถูกต้อง' using errcode = 'P0002'; end if;

  -- จำกัดต่อลิงก์: 10 ครั้ง / 10 นาที
  if (select count(*) from public.brief_submit_attempts where token_hash = v_hash and created_at > now() - interval '10 minutes') > 10 then
    raise exception 'ส่งข้อมูลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' using errcode = '54000';
  end if;

  v_state := public.brief_link_state(l.id);
  if v_state <> 'ok' then
    raise exception '%', case v_state
      when 'expired' then 'ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่'
      when 'revoked' then 'ลิงก์นี้ถูกยกเลิกการใช้งานแล้ว'
      when 'used_up' then 'ลิงก์นี้ถูกใช้ครบจำนวนครั้งที่กำหนดแล้ว'
      else 'ลิงก์ไม่ถูกต้อง' end using errcode = 'P0001';
  end if;

  -- honeypot: บอทกรอกช่องที่ซ่อนไว้ -> ตอบสำเร็จแต่ไม่บันทึก
  if coalesce(p_payload ->> 'website', '') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  v_biz := nullif(trim(p_payload ->> 'business_name'), '');
  v_contact := nullif(trim(p_payload ->> 'contact_name'), '');
  v_phone := nullif(trim(p_payload ->> 'phone'), '');
  if v_biz is null then raise exception 'กรุณากรอกชื่อธุรกิจ' using errcode = '22023'; end if;
  if v_contact is null then raise exception 'กรุณากรอกชื่อผู้ติดต่อ' using errcode = '22023'; end if;
  if v_phone is null or v_phone !~ '^[0-9+\-\s()]{6,20}$' then raise exception 'เบอร์โทรศัพท์ไม่ถูกต้อง' using errcode = '22023'; end if;

  begin
    v_age_min := nullif(p_payload ->> 'age_min', '')::int;
    v_age_max := nullif(p_payload ->> 'age_max', '')::int;
    v_budget := nullif(p_payload ->> 'ad_budget_monthly', '')::numeric;
  exception when others then
    raise exception 'ตัวเลขในฟอร์มไม่ถูกต้อง (อายุ/งบประมาณ)' using errcode = '22023';
  end;
  if v_age_min is not null and v_age_min not between 13 and 100 or v_age_max is not null and v_age_max not between 13 and 100 then
    raise exception 'ช่วงอายุต้องอยู่ระหว่าง 13–100 ปี' using errcode = '22023';
  end if;
  if v_age_min is not null and v_age_max is not null and v_age_min > v_age_max then
    raise exception 'ช่วงอายุไม่ถูกต้อง' using errcode = '22023';
  end if;
  if v_budget is not null and (v_budget < 0 or v_budget > 100000000) then
    raise exception 'งบประมาณไม่ถูกต้อง' using errcode = '22023';
  end if;
  if (p_payload ->> 'fb_page_url') ~ '\S' and (p_payload ->> 'fb_page_url') !~* '^https?://' then
    raise exception 'ลิงก์ Facebook Page ต้องขึ้นต้นด้วย http:// หรือ https://' using errcode = '22023';
  end if;
  if (p_payload ->> 'instagram_url') ~ '\S' and (p_payload ->> 'instagram_url') !~* '^https?://' then
    raise exception 'ลิงก์ Instagram ต้องขึ้นต้นด้วย http:// หรือ https://' using errcode = '22023';
  end if;

  select coalesce(array_agg(left(trim(x), 100)), '{}') into v_prov
    from (select jsonb_array_elements_text(case when jsonb_typeof(p_payload -> 'provinces') = 'array' then p_payload -> 'provinces' else '[]'::jsonb end) x limit 77) s
   where trim(x) <> '';

  begin
    insert into public.customer_briefs (
      brief_link_id, customer_id, page_id, version,
      business_name, contact_name, phone, line_id, fb_page_name, fb_page_url, instagram_url, product_category,
      ad_budget_monthly, age_min, age_max, provinces, target_audience, ad_objective, promote_items,
      current_promotion, contact_link, extra_details)
    values (
      l.id, l.customer_id, l.page_id, l.submission_count + 1,
      v_biz, v_contact, v_phone,
      nullif(trim(p_payload ->> 'line_id'), ''), nullif(trim(p_payload ->> 'fb_page_name'), ''),
      nullif(trim(p_payload ->> 'fb_page_url'), ''), nullif(trim(p_payload ->> 'instagram_url'), ''),
      nullif(trim(p_payload ->> 'product_category'), ''),
      v_budget, v_age_min, v_age_max, v_prov,
      nullif(trim(p_payload ->> 'target_audience'), ''), nullif(trim(p_payload ->> 'ad_objective'), ''),
      nullif(trim(p_payload ->> 'promote_items'), ''), nullif(trim(p_payload ->> 'current_promotion'), ''),
      nullif(trim(p_payload ->> 'contact_link'), ''), nullif(trim(p_payload ->> 'extra_details'), ''))
    returning id into v_id;
  exception when check_violation or string_data_right_truncation then
    raise exception 'ข้อมูลบางช่องยาวเกินกำหนดหรือรูปแบบไม่ถูกต้อง' using errcode = '22023';
  end;

  -- ไฟล์แนบ (อัปโหลดไป Storage แล้ว): ต้องอยู่ในโฟลเดอร์ของลิงก์นี้เท่านั้น
  v_files := case when jsonb_typeof(p_payload -> 'files') = 'array' then p_payload -> 'files' else '[]'::jsonb end;
  if jsonb_array_length(v_files) > 10 then raise exception 'แนบไฟล์ได้ไม่เกิน 10 ไฟล์' using errcode = '22023'; end if;
  v_prefix := 'links/' || l.id::text || '/';
  for v_f in select * from jsonb_array_elements(v_files) loop
    if left(coalesce(v_f ->> 'path', ''), length(v_prefix)) <> v_prefix or (v_f ->> 'path') ~ '\.\.' then
      raise exception 'ไฟล์แนบไม่ถูกต้อง' using errcode = '22023';
    end if;
    insert into public.attachments (entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    values ('brief', v_id, v_f ->> 'path', left(coalesce(v_f ->> 'name', 'file'), 255), v_f ->> 'type',
            coalesce((v_f ->> 'size')::bigint, 0), null);
  end loop;

  update public.brief_links set submission_count = submission_count + 1 where id = l.id;

  -- แจ้งเตือน: พนักงานผู้รับผิดชอบเพจ + Owner/Manager
  select page_name into v_page_name from public.pages where id = l.page_id;
  for r in
    select staff_id as uid from public.page_assignments where page_id = l.page_id
    union select id from public.profiles where role in ('owner', 'manager') and status = 'active'
  loop
    perform public.notify(r.uid, 'brief_submitted', 'ลูกค้าส่ง Brief ใหม่', coalesce(v_page_name, v_biz), 'brief', v_id);
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ตั้ง reviewed_by/at อัตโนมัติ + พนักงานแก้ได้เฉพาะสถานะ/บันทึกภายใน (ไม่แก้ข้อมูลที่ลูกค้ากรอก)
create function public.guard_brief_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text[] := array['status', 'internal_notes', 'reviewed_by', 'reviewed_at', 'updated_at'];
begin
  if auth.uid() is not null and not public.is_management()
     and (to_jsonb(new) - k) is distinct from (to_jsonb(old) - k) then
    raise exception 'พนักงานแก้ได้เฉพาะสถานะและบันทึกภายในของ Brief' using errcode = '42501';
  end if;
  if new.status = 'reviewed' and old.status is distinct from 'reviewed' then
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  elsif new.status <> 'reviewed' then
    new.reviewed_by := null; new.reviewed_at := null;
  end if;
  return new;
end $$;
create trigger briefs_guard before update on public.customer_briefs for each row execute function public.guard_brief_update();

-- ------------------------------------------------------------------ storage --
create function public.brief_link_open(p_link_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_link_id ~ '^[0-9a-f-]{36}$' and public.brief_link_state(p_link_id::uuid) = 'ok'
$$;

create function public.can_read_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attachments a
                 where a.storage_path = p_name and public.can_access_entity(a.entity_type, a.entity_id))
$$;

-- ทำเฉพาะเมื่อมี Supabase Storage (ใน dev ที่ไม่มี storage schema จะข้าม)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('brief-uploads', 'brief-uploads', false, 20971520,
            array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute $p$create policy brief_uploads_insert on storage.objects for insert to anon, authenticated
      with check (bucket_id = 'brief-uploads' and split_part(name, '/', 1) = 'links'
                  and public.brief_link_open(split_part(name, '/', 2)))$p$;
    execute $p$create policy brief_uploads_select on storage.objects for select to authenticated
      using (bucket_id = 'brief-uploads' and public.can_read_storage_object(name))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------- privileges --
revoke all on function
  public.notify(uuid, public.notification_type, text, text, text, uuid), public.trg_assignment_notify(),
  public.set_page_assignments(uuid, uuid[]), public.brief_token_hash(text),
  public.create_brief_link(uuid, uuid, text, integer, integer), public.brief_link_state(uuid),
  public.get_brief_link_info(text), public.submit_brief(text, jsonb), public.guard_brief_update(),
  public.brief_link_open(text), public.can_read_storage_object(text)
  from public, anon, authenticated;

grant execute on function public.set_page_assignments(uuid, uuid[]), public.create_brief_link(uuid, uuid, text, integer, integer),
  public.can_read_storage_object(text) to authenticated;
-- ฟังก์ชันสาธารณะสำหรับลูกค้า (ไม่ต้องล็อกอิน)
grant execute on function public.get_brief_link_info(text), public.submit_brief(text, jsonb), public.brief_link_open(text) to anon, authenticated;

-- ===== migrations/0004_tasks_notifications.sql =====
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

-- ===== migrations/0005_dashboard_reports.sql =====
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

-- ===== migrations/0006_security_pdpa.sql =====
-- ============================================================================
-- Migration 0006 (Phase 6): เสริมความปลอดภัย + PDPA
--  1) บัญชีใหม่ที่ไม่ได้สร้างโดยระบบ (ไม่มี role ใน app_metadata) เป็น "ปิดใช้งาน" โดยปริยาย (fail-closed)
--  2) ไฟล์แนบของพนักงานต้องอยู่ในโฟลเดอร์ของตนเอง (กันการลงทะเบียน path ของไฟล์ลูกค้าอื่น)
--  3) บันทึกการรับทราบประกาศความเป็นส่วนตัวของลูกค้า (consent_at) บังคับที่ฐานข้อมูล
--  4) anonymize_customer: ลบข้อมูลส่วนบุคคลตามคำขอ (Owner) รวมถึงประวัติใน audit log
--  5) งานประจำวันล้างข้อมูลชั่วคราว (brief_submit_attempts, แจ้งเตือนที่อ่านแล้วเก่า)
-- ============================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_role text := nullif(new.raw_app_meta_data ->> 'role', '');
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(v_role, 'page_admin')::public.user_role,
    case when v_role is null then 'inactive' else 'active' end::public.staff_status
  );
  return new;
end $$;

drop policy attach_insert on public.attachments;
create policy attach_insert on public.attachments for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and storage_path like 'staff/' || (select auth.uid())::text || '/%'
    and (select public.can_access_entity(entity_type, entity_id))
  );

alter table public.customer_briefs add column consent_at timestamptz;

create or replace function public.submit_brief(p_token text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.brief_links%rowtype;
  v_hash text := public.brief_token_hash(coalesce(p_token, ''));
  v_state text;
  v_id uuid;
  v_biz text; v_contact text; v_phone text;
  v_age_min int; v_age_max int; v_budget numeric;
  v_prov text[];
  v_files jsonb; v_f jsonb; v_prefix text;
  v_page_name text;
  v_found boolean;
  r record;
begin
  -- จำกัดอัตราทั้งระบบ (กันถูกยิงถล่ม) และเก็บบันทึกความพยายาม
  if (select count(*) from public.brief_submit_attempts where created_at > now() - interval '10 minutes') > 300 then
    raise exception 'ระบบมีผู้ใช้งานจำนวนมาก กรุณาลองใหม่ภายหลัง' using errcode = '54000';
  end if;
  select * into l from public.brief_links where token_hash = v_hash for update;
  v_found := found;
  insert into public.brief_submit_attempts (token_hash) values (case when v_found then v_hash end);
  if not v_found then raise exception 'ลิงก์ไม่ถูกต้อง' using errcode = 'P0002'; end if;

  -- จำกัดต่อลิงก์: 10 ครั้ง / 10 นาที
  if (select count(*) from public.brief_submit_attempts where token_hash = v_hash and created_at > now() - interval '10 minutes') > 10 then
    raise exception 'ส่งข้อมูลถี่เกินไป กรุณารอสักครู่แล้วลองใหม่' using errcode = '54000';
  end if;

  v_state := public.brief_link_state(l.id);
  if v_state <> 'ok' then
    raise exception '%', case v_state
      when 'expired' then 'ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อทีมงานเพื่อขอลิงก์ใหม่'
      when 'revoked' then 'ลิงก์นี้ถูกยกเลิกการใช้งานแล้ว'
      when 'used_up' then 'ลิงก์นี้ถูกใช้ครบจำนวนครั้งที่กำหนดแล้ว'
      else 'ลิงก์ไม่ถูกต้อง' end using errcode = 'P0001';
  end if;

  -- honeypot: บอทกรอกช่องที่ซ่อนไว้ -> ตอบสำเร็จแต่ไม่บันทึก
  if coalesce(p_payload ->> 'website', '') <> '' then
    return jsonb_build_object('ok', true);
  end if;

  -- PDPA: ต้องรับทราบประกาศความเป็นส่วนตัวก่อนส่ง (บันทึกเวลาที่รับทราบ)
  if coalesce(p_payload ->> 'consent', '') <> 'true' then
    raise exception 'กรุณารับทราบประกาศความเป็นส่วนตัวก่อนส่งข้อมูล' using errcode = '22023';
  end if;

  v_biz := nullif(trim(p_payload ->> 'business_name'), '');
  v_contact := nullif(trim(p_payload ->> 'contact_name'), '');
  v_phone := nullif(trim(p_payload ->> 'phone'), '');
  if v_biz is null then raise exception 'กรุณากรอกชื่อธุรกิจ' using errcode = '22023'; end if;
  if v_contact is null then raise exception 'กรุณากรอกชื่อผู้ติดต่อ' using errcode = '22023'; end if;
  if v_phone is null or v_phone !~ '^[0-9+\-\s()]{6,20}$' then raise exception 'เบอร์โทรศัพท์ไม่ถูกต้อง' using errcode = '22023'; end if;

  begin
    v_age_min := nullif(p_payload ->> 'age_min', '')::int;
    v_age_max := nullif(p_payload ->> 'age_max', '')::int;
    v_budget := nullif(p_payload ->> 'ad_budget_monthly', '')::numeric;
  exception when others then
    raise exception 'ตัวเลขในฟอร์มไม่ถูกต้อง (อายุ/งบประมาณ)' using errcode = '22023';
  end;
  if v_age_min is not null and v_age_min not between 13 and 100 or v_age_max is not null and v_age_max not between 13 and 100 then
    raise exception 'ช่วงอายุต้องอยู่ระหว่าง 13–100 ปี' using errcode = '22023';
  end if;
  if v_age_min is not null and v_age_max is not null and v_age_min > v_age_max then
    raise exception 'ช่วงอายุไม่ถูกต้อง' using errcode = '22023';
  end if;
  if v_budget is not null and (v_budget < 0 or v_budget > 100000000) then
    raise exception 'งบประมาณไม่ถูกต้อง' using errcode = '22023';
  end if;
  if (p_payload ->> 'fb_page_url') ~ '\S' and (p_payload ->> 'fb_page_url') !~* '^https?://' then
    raise exception 'ลิงก์ Facebook Page ต้องขึ้นต้นด้วย http:// หรือ https://' using errcode = '22023';
  end if;
  if (p_payload ->> 'instagram_url') ~ '\S' and (p_payload ->> 'instagram_url') !~* '^https?://' then
    raise exception 'ลิงก์ Instagram ต้องขึ้นต้นด้วย http:// หรือ https://' using errcode = '22023';
  end if;

  select coalesce(array_agg(left(trim(x), 100)), '{}') into v_prov
    from (select jsonb_array_elements_text(case when jsonb_typeof(p_payload -> 'provinces') = 'array' then p_payload -> 'provinces' else '[]'::jsonb end) x limit 77) s
   where trim(x) <> '';

  begin
    insert into public.customer_briefs (
      brief_link_id, customer_id, page_id, version, consent_at,
      business_name, contact_name, phone, line_id, fb_page_name, fb_page_url, instagram_url, product_category,
      ad_budget_monthly, age_min, age_max, provinces, target_audience, ad_objective, promote_items,
      current_promotion, contact_link, extra_details)
    values (
      l.id, l.customer_id, l.page_id, l.submission_count + 1, now(),
      v_biz, v_contact, v_phone,
      nullif(trim(p_payload ->> 'line_id'), ''), nullif(trim(p_payload ->> 'fb_page_name'), ''),
      nullif(trim(p_payload ->> 'fb_page_url'), ''), nullif(trim(p_payload ->> 'instagram_url'), ''),
      nullif(trim(p_payload ->> 'product_category'), ''),
      v_budget, v_age_min, v_age_max, v_prov,
      nullif(trim(p_payload ->> 'target_audience'), ''), nullif(trim(p_payload ->> 'ad_objective'), ''),
      nullif(trim(p_payload ->> 'promote_items'), ''), nullif(trim(p_payload ->> 'current_promotion'), ''),
      nullif(trim(p_payload ->> 'contact_link'), ''), nullif(trim(p_payload ->> 'extra_details'), ''))
    returning id into v_id;
  exception when check_violation or string_data_right_truncation then
    raise exception 'ข้อมูลบางช่องยาวเกินกำหนดหรือรูปแบบไม่ถูกต้อง' using errcode = '22023';
  end;

  -- ไฟล์แนบ (อัปโหลดไป Storage แล้ว): ต้องอยู่ในโฟลเดอร์ของลิงก์นี้เท่านั้น
  v_files := case when jsonb_typeof(p_payload -> 'files') = 'array' then p_payload -> 'files' else '[]'::jsonb end;
  if jsonb_array_length(v_files) > 10 then raise exception 'แนบไฟล์ได้ไม่เกิน 10 ไฟล์' using errcode = '22023'; end if;
  v_prefix := 'links/' || l.id::text || '/';
  for v_f in select * from jsonb_array_elements(v_files) loop
    if left(coalesce(v_f ->> 'path', ''), length(v_prefix)) <> v_prefix or (v_f ->> 'path') ~ '\.\.' then
      raise exception 'ไฟล์แนบไม่ถูกต้อง' using errcode = '22023';
    end if;
    insert into public.attachments (entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    values ('brief', v_id, v_f ->> 'path', left(coalesce(v_f ->> 'name', 'file'), 255), v_f ->> 'type',
            coalesce((v_f ->> 'size')::bigint, 0), null);
  end loop;

  update public.brief_links set submission_count = submission_count + 1 where id = l.id;

  -- แจ้งเตือน: พนักงานผู้รับผิดชอบเพจ + Owner/Manager
  select page_name into v_page_name from public.pages where id = l.page_id;
  for r in
    select staff_id as uid from public.page_assignments where page_id = l.page_id
    union select id from public.profiles where role in ('owner', 'manager') and status = 'active'
  loop
    perform public.notify(r.uid, 'brief_submitted', 'ลูกค้าส่ง Brief ใหม่', coalesce(v_page_name, v_biz), 'brief', v_id);
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create function public.anonymize_customer(p_customer_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text; v_paths text[]; v_briefs uuid[]; v_pages uuid[]; v_contracts uuid[]; v_tasks uuid[];
begin
  if not public.is_owner() then
    raise exception 'เฉพาะ Owner เท่านั้นที่ลบข้อมูลส่วนบุคคลได้' using errcode = '42501';
  end if;
  select customer_code into v_code from public.customers where id = p_customer_id;
  if v_code is null then raise exception 'ไม่พบลูกค้า' using errcode = 'P0002'; end if;

  select coalesce(array_agg(id), '{}') into v_briefs    from public.customer_briefs where customer_id = p_customer_id;
  select coalesce(array_agg(id), '{}') into v_pages     from public.pages where customer_id = p_customer_id;
  select coalesce(array_agg(id), '{}') into v_contracts from public.contracts where customer_id = p_customer_id;
  select coalesce(array_agg(id), '{}') into v_tasks     from public.tasks where page_id = any (v_pages);

  select coalesce(array_agg(storage_path), '{}') into v_paths from public.attachments
   where (entity_type = 'brief' and entity_id = any (v_briefs)) or (entity_type = 'customer' and entity_id = p_customer_id)
      or (entity_type = 'page' and entity_id = any (v_pages)) or (entity_type = 'contract' and entity_id = any (v_contracts))
      or (entity_type = 'task' and entity_id = any (v_tasks));
  delete from public.attachments where storage_path = any (v_paths);

  update public.customer_briefs set
    business_name = '[ลบตามคำขอ PDPA]', contact_name = '[ลบตามคำขอ PDPA]', phone = '000000',
    line_id = null, fb_page_name = null, fb_page_url = null, instagram_url = null, product_category = null,
    target_audience = null, ad_objective = null, promote_items = null, current_promotion = null,
    contact_link = null, extra_details = null, internal_notes = null
   where customer_id = p_customer_id;
  update public.pages set page_name = '[ลบตามคำขอ PDPA] ' || left(id::text, 8), page_url = null, instagram_url = null, notes = null
   where customer_id = p_customer_id;
  update public.brief_links set label = null where customer_id = p_customer_id;
  update public.customers set
    business_name = '[ลบตามคำขอ PDPA] ' || customer_code, contact_name = null, phone = null, line_id = null, email = null,
    business_type = null, notes = null, status = 'churned'
   where id = p_customer_id;

  -- ลบข้อมูลส่วนบุคคลที่เคยถูกบันทึกในประวัติ (รวมแถวที่เพิ่งเกิดจากการลบนี้)
  update public.audit_logs set old_data = null, new_data = null
   where (table_name = 'customers' and record_id = p_customer_id)
      or (table_name = 'pages' and record_id = any (v_pages))
      or (table_name = 'customer_briefs' and record_id = any (v_briefs))
      or (table_name = 'brief_links' and (coalesce(old_data ->> 'customer_id', new_data ->> 'customer_id'))::uuid = p_customer_id);
  insert into public.audit_logs (actor_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'ANONYMIZE', 'customers', p_customer_id, jsonb_build_object('customer_code', v_code, 'files_removed', coalesce(array_length(v_paths, 1), 0)));

  return jsonb_build_object('storage_paths', to_jsonb(v_paths));
end $$;

-- งานประจำวัน + ล้างข้อมูลชั่วคราว
create or replace function public.run_daily_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_changed integer; v_contract integer; v_tasks integer; v_att integer; v_notif integer;
begin
  if auth.uid() is not null and not public.is_management() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  v_changed := public.refresh_contract_statuses();
  v_contract := public.notify_contract_events();
  v_tasks := public.notify_overdue_tasks();
  delete from public.brief_submit_attempts where created_at < now() - interval '2 days';
  get diagnostics v_att = row_count;
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
  get diagnostics v_notif = row_count;
  return jsonb_build_object('status_changes', v_changed, 'contract_notices', v_contract, 'overdue_task_notices', v_tasks,
                            'purged_attempts', v_att, 'purged_notifications', v_notif);
end $$;

-- Owner ลบไฟล์ใน Storage ได้ (ใช้ร่วมกับ anonymize_customer)
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy brief_uploads_delete on storage.objects for delete to authenticated
      using (bucket_id = 'brief-uploads' and public.is_owner())$p$;
  end if;
end $$;

revoke all on function public.anonymize_customer(uuid), public.submit_brief(text, jsonb), public.run_daily_jobs(), public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.anonymize_customer(uuid), public.run_daily_jobs() to authenticated;
grant execute on function public.submit_brief(text, jsonb) to anon, authenticated;

-- trigger function จาก 0001 ไม่ควรถูกเรียกตรงโดยผู้ใช้ (เรียกไม่ได้อยู่แล้ว แต่ปิดสิทธิ์ให้ชัดเจน)
revoke execute on function public.audit_row(), public.guard_profile_update(), public.guard_task_update(), public.set_updated_at()
  from public, anon, authenticated;
