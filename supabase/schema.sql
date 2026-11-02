-- =====================================================================
-- Mementos — esquema completo de Supabase
-- Pegalo ENTERO en Supabase → SQL Editor → New query → Run.
-- Se puede volver a correr sin romper nada (es idempotente).
--
-- Reglas que garantiza este archivo (no la app):
--   · Todos entran con su mail verificado (código o link por mail).
--   · Para sumarse a un evento hace falta la clave secreta del QR; el código
--     de 6 letras solo sirve para volver a entrar a quien ya está adentro.
--   · El anfitrión puede quitar invitados y regenerar el QR.
--   · Los disparos son compartidos, atómicos, sin repetir y sin borrar.
--   · El evento se crea en espera: nadie dispara hasta que el anfitrión toca
--     "Comenzar". Puede tener hora de fin.
--   · Al cerrarse, las fotos quedan bloqueadas para los invitados hasta que
--     el anfitrión edita y envía el álbum.
--   · Las fotos son privadas: solo se ven con links firmados que vencen.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Funciones internas: viven fuera del esquema público para que la API no las exponga.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null check (char_length(name) between 1 and 80),
  host_id          uuid not null,
  total_shots      int  not null check (total_shots between 1 and 2000),
  max_guests       int  not null default 50 check (max_guests between 1 and 2000),
  max_per_guest    int  check (max_per_guest is null or max_per_guest >= 1),
  shots_used       int  not null default 0,
  voting_minutes   int  not null default 60 check (voting_minutes between 0 and 10080),
  starts_at        timestamptz,
  ends_at          timestamptz,
  status           text not null default 'pending',
  voting_ends_at   timestamptz,
  message          text check (message is null or char_length(message) <= 1000),
  cover_photo_id   uuid,
  activity_at      timestamptz not null default now(),  -- se toca en cada cambio: dispara el realtime
  drive_folder_url text,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  constraint shots_within_total check (shots_used between 0 and total_shots),
  constraint schedule_order check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- Por si corriste una versión anterior de este archivo
alter table public.events add column if not exists max_guests int not null default 50;
alter table public.events add column if not exists starts_at timestamptz;
alter table public.events add column if not exists ends_at timestamptz;
alter table public.events add column if not exists message text;
alter table public.events add column if not exists cover_photo_id uuid;
alter table public.events drop column if exists join_secret;
alter table public.events alter column status set default 'pending';
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check check (status in ('pending', 'open', 'voting', 'closed'));

-- La clave del QR vive en una tabla aparte, sin ninguna política: nadie la lee por la API,
-- solo las funciones del servidor (y get_event se la da únicamente al anfitrión).
create table if not exists public.event_secrets (
  event_id    uuid primary key references public.events(id) on delete cascade,
  join_secret text not null default encode(extensions.gen_random_bytes(16), 'hex')
);
alter table public.event_secrets enable row level security;
revoke all on public.event_secrets from anon, authenticated;

create table if not exists public.guests (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null,
  name       text not null check (char_length(name) between 1 and 40),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  removed_at timestamptz,  -- el anfitrión lo quitó: pierde el acceso, sus fotos quedan
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
alter table public.guests add column if not exists removed_at timestamptz;
create index if not exists guests_user_idx on public.guests (user_id);

create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  guest_id     uuid not null references public.guests(id) on delete cascade,
  shot_number  int  not null,
  storage_path text not null unique,
  uploaded     boolean not null default false,
  hidden       boolean not null default false,  -- el anfitrión la deja fuera del álbum final (no se borra)
  created_at   timestamptz not null default now(),
  unique (event_id, shot_number)
);
alter table public.photos add column if not exists hidden boolean not null default false;
create index if not exists photos_event_idx on public.photos (event_id);
create index if not exists photos_guest_idx on public.photos (guest_id);

create table if not exists public.votes (
  photo_id   uuid not null references public.photos(id) on delete cascade,
  guest_id   uuid not null references public.guests(id) on delete cascade,
  value      smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (photo_id, guest_id)
);
create index if not exists votes_guest_idx on public.votes (guest_id);

create table if not exists public.wants (
  photo_id   uuid not null references public.photos(id) on delete cascade,
  guest_id   uuid not null references public.guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, guest_id)
);
create index if not exists wants_guest_idx on public.wants (guest_id);

insert into public.event_secrets (event_id) select id from public.events on conflict do nothing;

-- ---------------------------------------------------------------------
-- Limpieza de versiones anteriores (helpers que antes estaban en public y firmas viejas)
-- ---------------------------------------------------------------------

drop function if exists public.can_see_event(uuid) cascade;
drop function if exists public.can_view_object(text) cascade;
drop function if exists public.can_upload(text) cascade;
drop function if exists public.my_guest_id(uuid) cascade;
drop function if exists public.assert_host(uuid) cascade;
drop function if exists public.session_email() cascade;
drop function if exists public.new_event_code() cascade;
drop function if exists public.voting_deadline(public.events) cascade;
drop function if exists public.phase(public.events) cascade;
drop function if exists public.get_event(text);
drop function if exists public.event_preview(text);
drop function if exists public.join_event(text, text);
drop function if exists public.join_event(text, text, text);
drop function if exists public.host_guests(uuid);
drop function if exists public.create_event(text, int, int, int, int, timestamptz, timestamptz, text);
drop function if exists public.create_event(text, int, int, int, text, text);

-- ---------------------------------------------------------------------
-- Helpers internos (schema private)
-- ---------------------------------------------------------------------

-- Cuándo termina la votación final (explícita, o automática por hora de fin).
create or replace function private.voting_deadline(e public.events) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when e.status = 'voting' then e.voting_ends_at
    when e.status in ('pending', 'open') and e.ends_at is not null then e.ends_at + make_interval(mins => e.voting_minutes)
    else e.voting_ends_at
  end
$$;

-- Fase real del evento: scheduled (en espera) → open → voting → closed.
create or replace function private.phase(e public.events) returns text
language sql stable set search_path = '' as $$
  select case
    when e.status = 'closed' then 'closed'
    when e.status = 'voting' then case when now() >= e.voting_ends_at then 'closed' else 'voting' end
    when e.ends_at is not null and now() >= e.ends_at then
      case when now() >= e.ends_at + make_interval(mins => e.voting_minutes) then 'closed' else 'voting' end
    when e.status = 'pending' then 'scheduled'
    else 'open'
  end
$$;

create or replace function private.session_email() returns text
language sql stable set search_path = '' as $$
  select lower(nullif(auth.jwt() ->> 'email', ''))
$$;

-- Invitado activo (no quitado) de la sesión actual en ese evento.
create or replace function private.my_guest_id(p_event_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.guests
  where event_id = p_event_id and user_id = auth.uid() and removed_at is null
  limit 1
$$;

create or replace function private.can_see_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guests where event_id = p_event_id and user_id = auth.uid() and removed_at is null)
      or exists (select 1 from public.events where id = p_event_id and host_id = auth.uid())
$$;

-- Quién puede ver una foto:
--   · el anfitrión, siempre;
--   · los invitados activos, durante la fiesta y la votación;
--   · después del cierre, recién cuando el álbum se entregó, y sin las fotos ocultas.
create or replace function private.can_view_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.photos p join public.events e on e.id = p.event_id
    where p.storage_path = p_name and p.uploaded and (
      e.host_id = auth.uid()
      or (
        exists (select 1 from public.guests g where g.event_id = e.id and g.user_id = auth.uid() and g.removed_at is null)
        and (private.phase(e) <> 'closed' or (e.delivered_at is not null and not p.hidden))
      )
    )
  )
$$;

-- Solo se puede subir un archivo al path que el servidor reservó para vos y que todavía no se subió.
create or replace function private.can_upload(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.photos p join public.guests g on g.id = p.guest_id
    where p.storage_path = p_name and g.user_id = auth.uid() and g.removed_at is null and not p.uploaded
  )
$$;

create or replace function private.new_event_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.events where code = candidate);
  end loop;
  return candidate;
end $$;

create or replace function private.assert_host(p_event_id uuid) returns public.events
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.events;
begin
  select * into e from public.events where id = p_event_id and host_id = auth.uid();
  if not found then raise exception 'NOT_ALLOWED'; end if;
  return e;
end $$;

-- Compara la clave del QR (por hash, para no filtrar nada por tiempos de respuesta).
create or replace function private.secret_ok(p_event_id uuid, p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_secret is not null and exists (
    select 1 from public.event_secrets s
    where s.event_id = p_event_id
      and extensions.digest(s.join_secret, 'sha256') = extensions.digest(p_secret, 'sha256')
  )
$$;

create or replace function private.join_secret(p_event_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select join_secret from public.event_secrets where event_id = p_event_id
$$;

revoke execute on all functions in schema private from public, anon;
grant  execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Seguridad (RLS): todo se lee con permisos y se escribe SOLO vía funciones
-- ---------------------------------------------------------------------

alter table public.events enable row level security;
alter table public.guests enable row level security;
alter table public.photos enable row level security;
alter table public.votes  enable row level security;
alter table public.wants  enable row level security;

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (private.can_see_event(id));

drop policy if exists guests_read_own on public.guests;
create policy guests_read_own on public.guests for select to authenticated
  using (user_id = auth.uid() and removed_at is null);

drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select to authenticated
  using (uploaded and private.can_view_object(storage_path));

drop policy if exists votes_read_own on public.votes;
create policy votes_read_own on public.votes for select to authenticated
  using (guest_id in (select id from public.guests where user_id = auth.uid()));

drop policy if exists wants_read_own on public.wants;
create policy wants_read_own on public.wants for select to authenticated
  using (guest_id in (select id from public.guests where user_id = auth.uid()));


-- Sin políticas de insert/update/delete: nadie puede borrar ni editar fotos, ni siquiera el anfitrión.

-- ---------------------------------------------------------------------
-- Función pública (sin sesión): la invitación, solo con la clave del QR
-- ---------------------------------------------------------------------

create or replace function public.event_preview(p_code text, p_secret text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.events;
begin
  select * into e from public.events where code = upper(trim(p_code));
  if not found or not private.secret_ok(e.id, p_secret) then raise exception 'EVENT_NOT_FOUND'; end if;
  return json_build_object(
    'code', e.code,
    'name', e.name,
    'phase', private.phase(e),
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'shots_left', e.total_shots - e.shots_used
  );
end $$;

-- ---------------------------------------------------------------------
-- Funciones con sesión
-- ---------------------------------------------------------------------

-- El evento nace "en espera". Más adelante lo va a crear la web después del pago.
create or replace function public.create_event(
  p_name text, p_total_shots int, p_max_guests int, p_max_per_guest int,
  p_voting_minutes int, p_ends_at timestamptz, p_host_name text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events;
begin
  if auth.uid() is null or private.session_email() is null then raise exception 'NO_SESSION'; end if;
  if p_ends_at is not null and p_ends_at <= now() then raise exception 'BAD_SCHEDULE'; end if;

  insert into public.events (code, name, host_id, total_shots, max_guests, max_per_guest, voting_minutes, ends_at)
  values (private.new_event_code(), trim(p_name), auth.uid(), p_total_shots, coalesce(p_max_guests, 50),
          p_max_per_guest, coalesce(p_voting_minutes, 60), p_ends_at)
  returning * into v_event;

  insert into public.event_secrets (event_id) values (v_event.id);

  insert into public.guests (event_id, user_id, name, email)
  values (v_event.id, auth.uid(), trim(p_host_name), private.session_email());

  return v_event.code;
end $$;

-- Quien ya está adentro (o el anfitrión) entra con el código. Alguien nuevo necesita la clave del QR:
-- sin ella, el evento "no existe" (no se distingue un código inválido de una clave incorrecta).
create or replace function public.get_event(p_code text, p_secret text default null) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.events;
  g public.guests;
  v_host boolean;
begin
  if auth.uid() is null then raise exception 'NO_SESSION'; end if;
  select * into e from public.events where code = upper(trim(p_code));
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  v_host := e.host_id = auth.uid();
  select * into g from public.guests where event_id = e.id and user_id = auth.uid() and removed_at is null limit 1;

  if g.id is null and not v_host then
    if exists (select 1 from public.guests where event_id = e.id and user_id = auth.uid() and removed_at is not null) then
      raise exception 'REMOVED';
    end if;
    if not private.secret_ok(e.id, p_secret) then raise exception 'EVENT_NOT_FOUND'; end if;
  end if;

  return json_build_object(
    'id', e.id,
    'code', e.code,
    'join_secret', case when v_host then private.join_secret(e.id) end,
    'name', e.name,
    'total_shots', e.total_shots,
    'shots_used', e.shots_used,
    'max_guests', e.max_guests,
    'max_per_guest', e.max_per_guest,
    'voting_minutes', e.voting_minutes,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'voting_ends_at', private.voting_deadline(e),
    'phase', private.phase(e),
    'delivered_at', e.delivered_at,
    'message', case when g.id is not null then e.message end,
    'host_name', (select name from public.guests where event_id = e.id and user_id = e.host_id limit 1),
    'cover_photo_id', case when g.id is not null then e.cover_photo_id end,
    'drive_folder_url', case when g.id is not null then e.drive_folder_url end,
    'is_host', v_host,
    'guest', case when g.id is null then null
                  else json_build_object('id', g.id, 'name', g.name, 'email', g.email) end,
    'my_shots', (select count(*) from public.photos where guest_id = g.id),
    'guests_count', (select count(*) from public.guests where event_id = e.id and removed_at is null)
  );
end $$;

create or replace function public.my_events() returns json
language sql stable security definer set search_path = '' as $$
  select coalesce(json_agg(t order by t.created_at desc), '[]'::json) from (
    select e.code, e.name, private.phase(e) as phase, e.starts_at, e.delivered_at, e.created_at,
           e.host_id = auth.uid() as is_host
    from public.events e
    where e.host_id = auth.uid()
       or exists (select 1 from public.guests g where g.event_id = e.id and g.user_id = auth.uid() and g.removed_at is null)
    limit 50
  ) t
$$;

-- El mail sale de la sesión verificada; el nombre lo elige cada invitado.
create or replace function public.join_event(p_code text, p_name text, p_secret text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.events;
  v_id uuid;
  v_removed timestamptz;
begin
  if auth.uid() is null or private.session_email() is null then raise exception 'NO_SESSION'; end if;
  select * into e from public.events where code = upper(trim(p_code)) for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  select id, removed_at into v_id, v_removed from public.guests where event_id = e.id and user_id = auth.uid();
  if v_removed is not null then raise exception 'REMOVED'; end if;
  if v_id is not null then
    update public.guests set name = trim(p_name) where id = v_id;
    return v_id;
  end if;

  if not private.secret_ok(e.id, p_secret) then raise exception 'EVENT_NOT_FOUND'; end if;
  if private.phase(e) = 'closed' then raise exception 'EVENT_CLOSED'; end if;
  if (select count(*) from public.guests where event_id = e.id and removed_at is null) >= e.max_guests then
    raise exception 'EVENT_FULL';
  end if;

  insert into public.guests (event_id, user_id, name, email)
  values (e.id, auth.uid(), trim(p_name), private.session_email())
  returning id into v_id;

  update public.events set activity_at = now() where id = e.id;
  return v_id;
end $$;

-- Reserva un disparo de forma atómica. El disparo se gasta acá: no hay "repetir".
create or replace function public.take_shot(p_event_id uuid)
returns table (photo_id uuid, storage_path text, shot_number int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  e public.events;
  v_guest uuid;
  v_mine int;
  v_shot int;
  v_path text;
  v_id uuid;
begin
  v_guest := private.my_guest_id(p_event_id);
  if v_guest is null then raise exception 'NOT_A_GUEST'; end if;

  select * into e from public.events where id = p_event_id for update;
  if private.phase(e) = 'scheduled' then raise exception 'NOT_STARTED'; end if;
  if private.phase(e) = 'closed' then raise exception 'EVENT_CLOSED'; end if;
  if private.phase(e) <> 'open' or e.shots_used >= e.total_shots then raise exception 'NO_SHOTS_LEFT'; end if;

  if e.max_per_guest is not null then
    select count(*) into v_mine from public.photos where guest_id = v_guest;
    if v_mine >= e.max_per_guest then raise exception 'GUEST_LIMIT'; end if;
  end if;

  v_shot := e.shots_used + 1;
  v_path := e.id::text || '/' || lpad(v_shot::text, 4, '0') || '-' || gen_random_uuid()::text || '.jpg';

  insert into public.photos (event_id, guest_id, shot_number, storage_path)
  values (e.id, v_guest, v_shot, v_path)
  returning id into v_id;

  update public.events set
    shots_used = v_shot,
    activity_at = now(),
    status = case when v_shot >= e.total_shots then 'voting' else status end,
    voting_ends_at = case when v_shot >= e.total_shots
                          then now() + make_interval(mins => e.voting_minutes)
                          else voting_ends_at end
  where id = e.id;

  return query select v_id, v_path, v_shot;
end $$;

create or replace function public.confirm_photo(p_photo_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
begin
  update public.photos p set uploaded = true
  where p.id = p_photo_id
    and p.guest_id in (select id from public.guests where user_id = auth.uid() and removed_at is null)
    and exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = p.storage_path)
  returning p.event_id into v_event;

  if v_event is null then raise exception 'UPLOAD_NOT_FOUND'; end if;
  update public.events set activity_at = now() where id = v_event;
end $$;

-- p_value: 1 = mejor, -1 = peor, 0 = sacar voto. Se vota durante toda la fiesta.
create or replace function public.vote(p_photo_id uuid, p_value int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.photos;
  e public.events;
  v_guest uuid;
begin
  select * into p from public.photos where id = p_photo_id and uploaded;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  select * into e from public.events where id = p.event_id;

  v_guest := private.my_guest_id(p.event_id);
  if v_guest is null then raise exception 'NOT_A_GUEST'; end if;
  if private.phase(e) = 'closed' then raise exception 'EVENT_CLOSED'; end if;
  if p.guest_id = v_guest then raise exception 'OWN_PHOTO'; end if;

  if p_value = 0 then
    delete from public.votes where photo_id = p.id and guest_id = v_guest;
  elsif p_value in (-1, 1) then
    insert into public.votes (photo_id, guest_id, value) values (p.id, v_guest, p_value)
    on conflict (photo_id, guest_id) do update set value = excluded.value, created_at = now();
  else
    raise exception 'BAD_VOTE';
  end if;

  update public.events set activity_at = now() where id = e.id;
end $$;

-- "Quiero esta": se puede marcar mientras el invitado ve las fotos (fiesta y votación).
create or replace function public.toggle_want(p_photo_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  p public.photos;
  e public.events;
  v_guest uuid;
begin
  select * into p from public.photos where id = p_photo_id and uploaded;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  select * into e from public.events where id = p.event_id;

  v_guest := private.my_guest_id(p.event_id);
  if v_guest is null then raise exception 'NOT_A_GUEST'; end if;
  if e.delivered_at is not null then raise exception 'ALREADY_DELIVERED'; end if;
  if private.phase(e) = 'closed' and e.host_id <> auth.uid() then raise exception 'ALBUM_LOCKED'; end if;

  if exists (select 1 from public.wants where photo_id = p.id and guest_id = v_guest) then
    delete from public.wants where photo_id = p.id and guest_id = v_guest;
    return false;
  end if;

  insert into public.wants (photo_id, guest_id) values (p.id, v_guest);
  return true;
end $$;

create or replace function public.album(p_event_id uuid)
returns table (
  id uuid, shot_number int, storage_path text, created_at timestamptz, author text,
  is_mine boolean, hidden boolean, ups int, downs int, my_vote int, wanted boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  e public.events;
  v_gid uuid;
  v_host boolean;
begin
  select * into e from public.events where events.id = p_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  v_gid := private.my_guest_id(p_event_id);
  v_host := e.host_id = auth.uid();
  if v_gid is null and not v_host then raise exception 'NOT_A_GUEST'; end if;
  if not v_host and private.phase(e) = 'closed' and e.delivered_at is null then raise exception 'ALBUM_LOCKED'; end if;

  return query
  select
    p.id, p.shot_number, p.storage_path, p.created_at, g.name,
    p.guest_id = v_gid,
    p.hidden,
    (select count(*) from public.votes v where v.photo_id = p.id and v.value = 1)::int,
    (select count(*) from public.votes v where v.photo_id = p.id and v.value = -1)::int,
    coalesce((select v.value from public.votes v where v.photo_id = p.id and v.guest_id = v_gid), 0)::int,
    exists (select 1 from public.wants w where w.photo_id = p.id and w.guest_id = v_gid)
  from public.photos p
  join public.guests g on g.id = p.guest_id
  where p.event_id = p_event_id and p.uploaded and (v_host or not p.hidden)
  order by p.shot_number desc;
end $$;

-- ---------- Acciones del anfitrión ----------

create or replace function public.host_guests(p_event_id uuid)
returns table (id uuid, name text, email text, photos int, joined_at timestamptz, is_host boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  return query
  select g.id, g.name, g.email,
         (select count(*) from public.photos p where p.guest_id = g.id and p.uploaded)::int,
         g.created_at,
         g.user_id = e.host_id
  from public.guests g where g.event_id = p_event_id and g.removed_at is null
  order by g.created_at;
end $$;

-- Quitar a alguien: pierde el acceso al evento y no recibe el álbum. Sus fotos quedan.
create or replace function public.remove_guest(p_event_id uuid, p_guest_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  update public.guests set removed_at = now()
  where id = p_guest_id and event_id = e.id and user_id <> e.host_id and removed_at is null;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  update public.events set activity_at = now() where id = e.id;
end $$;

-- QR nuevo: el anterior deja de servir para sumarse (los que ya están, siguen).
create or replace function public.rotate_join_secret(p_event_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
  v_secret text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  insert into public.event_secrets (event_id, join_secret) values (e.id, v_secret)
  on conflict (event_id) do update set join_secret = excluded.join_secret;
  return v_secret;
end $$;

-- "Comenzar": activa el QR para disparar.
create or replace function public.start_now(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  if private.phase(e) <> 'scheduled' then raise exception 'NOT_ALLOWED'; end if;
  update public.events set status = 'open', starts_at = now(), activity_at = now() where id = e.id;
end $$;

-- "Terminar fiesta": corta los disparos aunque queden fotos y abre la votación final.
create or replace function public.end_shots(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  if private.phase(e) not in ('open', 'scheduled') then raise exception 'NOT_ALLOWED'; end if;
  update public.events set
    status = 'voting',
    voting_ends_at = now() + make_interval(mins => voting_minutes),
    activity_at = now()
  where id = e.id;
end $$;

create or replace function public.extend_voting(p_event_id uuid, p_minutes int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  if p_minutes not between 1 and 1440 then raise exception 'BAD_MINUTES'; end if;
  if private.phase(e) <> 'voting' then raise exception 'NOT_ALLOWED'; end if;
  update public.events set
    status = 'voting',
    voting_ends_at = greatest(private.voting_deadline(e), now()) + make_interval(mins => p_minutes),
    activity_at = now()
  where id = e.id;
end $$;

create or replace function public.close_album(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  update public.events set
    status = 'closed',
    voting_ends_at = least(coalesce(private.voting_deadline(e), now()), now()),
    activity_at = now()
  where id = e.id;
end $$;

-- Edición: el anfitrión decide qué queda en el álbum final. Ocultar no borra la foto.
create or replace function public.set_photo_hidden(p_photo_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.photos;
  e public.events;
begin
  select * into p from public.photos where id = p_photo_id and uploaded;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  e := private.assert_host(p.event_id);
  if private.phase(e) <> 'closed' then raise exception 'EVENT_NOT_CLOSED'; end if;
  if e.delivered_at is not null then raise exception 'ALREADY_DELIVERED'; end if;

  update public.photos set hidden = p_hidden where id = p.id;
  if p_hidden and e.cover_photo_id = p.id then
    update public.events set cover_photo_id = null where id = e.id;
  end if;
end $$;

-- La nota para los invitados se puede escribir en cualquier momento antes de la entrega.
create or replace function public.set_album_details(p_event_id uuid, p_message text, p_cover_photo_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  if e.delivered_at is not null then raise exception 'ALREADY_DELIVERED'; end if;
  if p_cover_photo_id is not null and not exists (
    select 1 from public.photos where id = p_cover_photo_id and event_id = e.id and uploaded and not hidden
  ) then raise exception 'PHOTO_NOT_FOUND'; end if;

  update public.events set
    message = nullif(trim(p_message), ''),
    cover_photo_id = p_cover_photo_id
  where id = e.id;
end $$;

-- Lo usa el script de Google Drive, con la sesión del anfitrión. Los invitados quitados no reciben nada.
create or replace function public.host_export(p_event_id uuid) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  if private.phase(e) <> 'closed' then raise exception 'EVENT_NOT_CLOSED'; end if;

  return json_build_object(
    'event', json_build_object(
      'id', e.id, 'name', e.name, 'code', e.code, 'created_at', e.created_at,
      'message', e.message,
      'cover_path', (select storage_path from public.photos where id = e.cover_photo_id and not hidden),
      'drive_folder_url', e.drive_folder_url
    ),
    'guests', (
      select coalesce(json_agg(json_build_object('name', g.name, 'email', g.email) order by g.created_at), '[]'::json)
      from public.guests g where g.event_id = e.id and g.removed_at is null
    ),
    'photos', (
      select coalesce(json_agg(t order by t.shot_number), '[]'::json) from (
        select
          p.id, p.shot_number, p.storage_path,
          g.name as author, g.email as author_email,
          (select coalesce(sum(v.value), 0) from public.votes v where v.photo_id = p.id)::int as score,
          (select count(*) from public.votes v where v.photo_id = p.id and v.value = 1)::int as ups,
          (select coalesce(json_agg(gw.email), '[]'::json)
             from public.wants w join public.guests gw on gw.id = w.guest_id
             where w.photo_id = p.id and gw.removed_at is null) as wanted_by
        from public.photos p join public.guests g on g.id = p.guest_id
        where p.event_id = e.id and p.uploaded and not p.hidden
      ) t
    )
  );
end $$;

create or replace function public.mark_delivered(p_event_id uuid, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.events := private.assert_host(p_event_id);
begin
  if private.phase(e) <> 'closed' then raise exception 'EVENT_NOT_CLOSED'; end if;
  update public.events set drive_folder_url = p_url, delivered_at = now(), activity_at = now() where id = e.id;
end $$;

-- Sin sesión solo se puede ver la invitación (con la clave del QR); todo lo demás requiere mail verificado.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
grant  execute on function public.event_preview(text, text) to anon;

-- ---------------------------------------------------------------------
-- Storage: bucket PRIVADO de fotos (solo JPG, máx 8 MB, sin borrar ni reemplazar)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 8388608, array['image/jpeg'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mementos_upload_reserved" on storage.objects;
create policy "mementos_upload_reserved" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and private.can_upload(name));

drop policy if exists "mementos_view_allowed" on storage.objects;
create policy "mementos_view_allowed" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and private.can_view_object(name));

-- ---------------------------------------------------------------------
-- Realtime: cada cambio del evento avisa a todos los teléfonos
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;
