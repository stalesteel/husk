-- Husk: datamodell, tilgangsregler og bildelagring.
-- Kjøres én gang i Supabase sin SQL Editor. Se DESIGN.md for bakgrunnen.
--
-- Prinsipp for tilgang:
--   * Lesing er åpen for den som har lenken, men kun via funksjonene get_group og
--     get_list, som krever en konkret id. Tabellene kan ikke listes ut av anonyme.
--   * Redigering krever innlogging og at du eier gruppen eller er gitt
--     redigeringstilgang til den. Lister, steg og bilder arver fra gruppen.

begin;

-- ---------------------------------------------------------------------------
-- Tabeller
-- ---------------------------------------------------------------------------

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id),
  name        text not null check (length(trim(name)) > 0),
  description text not null default '',
  image_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index groups_owner_id_idx on public.groups (owner_id);

-- Andre enn eieren som har fått redigeringstilgang til en gruppe.
create table public.group_editors (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_editors_user_id_idx on public.group_editors (user_id);

create table public.lists (
  id                      uuid primary key default gen_random_uuid(),
  group_id                uuid not null references public.groups (id) on delete cascade,
  title                   text not null check (length(trim(title)) > 0),
  sort_order              integer not null default 0,
  require_all_images_seen boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index lists_group_id_idx on public.lists (group_id, sort_order);

-- Tittel og beskrivelse kan være tomme mens steget er under arbeid.
create table public.steps (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.lists (id) on delete cascade,
  sort_order  integer not null default 0,
  title       text not null default '',
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index steps_list_id_idx on public.steps (list_id, sort_order);

-- storage_path er stien i bucketen «images», på formen «<gruppe-id>/<filnavn>».
create table public.step_images (
  id           uuid primary key default gen_random_uuid(),
  step_id      uuid not null references public.steps (id) on delete cascade,
  sort_order   integer not null default 0,
  storage_path text not null,
  label        text check (label is null or length(label) <= 40),
  created_at   timestamptz not null default now()
);

create index step_images_step_id_idx on public.step_images (step_id, sort_order);

-- ---------------------------------------------------------------------------
-- Triggere
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();
create trigger lists_updated_at before update on public.lists
  for each row execute function public.set_updated_at();
create trigger steps_updated_at before update on public.steps
  for each row execute function public.set_updated_at();

-- Redaktører kan endre gruppen, men ikke overta den.
create function public.prevent_owner_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Eieren av en gruppe kan ikke endres' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger groups_owner_locked before update on public.groups
  for each row execute function public.prevent_owner_change();

-- ---------------------------------------------------------------------------
-- Hjelpefunksjoner for tilgangsreglene
-- security definer så de kan slå opp i groups/group_editors uten å gå i ring
-- gjennom tilgangsreglene på de samme tabellene.
-- ---------------------------------------------------------------------------

create function public.is_group_owner(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = auth.uid()
  );
$$;

create function public.can_edit_group(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = auth.uid()
  ) or exists (
    select 1 from public.group_editors
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create function public.can_edit_list(p_list_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_edit_group((select group_id from public.lists where id = p_list_id));
$$;

create function public.can_edit_step(p_step_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_edit_list((select list_id from public.steps where id = p_step_id));
$$;

-- Gruppe-id fra første mappe i en bildesti, eller null om den ikke er en uuid.
create function public.path_group_id(p_path text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when split_part(p_path, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_path, '/', 1)::uuid
  end;
$$;

-- ---------------------------------------------------------------------------
-- Rettigheter og tilgangsregler på tabellene
-- Anonyme får ingen direkte tabelltilgang; de leser via get_group/get_list.
-- ---------------------------------------------------------------------------

revoke all on public.groups, public.group_editors, public.lists, public.steps, public.step_images
  from anon, authenticated;
grant select, insert, update, delete
  on public.groups, public.group_editors, public.lists, public.steps, public.step_images
  to authenticated;

alter table public.groups        enable row level security;
alter table public.group_editors enable row level security;
alter table public.lists         enable row level security;
alter table public.steps         enable row level security;
alter table public.step_images   enable row level security;

-- groups
-- owner_id-sjekken i select er med så en nyopprettet gruppe kan returneres
-- i samme spørring som den lages i.
create policy "Redaktører ser gruppen" on public.groups
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_edit_group(id));

create policy "Innloggede kan opprette egne grupper" on public.groups
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Redaktører kan endre gruppen" on public.groups
  for update to authenticated
  using (public.can_edit_group(id))
  with check (public.can_edit_group(id));

create policy "Bare eieren kan slette gruppen" on public.groups
  for delete to authenticated
  using (public.is_group_owner(id));

-- group_editors
create policy "Eieren ser redaktørene, redaktøren ser seg selv" on public.group_editors
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_group_owner(group_id));

create policy "Bare eieren kan legge til redaktører" on public.group_editors
  for insert to authenticated
  with check (public.is_group_owner(group_id));

create policy "Eieren kan fjerne redaktører, redaktøren kan trekke seg" on public.group_editors
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_group_owner(group_id));

-- lists, steps, step_images: full tilgang for gruppens redaktører
create policy "Redaktører har full tilgang til lister" on public.lists
  for all to authenticated
  using (public.can_edit_group(group_id))
  with check (public.can_edit_group(group_id));

create policy "Redaktører har full tilgang til steg" on public.steps
  for all to authenticated
  using (public.can_edit_list(list_id))
  with check (public.can_edit_list(list_id));

create policy "Redaktører har full tilgang til bilder" on public.step_images
  for all to authenticated
  using (public.can_edit_step(step_id))
  with check (public.can_edit_step(step_id));

-- ---------------------------------------------------------------------------
-- Lesing for alle med lenken
-- ---------------------------------------------------------------------------

-- Gruppesiden: gruppen og knappene til listene. null om id-en ikke finnes.
create function public.get_group(p_group_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'description', g.description,
    'image_path',  g.image_path,
    'can_edit',    public.can_edit_group(g.id),
    'lists', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', l.id, 'title', l.title)
        order by l.sort_order, l.created_at
      )
      from public.lists l
      where l.group_id = g.id
    ), '[]'::jsonb)
  )
  from public.groups g
  where g.id = p_group_id;
$$;

-- En hel liste med steg og bilder, sortert. null om id-en ikke finnes.
create function public.get_list(p_list_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',                      l.id,
    'title',                   l.title,
    'require_all_images_seen', l.require_all_images_seen,
    'group',                   jsonb_build_object('id', g.id, 'name', g.name),
    'can_edit',                public.can_edit_group(g.id),
    'steps', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',          s.id,
          'title',       s.title,
          'description', s.description,
          'images', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', i.id, 'path', i.storage_path, 'label', i.label)
              order by i.sort_order, i.created_at
            )
            from public.step_images i
            where i.step_id = s.id
          ), '[]'::jsonb)
        )
        order by s.sort_order, s.created_at
      )
      from public.steps s
      where s.list_id = l.id
    ), '[]'::jsonb)
  )
  from public.lists l
  join public.groups g on g.id = l.group_id
  where l.id = p_list_id;
$$;

-- For UptimeRobot: en ekte spørring mot en tabell, så Supabase registrerer
-- aktivitet. Returnerer alltid true.
create function public.ping() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.groups) >= 0;
$$;

-- ---------------------------------------------------------------------------
-- Redaktører, for eieren
-- ---------------------------------------------------------------------------

-- Gir en eksisterende bruker redigeringstilgang, slått opp på e-post.
-- Brukeren må ha logget inn minst én gang for å finnes.
create function public.add_group_editor(p_group_id uuid, p_email text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user_id uuid;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Bare eieren kan gi redigeringstilgang' using errcode = '42501';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception 'Fant ingen bruker med e-postadressen %', p_email using errcode = 'P0002';
  end if;

  insert into public.group_editors (group_id, user_id)
  values (p_group_id, v_user_id)
  on conflict do nothing;

  return v_user_id;
end $$;

-- Redaktørene i en gruppe med e-postadresse. Tom for andre enn eieren.
create function public.get_group_editors(p_group_id uuid)
returns table (user_id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select e.user_id, u.email::text
  from public.group_editors e
  join auth.users u on u.id = e.user_id
  where e.group_id = p_group_id
    and public.is_group_owner(p_group_id)
  order by u.email;
$$;

-- ---------------------------------------------------------------------------
-- Rettigheter på funksjonene
-- Supabase gir anon og authenticated execute på nye funksjoner automatisk,
-- så alt strammes inn eksplisitt her.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_group_owner(uuid),
  public.can_edit_group(uuid),
  public.can_edit_list(uuid),
  public.can_edit_step(uuid),
  public.path_group_id(text),
  public.get_group(uuid),
  public.get_list(uuid),
  public.ping(),
  public.add_group_editor(uuid, text),
  public.get_group_editors(uuid)
from public, anon, authenticated;

grant execute on function
  public.get_group(uuid),
  public.get_list(uuid),
  public.ping()
to anon, authenticated;

grant execute on function
  public.is_group_owner(uuid),
  public.can_edit_group(uuid),
  public.can_edit_list(uuid),
  public.can_edit_step(uuid),
  public.path_group_id(text),
  public.add_group_editor(uuid, text),
  public.get_group_editors(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Bildelagring
-- Offentlig bucket: hvem som helst kan hente et bilde når de kjenner stien,
-- men ingen andre enn gruppens redaktører kan liste, laste opp eller slette.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Redaktører ser gruppens bilder" on storage.objects
  for select to authenticated
  using (bucket_id = 'images' and public.can_edit_group(public.path_group_id(name)));

create policy "Redaktører kan laste opp bilder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'images' and public.can_edit_group(public.path_group_id(name)));

create policy "Redaktører kan erstatte bilder" on storage.objects
  for update to authenticated
  using (bucket_id = 'images' and public.can_edit_group(public.path_group_id(name)))
  with check (bucket_id = 'images' and public.can_edit_group(public.path_group_id(name)));

create policy "Redaktører kan slette bilder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and public.can_edit_group(public.path_group_id(name)));

commit;
