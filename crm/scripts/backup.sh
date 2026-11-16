#!/usr/bin/env bash
# สำรองฐานข้อมูล ADS FAH CRM ด้วย pg_dump (ใช้เสริมจาก Backups/PITR ของ Supabase)
# การใช้งาน:  SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres' ./scripts/backup.sh [โฟลเดอร์ปลายทาง]
# - เก็บ SUPABASE_DB_URL เป็นความลับ (อย่า commit) และเก็บไฟล์สำรองในที่เข้ารหัส/จำกัดสิทธิ์
# - ไฟล์สำรองมีข้อมูลส่วนบุคคล: ต้องได้รับการปกป้องเทียบเท่าฐานข้อมูลจริง และลบตามระยะเวลาเก็บรักษาที่กำหนด
# - ไม่รวมไฟล์ใน Storage (bucket brief-uploads) ให้สำรองแยกผ่าน Supabase Storage API/CLI
set -euo pipefail

: "${SUPABASE_DB_URL:?ต้องตั้งค่า SUPABASE_DB_URL}"
DEST="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(TZ=Asia/Bangkok date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
umask 077
FILE="$DEST/adsfah-crm-$STAMP.dump"

pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --schema=public --file="$FILE"
# ตรวจว่าไฟล์อ่านได้จริง
pg_restore --list "$FILE" > /dev/null
echo "สำรองสำเร็จ: $FILE ($(du -h "$FILE" | cut -f1))"

# ลบไฟล์สำรองที่เก่ากว่า KEEP_DAYS วัน
find "$DEST" -name 'adsfah-crm-*.dump' -mtime +"$KEEP_DAYS" -print -delete
