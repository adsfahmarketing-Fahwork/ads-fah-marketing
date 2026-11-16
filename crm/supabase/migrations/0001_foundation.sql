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
