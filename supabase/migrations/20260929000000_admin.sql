-- Husk: administratorer med full tilgang til alle grupper, for å kunne rydde,
-- og høyere tegngrense for bildeetiketter.
-- Kjøres én gang i Supabase sin SQL Editor, etter 20260928000000_datamodell.sql.
--
-- Administratorer kan lese, redigere og slette alt, og styre redaktørene i alle
-- grupper. Det skjer ved at hjelpefunksjonene som tilgangsreglene bygger på
-- (is_group_owner og can_edit_group), også svarer ja for administratorer.
-- Selve tilgangsreglene er uendret.
--
-- get_group og get_list skiller fortsatt på om du er eier/redaktør (can_edit)
-- og om du er administrator (is_admin), så appen kan holde adminmodus adskilt
-- fra vanlig bruk.

begin;

-- ---------------------------------------------------------------------------
-- Administratorer
-- Ingen tilgang via API-et; tabellen endres bare her i SQL Editor.
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

insert into public.admins (user_id)
select id from auth.users where lower(email) = 'stale@klommestein.no';

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Eier eller redaktør, uten administratorer. Brukes for can_edit i appen.
create function public.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = auth.uid()
  ) or exists (
    select 1 from public.group_editors
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Hjelpefunksjonene for tilgangsreglene: administratorer får ja
-- ---------------------------------------------------------------------------

create or replace function public.is_group_owner(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = auth.uid()
  );
$$;

create or replace function public.can_edit_group(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or public.is_group_member(p_group_id);
$$;

-- ---------------------------------------------------------------------------
-- Lesing: can_edit gjelder bare eier og redaktør, is_admin sier om du er
-- administrator
-- ---------------------------------------------------------------------------

create or replace function public.get_group(p_group_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'description', g.description,
    'image_path',  g.image_path,
    'can_edit',    public.is_group_member(g.id),
    'is_admin',    public.is_admin(),
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

create or replace function public.get_list(p_list_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',                      l.id,
    'title',                   l.title,
    'require_all_images_seen', l.require_all_images_seen,
    'group',                   jsonb_build_object('id', g.id, 'name', g.name),
    'can_edit',                public.is_group_member(g.id),
    'is_admin',                public.is_admin(),
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

-- Alle grupper med eier og antall lister, for adminmodus. Tom for andre.
create function public.admin_list_groups()
returns table (id uuid, name text, owner_email text, list_count bigint, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, u.email::text,
         (select count(*) from public.lists l where l.group_id = g.id),
         g.created_at
  from public.groups g
  join auth.users u on u.id = g.owner_id
  where public.is_admin()
  order by lower(g.name);
$$;

-- ---------------------------------------------------------------------------
-- Bildeetiketter: grensen er nå at etiketten får plass på én linje på bildet
-- (sjekkes i appen). Tegngrensen heves fra 40 til 60 og er bare en sikring.
-- ---------------------------------------------------------------------------

alter table public.step_images drop constraint if exists step_images_label_check;
alter table public.step_images add constraint step_images_label_check
  check (label is null or length(label) <= 60);

-- ---------------------------------------------------------------------------
-- Rettigheter på de nye funksjonene (endrede funksjoner beholder sine)
-- ---------------------------------------------------------------------------

revoke execute on function
  public.is_admin(),
  public.is_group_member(uuid),
  public.admin_list_groups()
from public, anon, authenticated;

grant execute on function
  public.is_admin(),
  public.is_group_member(uuid),
  public.admin_list_groups()
to authenticated;

commit;

-- Viser om administratoren ble lagt inn (skal gi én rad).
select u.email as administrator
from public.admins a
join auth.users u on u.id = a.user_id;
