import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** จำลอง Supabase ขั้นต่ำ: roles, auth.users, auth.uid() แล้วรัน migration จริงทั้งหมด */
export async function createDb() {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_app_meta_data jsonb not null default '{}',
      raw_user_meta_data jsonb not null default '{}'
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert on storage.objects to anon, authenticated;
  `)
  const dir = join(__dirname, '..', 'supabase', 'migrations')
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'))

  const ids: Record<string, string> = {}
  async function addUser(key: string, role: string, name: string) {
    const r = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_app_meta_data, raw_user_meta_data) values ($1, $2, $3) returning id`,
      [`${key}@test.local`, JSON.stringify({ role }), JSON.stringify({ full_name: name })],
    )
    ids[key] = r.rows[0].id
  }

  /** รัน SQL ในฐานะผู้ใช้ (RLS บังคับใช้จริง) หรือ anon */
  async function as<T = any>(who: string | 'anon' | 'admin', sql: string, params: any[] = []) {
    if (who === 'admin') {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`)
    } else if (who === 'anon') {
      await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon`)
    } else {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[who]}', false); set role authenticated`)
    }
    try {
      return (await db.query<T>(sql, params)).rows
    } finally {
      await db.exec('reset role')
    }
  }
  return { db, ids, addUser, as }
}
