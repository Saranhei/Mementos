// Pruebas de las reglas de la base sobre un Postgres real en memoria (PGlite).
// Correr: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'

const db = new PGlite({ extensions: { pgcrypto } })
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), '')) $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on all functions in schema auth to authenticated, anon;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert on storage.objects to authenticated;
  create publication supabase_realtime;
  grant usage on schema public to authenticated, anon;
`)

await db.exec(schema)
await db.exec(schema) // idempotente
await db.exec(`grant select, delete on all tables in schema public to authenticated;`)

const users = {
  host: ['11111111-1111-1111-1111-111111111111', 'mishu@test.com'],
  kora: ['22222222-2222-2222-2222-222222222222', 'kora@test.com'],
  ori: ['33333333-3333-3333-3333-333333333333', 'ori@test.com'],
  avy: ['44444444-4444-4444-4444-444444444444', 'avy@test.com'],
}
const as = async (who, sql, params, role = 'authenticated') => {
  const [uid, email] = who ? users[who] : ['', '']
  await db.exec(`reset role;
    select set_config('request.jwt.claim.sub', '${uid}', false);
    select set_config('request.jwt.claim.email', '${email}', false);
    set role ${role};`)
  try {
    return (await db.query(sql, params)).rows
  } finally {
    await db.exec('reset role')
  }
}
let fails = 0
const check = (label, cond) => { if (!cond) fails++; console.log(cond ? 'ok   ' : 'FAIL ', label) }
const expectError = async (label, fn, code) => {
  try { await fn(); fails++; console.log('FAIL (sin error):', label) } catch (e) {
    const ok = e.message.includes(code); if (!ok) fails++
    console.log(ok ? 'ok   ' : 'FAIL ', label, '→', e.message)
  }
}
const ev = async (who, code) => (await as(who, `select public.get_event($1) as e`, [code]))[0].e
const sees = async (who, path) => (await as(who, `select 1 from storage.objects where name = $1`, [path])).length === 1
const upload = async (who, eventId) => {
  const [s] = await as(who, `select * from public.take_shot($1)`, [eventId])
  await as(who, `insert into storage.objects(bucket_id, name) values ('photos', $1)`, [s.storage_path])
  await as(who, `select public.confirm_photo($1)`, [s.photo_id])
  return s
}

// --- sesión ---
await expectError('sin sesión no crea', () => as(null, `select public.create_event('X',3,10,null,0,null,'M')`, [], 'anon'), 'permission denied')
const prev = (await as(null, `select public.event_preview('NOPE00') as p`, [], 'anon').catch((e) => [{ p: e.message }]))[0].p
check('preview sin sesión responde (aunque no exista)', String(prev).includes('EVENT_NOT_FOUND'))

// --- crear: 3 disparos, máx 3 invitados, máx 2 por persona, votación 0 min ---
const [{ create_event: code }] = await as('host', `select public.create_event('Fiesta', 3, 3, 2, 0, null, 'Mishu')`)
const host = await ev('host', code)
check('nace en espera', host.phase === 'scheduled')
check('host con mail de la sesión', host.is_host && host.guest.email === 'mishu@test.com')
const preview = (await as(null, `select public.event_preview($1) as p`, [code], 'anon'))[0].p
check('preview sin datos privados', preview.name === 'Fiesta' && !('id' in preview) && preview.shots_left === 3)

await as('kora', `select public.join_event($1, 'Kora')`, [code])
await as('ori', `select public.join_event($1, 'Ori')`, [code])
check('invitado toma mail verificado', (await ev('kora', code)).guest.email === 'kora@test.com')
await expectError('cupo de invitados', () => as('avy', `select public.join_event($1, 'Avy')`, [code]), 'EVENT_FULL')
await as('kora', `select public.join_event($1, 'Kora R')`, [code])
check('reingresar cambia el nombre y no ocupa cupo', (await ev('kora', code)).guest.name === 'Kora R')

await expectError('no se dispara antes de Comenzar', () => as('kora', `select * from public.take_shot($1)`, [host.id]), 'NOT_STARTED')
await expectError('invitado no puede Comenzar', () => as('kora', `select public.start_now($1)`, [host.id]), 'NOT_ALLOWED')
await as('host', `select public.start_now($1)`, [host.id])
check('Comenzar → en vivo', (await ev('kora', code)).phase === 'open')

// --- disparos + privacidad de archivos ---
const s1 = await upload('kora', host.id)
check('invitado ve fotos durante la fiesta', await sees('ori', s1.storage_path))
check('no invitado no ve la foto', !(await sees('avy', s1.storage_path)))
await expectError('no se re-sube', () => as('kora', `insert into storage.objects(bucket_id, name) values ('photos', $1)`, [s1.storage_path]), 'row-level security')
check('nadie borra fotos', (await as('host', `delete from photos returning id`)).length === 0)

await as('ori', `select public.vote($1, 1)`, [s1.photo_id])
await as('ori', `select public.toggle_want($1)`, [s1.photo_id])
await expectError('no votar la propia', () => as('kora', `select public.vote($1, 1)`, [s1.photo_id]), 'OWN_PHOTO')
const s2 = await upload('ori', host.id)
await expectError('host no puede ocultar antes del cierre', () => as('host', `select public.set_photo_hidden($1, true)`, [s2.photo_id]), 'EVENT_NOT_CLOSED')
await expectError('invitado no termina la fiesta', () => as('kora', `select public.end_shots($1)`, [host.id]), 'NOT_ALLOWED')

// --- Terminar fiesta (votación 0 min → cerrado) ---
await as('host', `select public.end_shots($1)`, [host.id])
check('cerrado', (await ev('ori', code)).phase === 'closed')
await expectError('álbum bloqueado para invitados', () => as('ori', `select * from public.album($1)`, [host.id]), 'ALBUM_LOCKED')
check('archivo bloqueado para invitados', !(await sees('ori', s1.storage_path)))
check('tabla de fotos bloqueada para invitados', (await as('ori', 'select * from photos')).length === 0)
check('host sí ve todo', (await as('host', `select * from public.album($1)`, [host.id])).length === 2 && (await sees('host', s1.storage_path)))
await expectError('invitado no marca quiero esta cerrado', () => as('ori', `select public.toggle_want($1)`, [s2.photo_id]), 'ALBUM_LOCKED')

// --- edición del host ---
await expectError('invitado no edita', () => as('kora', `select public.set_photo_hidden($1, true)`, [s2.photo_id]), 'NOT_ALLOWED')
await as('host', `select public.set_album_details($1, 'Gracias por venir', $2)`, [host.id, s2.photo_id])
await as('host', `select public.set_photo_hidden($1, true)`, [s2.photo_id])
const afterHide = await ev('host', code)
check('ocultar la portada la saca', afterHide.cover_photo_id === null && afterHide.message === 'Gracias por venir')
const guestsList = await as('host', `select * from public.host_guests($1)`, [host.id])
check('host ve invitados con cantidad de fotos', guestsList.length === 3 && guestsList.find((g) => g.name === 'Kora R').photos === 1)

const exp = (await as('host', `select public.host_export($1) as x`, [host.id]))[0].x
check('export sin ocultas', exp.photos.length === 1 && exp.photos[0].wanted_by[0] === 'ori@test.com' && exp.event.message === 'Gracias por venir')
await as('host', `select public.mark_delivered($1, 'https://drive/x')`, [host.id])

// --- entregado ---
const after = await as('ori', `select * from public.album($1)`, [host.id])
check('tras la entrega: invitado ve el álbum sin ocultas', after.length === 1 && after[0].id === s1.photo_id)
check('archivo oculto sigue privado', !(await sees('ori', s2.storage_path)) && (await sees('ori', s1.storage_path)))
await expectError('no se edita después de entregar', () => as('host', `select public.set_photo_hidden($1, false)`, [s2.photo_id]), 'ALREADY_DELIVERED')

// --- programación ---
const [{ create_event: code2 }] = await as('host', `select public.create_event('Programado', 10, 50, null, 30, now() + interval '6 hours', 'Mishu')`)
const e2 = await ev('host', code2)
check('fase programada', e2.phase === 'scheduled')
await as('kora', `select public.join_event($1, 'Kora')`, [code2])
await expectError('no se dispara antes de empezar', () => as('kora', `select * from public.take_shot($1)`, [e2.id]), 'NOT_STARTED')
await as('host', `select public.start_now($1)`, [e2.id])
check('empezar ahora', (await ev('host', code2)).phase === 'open')
await expectError('fin en el pasado', () => as('host', `select public.create_event('Mal', 10, 50, null, 30, now() - interval '1 hour', 'M')`), 'BAD_SCHEDULE')

// fin automático por horario
await db.exec(`update events set starts_at = now() - interval '3 hours', ends_at = now() - interval '10 minutes' where code = '${code2}'`)
const auto = await ev('kora', code2)
check('pasa sola a votación final a la hora de fin', auto.phase === 'voting')
await expectError('no se dispara en votación', () => as('kora', `select * from public.take_shot($1)`, [e2.id]), 'NO_SHOTS_LEFT')
await as('host', `select public.extend_voting($1, 15)`, [e2.id])
const ext = await ev('host', code2)
check('+15 min sobre el cierre automático', new Date(ext.voting_ends_at) - new Date(auto.voting_ends_at) >= 14 * 60000)
await as('host', `select public.close_album($1)`, [e2.id])
check('cerrar ya', (await ev('host', code2)).phase === 'closed')

const mine = (await as('kora', `select public.my_events() as m`))[0].m
check('mis eventos (invitado en 2)', mine.length === 2 && mine.every((m) => !m.is_host))

const pub = await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)
check('realtime en events', pub.rows.some((r) => r.tablename === 'events'))
console.log(fails ? `\n${fails} FALLAS` : '\nTODO OK'); process.exit(fails ? 1 : 0)
