-- ============================================================================
-- Migration 0007: ฟอร์ม Brief ถามเฉพาะข้อมูลสำหรับยิง Ads (งบ / ช่วงอายุ / พื้นที่ / Target)
-- ผู้ติดต่อและเบอร์โทรไม่บังคับ (ทีมงานใช้ข้อมูลติดต่อจากข้อมูลลูกค้า)
-- ============================================================================
alter table public.customer_briefs alter column contact_name drop not null;
alter table public.customer_briefs alter column phone drop not null;

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

  -- ลูกค้าตอบเฉพาะข้อมูลสำหรับยิง Ads ก็พอ: ชื่อธุรกิจใช้จากข้อมูลลูกค้า, ผู้ติดต่อ/เบอร์โทรเป็นตัวเลือก
  v_biz := coalesce(nullif(trim(p_payload ->> 'business_name'), ''), (select business_name from public.customers where id = l.customer_id));
  v_contact := nullif(trim(p_payload ->> 'contact_name'), '');
  v_phone := nullif(trim(p_payload ->> 'phone'), '');
  if v_phone is not null and v_phone !~ '^[0-9+\-\s()]{6,20}$' then raise exception 'เบอร์โทรศัพท์ไม่ถูกต้อง' using errcode = '22023'; end if;

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

revoke all on function public.submit_brief(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_brief(text, jsonb) to anon, authenticated;
