-- =====================================================================
-- Mementos — esquema completo de Supabase
-- Pegalo ENTERO en Supabase → SQL Editor → New query → Run.
-- Se puede volver a correr sin romper nada (es idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------

create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null check (char_length(name) between 1 and 80),
  host_id          uuid not null,
  total_shots      int  not null check (total_shots between 1 and 2000),
  max_per_guest    int  check (max_per_guest is null or max_per_guest >= 1),
  shots_used       int  not null default 0,
  voting_minutes   int  not null default 60 check (voting_minutes between 0 and 10080),
  status           text not null default 'open' check (status in ('open', 'voting', 'closed')),
  voting_ends_at   timestamptz,
  activity_at      timestamptz not null default now(),  -- se toca en cada cambio: dispara el realtime
  drive_folder_url text,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now(),
  constraint shots_within_total check (shots_used between 0 and total_shots)
);

create table if not exists public.guests (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null,
  name       text not null check (char_length(name) between 1 and 40),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  guest_id     uuid not null references public.guests(id) on delete cascade,
  shot_number  int  not null,
  storage_path text not null unique,
  uploaded     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (event_id, shot_number)
);
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

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- Fase real del evento: la votación final se cierra sola al vencer el tiempo.
create or replace function public.phase(e public.events) returns text
language sql stable as $$
  select case
    when e.status = 'voting' and e.voting_ends_at is not null and now() >= e.voting_ends_at then 'closed'
    else e.status
  end
$$;

create or replace function public.my_guest_id(p_event_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from guests where event_id = p_event_id and user_id = auth.uid() limit 1
$$;

create or replace function public.can_see_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guests where event_id = p_event_id and user_id = auth.uid())
      or exists (select 1 from events where id = p_event_id and host_id = auth.uid())
$$;

-- Solo se puede subir un archivo al path que el servidor reservó para vos y que todavía no se subió.
create or replace function public.can_upload(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos p join guests g on g.id = p.guest_id
    where p.storage_path = p_name and g.user_id = auth.uid() and not p.uploaded
  )
$$;

create or replace function public.new_event_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from events where code = candidate);
  end loop;
  return candidate;
end $$;

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
  using (public.can_see_event(id));

drop policy if exists guests_read_own on public.guests;
create policy guests_read_own on public.guests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists photos_read on public.photos;
create policy photos_read on public.photos for select to authenticated
  using (uploaded and public.can_see_event(event_id));

drop policy if exists votes_read_own on public.votes;
create policy votes_read_own on public.votes for select to authenticated
  using (guest_id in (select id from public.guests where user_id = auth.uid()));

drop policy if exists wants_read_own on public.wants;
create policy wants_read_own on public.wants for select to authenticated
  using (guest_id in (select id from public.guests where user_id = auth.uid()));

-- Sin políticas de insert/update/delete: nadie puede borrar ni editar fotos, ni siquiera quien organiza.

-- ---------------------------------------------------------------------
-- Funciones que usa la app
-- ---------------------------------------------------------------------

create or replace function public.create_event(
  p_name text, p_total_shots int, p_voting_minutes int, p_max_per_guest int,
  p_host_name text, p_host_email text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_event events;
begin
  if auth.uid() is null then raise exception 'NO_SESSION'; end if;
  insert into events (code, name, host_id, total_shots, voting_minutes, max_per_guest)
  values (new_event_code(), trim(p_name), auth.uid(), p_total_shots, coalesce(p_voting_minutes, 60), p_max_per_guest)
  returning * into v_event;

  insert into guests (event_id, user_id, name, email)
  values (v_event.id, auth.uid(), trim(p_host_name), lower(trim(p_host_email)));

  return v_event.code;
end $$;

create or replace function public.get_event(p_code text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  e events;
  g guests;
begin
  select * into e from events where code = upper(trim(p_code));
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  select * into g from guests where event_id = e.id and user_id = auth.uid() limit 1;

  return json_build_object(
    'id', e.id,
    'code', e.code,
    'name', e.name,
    'total_shots', e.total_shots,
    'shots_used', e.shots_used,
    'max_per_guest', e.max_per_guest,
    'voting_minutes', e.voting_minutes,
    'voting_ends_at', e.voting_ends_at,
    'phase', phase(e),
    'delivered_at', e.delivered_at,
    'drive_folder_url', case when g.id is not null then e.drive_folder_url end,
    'is_host', e.host_id = auth.uid(),
    'guest', case when g.id is null then null
                  else json_build_object('id', g.id, 'name', g.name, 'email', g.email) end,
    'my_shots', (select count(*) from photos where guest_id = g.id),
    'guests_count', (select count(*) from guests where event_id = e.id)
  );
end $$;

create or replace function public.join_event(p_code text, p_name text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e events;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'NO_SESSION'; end if;
  select * into e from events where code = upper(trim(p_code));
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if phase(e) = 'closed' then raise exception 'EVENT_CLOSED'; end if;

  insert into guests (event_id, user_id, name, email)
  values (e.id, auth.uid(), trim(p_name), lower(trim(p_email)))
  on conflict (event_id, user_id) do update set name = excluded.name, email = excluded.email
  returning id into v_id;

  update events set activity_at = now() where id = e.id;
  return v_id;
end $$;

-- Reserva un disparo de forma atómica. El disparo se gasta acá: no hay "repetir".
create or replace function public.take_shot(p_event_id uuid)
returns table (photo_id uuid, storage_path text, shot_number int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  e events;
  v_guest uuid;
  v_mine int;
  v_shot int;
  v_path text;
  v_id uuid;
begin
  v_guest := my_guest_id(p_event_id);
  if v_guest is null then raise exception 'NOT_A_GUEST'; end if;

  select * into e from events where id = p_event_id for update;
  if phase(e) = 'closed' then raise exception 'EVENT_CLOSED'; end if;
  if phase(e) <> 'open' or e.shots_used >= e.total_shots then raise exception 'NO_SHOTS_LEFT'; end if;

  if e.max_per_guest is not null then
    select count(*) into v_mine from photos where guest_id = v_guest;
    if v_mine >= e.max_per_guest then raise exception 'GUEST_LIMIT'; end if;
  end if;

  v_shot := e.shots_used + 1;
  v_path := e.id::text || '/' || lpad(v_shot::text, 4, '0') || '-' || gen_random_uuid()::text || '.jpg';

  insert into photos (event_id, guest_id, shot_number, storage_path)
  values (e.id, v_guest, v_shot, v_path)
  returning id into v_id;

  update events set
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
language plpgsql security definer set search_path = public, storage as $$
declare
  v_event uuid;
begin
  update public.photos p set uploaded = true
  where p.id = p_photo_id
    and p.guest_id in (select id from public.guests where user_id = auth.uid())
    and exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = p.storage_path)
  returning p.event_id into v_event;

  if v_event is null then raise exception 'UPLOAD_NOT_FOUND'; end if;
  update public.events set activity_at = now() where id = v_event;
end $$;

-- p_value: 1 = mejor, -1 = peor, 0 = sacar voto. Se vota durante todo el evento.
create or replace function public.vote(p_photo_id uuid, p_value int) returns void
language plpgsql security definer set search_path = public as $$
declare
  p photos;
  e events;
  v_guest uuid;
begin
  select * into p from photos where id = p_photo_id and uploaded;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  select * into e from events where id = p.event_id;

  v_guest := my_guest_id(p.event_id);
  if v_guest is null then raise exception 'NOT_A_GUEST'; end if;
  if phase(e) = 'closed' then raise exception 'EVENT_CLOSED'; end if;
  if p.guest_id = v_guest then raise exception 'OWN_PHOTO'; end if;

  if p_value = 0 then
    delete from votes where photo_id = p.id and guest_id = v_guest;
  elsif p_value in (-1, 1) then
    insert into votes (photo_id, guest_id, value) values (p.id, v_guest, p_value)
    on conflict (photo_id, guest_id) do update set value = excluded.value, created_at = now();
  else
    raise exception 'BAD_VOTE';
  end if;

  update events set activity_at = now() where id = e.id;
end $$;

-- "Quiero esta": se puede marcar hasta que el álbum se entrega.
create or replace function public.toggle_want(p_photo_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  p photos;
  e events;
  v_guest uuid;
begin
  select * into p from photos where id = p_photo_id and uploaded;
  if not found then raise exception 'PHOTO_NOT_FOUND'; end if;
  select * into e from events where id = p.event_id;

  v_guest := my_guest_id(p.event_id);
  if v_guest is null then raise exception 'NOT_A_GUEST'; end if;
  if e.delivered_at is not null then raise exception 'ALREADY_DELIVERED'; end if;

  if exists (select 1 from wants where photo_id = p.id and guest_id = v_guest) then
    delete from wants where photo_id = p.id and guest_id = v_guest;
    return false;
  end if;

  insert into wants (photo_id, guest_id) values (p.id, v_guest);
  return true;
end $$;

create or replace function public.album(p_event_id uuid)
returns table (
  id uuid, shot_number int, storage_path text, created_at timestamptz, author text,
  is_mine boolean, ups int, downs int, my_vote int, wanted boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select my_guest_id(p_event_id) as gid)
  select
    p.id, p.shot_number, p.storage_path, p.created_at, g.name,
    p.guest_id = me.gid,
    (select count(*) from votes v where v.photo_id = p.id and v.value = 1)::int,
    (select count(*) from votes v where v.photo_id = p.id and v.value = -1)::int,
    coalesce((select v.value from votes v where v.photo_id = p.id and v.guest_id = me.gid), 0)::int,
    exists (select 1 from wants w where w.photo_id = p.id and w.guest_id = me.gid)
  from photos p
  join guests g on g.id = p.guest_id
  cross join me
  where p.event_id = p_event_id and p.uploaded and me.gid is not null
  order by p.shot_number desc
$$;

-- ---------- Acciones de quien organiza ----------

create or replace function public.end_shots(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update events set
    status = 'voting',
    voting_ends_at = now() + make_interval(mins => voting_minutes),
    activity_at = now()
  where id = p_event_id and host_id = auth.uid() and status = 'open';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

create or replace function public.extend_voting(p_event_id uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_minutes not between 1 and 1440 then raise exception 'BAD_MINUTES'; end if;
  update events set
    voting_ends_at = greatest(coalesce(voting_ends_at, now()), now()) + make_interval(mins => p_minutes),
    activity_at = now()
  where id = p_event_id and host_id = auth.uid() and status = 'voting' and delivered_at is null;
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

create or replace function public.close_album(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update events set
    status = 'closed',
    voting_ends_at = least(coalesce(voting_ends_at, now()), now()),
    activity_at = now()
  where id = p_event_id and host_id = auth.uid();
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

-- Lo usa el script de Google Drive, con la sesión de quien organiza.
create or replace function public.host_export(p_event_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  e events;
begin
  select * into e from events where id = p_event_id and host_id = auth.uid();
  if not found then raise exception 'NOT_ALLOWED'; end if;
  if phase(e) <> 'closed' then raise exception 'EVENT_NOT_CLOSED'; end if;

  return json_build_object(
    'event', json_build_object(
      'id', e.id, 'name', e.name, 'code', e.code, 'created_at', e.created_at,
      'drive_folder_url', e.drive_folder_url
    ),
    'guests', (
      select coalesce(json_agg(json_build_object('name', g.name, 'email', g.email) order by g.created_at), '[]'::json)
      from guests g where g.event_id = e.id
    ),
    'photos', (
      select coalesce(json_agg(t order by t.shot_number), '[]'::json) from (
        select
          p.id, p.shot_number, p.storage_path,
          g.name as author, g.email as author_email,
          (select coalesce(sum(v.value), 0) from votes v where v.photo_id = p.id)::int as score,
          (select count(*) from votes v where v.photo_id = p.id and v.value = 1)::int as ups,
          (select coalesce(json_agg(gw.email), '[]'::json)
             from wants w join guests gw on gw.id = w.guest_id where w.photo_id = p.id) as wanted_by
        from photos p join guests g on g.id = p.guest_id
        where p.event_id = e.id and p.uploaded
      ) t
    )
  );
end $$;

create or replace function public.mark_delivered(p_event_id uuid, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update events set drive_folder_url = p_url, delivered_at = now(), activity_at = now()
  where id = p_event_id and host_id = auth.uid();
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

-- Solo usuarios con sesión (los invitados entran con sesión anónima) pueden llamar funciones.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Storage: bucket de fotos (solo JPG, máx 8 MB, sin borrar ni reemplazar)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 8388608, array['image/jpeg'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mementos_upload_reserved" on storage.objects;
create policy "mementos_upload_reserved" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_upload(name));

-- ---------------------------------------------------------------------
-- Realtime: cada cambio del evento avisa a todos los teléfonos
-- ---------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;
