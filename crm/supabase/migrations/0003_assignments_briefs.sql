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
