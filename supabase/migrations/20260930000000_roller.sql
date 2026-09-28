-- Husk: roller og invitasjon fra appen.
-- Kjøres én gang i Supabase sin SQL Editor, etter 20260929000000_admin.sql.
--
-- Tre roller:
--   * Administrator (tabellen admins): full tilgang til alt, kan invitere fulle
--     brukere og gi og ta roller.
--   * Full bruker (tabellen full_users): kan lage egne grupper.
--   * Redaktør (alle andre): kan bare redigere grupper de er lagt til i.
--
-- Invitasjoner sendes av Edge Function-en «inviter» (supabase/functions/inviter),
-- som bruker funksjonen user_id_by_email under. Alle som finnes i dag, blir
-- fulle brukere, så ingen mister muligheten til å lage grupper.

begin;

-- ---------------------------------------------------------------------------
-- Fulle brukere
-- ---------------------------------------------------------------------------

create table public.full_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.full_users enable row level security;
revoke all on public.full_users from anon, authenticated;

insert into public.full_users (user_id)
select id from auth.users
on conflict do nothing;

create function public.can_create_groups() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin()
      or exists (select 1 from public.full_users where user_id = auth.uid());
$$;

-- Bare fulle brukere og administratorer kan lage grupper.
drop policy "Innloggede kan opprette egne grupper" on public.groups;
create policy "Fulle brukere kan opprette egne grupper" on public.groups
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.can_create_groups());

-- ---------------------------------------------------------------------------
-- For Edge Function-en: finn en bruker på e-post. Bare med den hemmelige
-- nøkkelen (service_role), aldri fra nettleseren.
-- ---------------------------------------------------------------------------

create function public.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Redaktørene i en gruppe: nå også om de har tatt imot invitasjonen
-- ---------------------------------------------------------------------------

drop function public.get_group_editors(uuid);

create function public.get_group_editors(p_group_id uuid)
returns table (user_id uuid, email text, invited boolean)
language sql stable security definer set search_path = '' as $$
  select e.user_id, u.email::text, u.last_sign_in_at is null
  from public.group_editors e
  join auth.users u on u.id = e.user_id
  where e.group_id = p_group_id
    and public.is_group_owner(p_group_id)
  order by u.email;
$$;

-- ---------------------------------------------------------------------------
-- Admin-siden
-- ---------------------------------------------------------------------------

-- Alle brukere med rolle. Tom for andre enn administratorer.
create function public.admin_list_users()
returns table (
  user_id uuid, email text, is_admin boolean, is_full boolean,
  owned_groups bigint, edited_groups bigint, invited boolean, last_sign_in_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text,
         exists (select 1 from public.admins a where a.user_id = u.id),
         exists (select 1 from public.full_users f where f.user_id = u.id),
         (select count(*) from public.groups g where g.owner_id = u.id),
         (select count(*) from public.group_editors e where e.user_id = u.id),
         u.last_sign_in_at is null,
         u.last_sign_in_at
  from auth.users u
  where public.is_admin()
  order by lower(u.email);
$$;

-- Full bruker eller ikke. En som mister rollen, beholder gruppene sine, men
-- kan ikke lage nye.
create function public.admin_set_full(p_user_id uuid, p_full boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan endre roller' using errcode = '42501';
  end if;
  if p_full then
    insert into public.full_users (user_id) values (p_user_id) on conflict do nothing;
  else
    if exists (select 1 from public.admins where user_id = p_user_id) then
      raise exception 'Fjern administratorrollen først' using errcode = '42501';
    end if;
    delete from public.full_users where user_id = p_user_id;
  end if;
end $$;

-- Administrator eller ikke. En administrator er også alltid full bruker.
-- Du kan ikke fjerne din egen rolle, så du ikke stenger deg selv ute.
create function public.admin_set_admin(p_user_id uuid, p_admin boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan endre roller' using errcode = '42501';
  end if;
  if p_admin then
    insert into public.admins (user_id) values (p_user_id) on conflict do nothing;
    insert into public.full_users (user_id) values (p_user_id) on conflict do nothing;
  else
    if p_user_id = auth.uid() then
      raise exception 'Du kan ikke fjerne din egen administratorrolle' using errcode = '42501';
    end if;
    delete from public.admins where user_id = p_user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Rettigheter
-- ---------------------------------------------------------------------------

revoke execute on function
  public.can_create_groups(),
  public.user_id_by_email(text),
  public.get_group_editors(uuid),
  public.admin_list_users(),
  public.admin_set_full(uuid, boolean),
  public.admin_set_admin(uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.can_create_groups(),
  public.get_group_editors(uuid),
  public.admin_list_users(),
  public.admin_set_full(uuid, boolean),
  public.admin_set_admin(uuid, boolean)
to authenticated;

grant execute on function public.user_id_by_email(text) to service_role;

commit;

-- Viser rollene etter endringen.
select u.email,
       exists (select 1 from public.admins a where a.user_id = u.id) as administrator,
       exists (select 1 from public.full_users f where f.user_id = u.id) as full_bruker
from auth.users u
order by u.email;
