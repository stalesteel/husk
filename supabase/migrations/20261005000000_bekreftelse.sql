-- Husk: bekreftelse på e-post når en liste er gjennomført.
-- Kjøres én gang i Supabase sin SQL Editor, etter 20261001000000_selvregistrering.sql.
--
-- Eieren eller en redaktør slår det på per liste. Når gjesten har gått
-- gjennom listen, kan hen trykke «Send bekreftelse» på oppsummeringen, og
-- mottakerne (eieren og/eller valgte redaktører) får en e-post. Selve
-- sendingen gjøres av Edge Function-en «bekreft» (supabase/functions/bekreft),
-- som også logger hver bekreftelse og sperrer for mange på kort tid.
--
-- (I databasen heter en perm fortsatt «group».)

begin;

-- ---------------------------------------------------------------------------
-- Innstillingene på listen
-- ---------------------------------------------------------------------------

alter table public.lists
  add column confirm_enabled       boolean not null default false,  -- bekreftelse på
  add column confirm_to_owner      boolean not null default true,   -- eieren får e-post
  add column confirm_editors       uuid[]  not null default '{}',   -- redaktører som får e-post
  add column confirm_require_all   boolean not null default false,  -- alle punkter må være krysset av
  add column confirm_include_steps boolean not null default true,   -- punktene med status i e-posten
  add column confirm_comment       boolean not null default false,  -- gjesten kan skrive en kommentar
  add column confirm_require_name  boolean not null default false;  -- navnet må fylles ut

-- ---------------------------------------------------------------------------
-- Loggen: hver bekreftelse som er sendt
-- ---------------------------------------------------------------------------

create table public.confirmations (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists (id) on delete cascade,
  created_at timestamptz not null default now(),
  name       text,
  comment    text,
  done       integer not null,
  total      integer not null,
  recipients integer not null default 0
);

create index confirmations_list_idx on public.confirmations (list_id, created_at desc);

alter table public.confirmations enable row level security;
revoke all on public.confirmations from anon, authenticated;
grant select on public.confirmations to authenticated;

create policy "Redaktører kan se bekreftelsene" on public.confirmations
  for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and public.is_group_member(l.group_id)));

-- ---------------------------------------------------------------------------
-- get_list: også innstillingene for bekreftelse. Det gjesten trenger, får
-- alle; hvem som får e-post, ser bare de som kan redigere.
-- ---------------------------------------------------------------------------

create or replace function public.get_list(p_list_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',                      l.id,
    'title',                   l.title,
    'require_all_images_seen', l.require_all_images_seen,
    'group',                   jsonb_build_object('id', g.id, 'name', g.name),
    'can_edit',                public.is_group_member(g.id),
    'is_admin',                public.is_admin(),
    'confirm', jsonb_build_object(
      'enabled',      l.confirm_enabled,
      'require_all',  l.confirm_require_all,
      'comment',      l.confirm_comment,
      'require_name', l.confirm_require_name),
    'confirm_settings', case when public.is_group_member(g.id) then jsonb_build_object(
      'to_owner',      l.confirm_to_owner,
      'editors',       to_jsonb(l.confirm_editors),
      'include_steps', l.confirm_include_steps) end,
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

-- Hvem som kan velges som mottaker: eieren og redaktørene i permen.
-- Tom for andre enn dem som kan redigere.
create function public.confirm_candidates(p_list_id uuid)
returns table (user_id uuid, email text, is_owner boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, u.id = g.owner_id
  from public.lists l
  join public.groups g on g.id = l.group_id
  join auth.users u on u.id = g.owner_id
     or u.id in (select e.user_id from public.group_editors e where e.group_id = g.id)
  where l.id = p_list_id
    and public.is_group_member(g.id)
  order by u.id = g.owner_id desc, lower(u.email);
$$;

revoke execute on function public.confirm_candidates(uuid) from public, anon, authenticated;
grant execute on function public.confirm_candidates(uuid) to authenticated;

commit;
