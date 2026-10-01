-- Husk: selvregistrering som administratoren slår av og på.
-- Kjøres én gang i Supabase sin SQL Editor, etter 20260930000000_roller.sql.
--
-- Når registreringen er åpen, kan hvem som helst lage sin egen bruker fra
-- forsiden og blir full bruker med en gang. Den er åpen til en sluttdato og for
-- et største antall nye brukere, og kan i tillegg kreve en kode. Den stenger av
-- seg selv når sluttdatoen er passert eller taket er nådd.
--
-- Selve registreringen gjøres av Edge Function-en «registrer»
-- (supabase/functions/registrer), som bruker signup_check under. Åpen
-- registrering i Supabase (Authentication) forblir slått av.
--
-- (I databasen heter en perm fortsatt «group».)

begin;

-- ---------------------------------------------------------------------------
-- Innstillingene (én rad) og hvem som har registrert seg selv
-- ---------------------------------------------------------------------------

create table public.signup_settings (
  id          boolean primary key default true check (id),
  open_until  timestamptz,                -- null: stengt
  max_signups integer not null default 20 check (max_signups between 1 and 500),
  code        text check (code is null or length(code) between 1 and 40),
  opened_at   timestamptz                 -- nye brukere telles fra hit
);

insert into public.signup_settings default values;

create table public.self_signups (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.signup_settings enable row level security;
alter table public.self_signups enable row level security;
revoke all on public.signup_settings, public.self_signups from anon, authenticated;

-- Alt om registreringen, regnet ut på ett sted.
create function public.signup_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'open_until', s.open_until,
    'max_signups', s.max_signups,
    'code', s.code,
    'opened_at', s.opened_at,
    'used', u.used,
    'open', s.open_until is not null and s.open_until > now() and u.used < s.max_signups)
  from public.signup_settings s
  cross join lateral (
    select count(*)::integer as used
    from public.self_signups x
    where s.opened_at is not null and x.created_at >= s.opened_at
  ) u;
$$;

-- For forsiden og innloggingen: er den åpen, og trengs det kode? Koden selv
-- og antallet vises aldri.
create function public.signup_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'open', (i ->> 'open')::boolean,
    'needs_code', i ->> 'code' is not null)
  from public.signup_info() i;
$$;

-- For Edge Function-en: 'ok', 'closed' eller 'wrong_code'. Store og små
-- bokstaver i koden spiller ingen rolle.
create function public.signup_check(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not (i ->> 'open')::boolean then 'closed'
    when i ->> 'code' is not null
         and lower(trim(coalesce(p_code, ''))) <> lower(i ->> 'code') then 'wrong_code'
    else 'ok'
  end
  from public.signup_info() i;
$$;

-- ---------------------------------------------------------------------------
-- Admin-siden
-- ---------------------------------------------------------------------------

create function public.admin_get_signup() returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.signup_info() where public.is_admin();
$$;

-- Åpner (sluttdato i fremtiden), endrer, eller stenger (sluttdato null).
-- Åpnes den etter å ha vært stengt, telles nye brukere fra null igjen.
create function public.admin_set_signup(p_open_until timestamptz, p_max integer, p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Bare administratorer kan endre registreringen' using errcode = '42501';
  end if;
  if p_open_until is not null and p_open_until <= now() then
    raise exception 'Sluttdatoen må være frem i tid' using errcode = '22023';
  end if;

  update public.signup_settings set
    opened_at = case
      when p_open_until is not null and (open_until is null or open_until <= now()) then now()
      else opened_at
    end,
    open_until = p_open_until,
    max_signups = coalesce(p_max, max_signups),
    code = nullif(trim(coalesce(p_code, '')), '')
  where id;

  return public.signup_info();
end $$;

-- Brukerlisten får med når en bruker registrerte seg selv.
drop function public.admin_list_users();

create function public.admin_list_users()
returns table (
  user_id uuid, email text, is_admin boolean, is_full boolean,
  owned_groups bigint, edited_groups bigint, invited boolean, last_sign_in_at timestamptz,
  self_signed_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text,
         exists (select 1 from public.admins a where a.user_id = u.id),
         exists (select 1 from public.full_users f where f.user_id = u.id),
         (select count(*) from public.groups g where g.owner_id = u.id),
         (select count(*) from public.group_editors e where e.user_id = u.id),
         u.last_sign_in_at is null,
         u.last_sign_in_at,
         (select s.created_at from public.self_signups s where s.user_id = u.id)
  from auth.users u
  where public.is_admin()
  order by lower(u.email);
$$;

-- ---------------------------------------------------------------------------
-- Rettigheter
-- ---------------------------------------------------------------------------

revoke execute on function
  public.signup_info(),
  public.signup_status(),
  public.signup_check(text),
  public.admin_get_signup(),
  public.admin_set_signup(timestamptz, integer, text),
  public.admin_list_users()
from public, anon, authenticated;

grant execute on function public.signup_status() to anon, authenticated;

grant execute on function
  public.admin_get_signup(),
  public.admin_set_signup(timestamptz, integer, text),
  public.admin_list_users()
to authenticated;

grant execute on function public.signup_check(text) to service_role;

commit;

-- Viser innstillingene: stengt til du åpner fra admin-siden.
select public.signup_info() as registrering;
