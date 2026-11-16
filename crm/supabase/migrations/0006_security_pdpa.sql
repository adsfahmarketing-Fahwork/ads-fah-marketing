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
