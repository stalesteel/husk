-- Husk: loggen over bekreftelser tar vare på stegene, og gjesten kan legge
-- ved bilder.
-- Kjøres én gang i Supabase sin SQL Editor, etter 20261005000000_bekreftelse.sql.
-- Edge Function-en «bekreft» må oppdateres samtidig.
--
-- * Stegene lagres med tittel og om de ble krysset av, slik de var da
--   bekreftelsen ble sendt, så loggen viser hvilke det gjelder.
-- * Bilder er et valg per liste (av som standard). Serverfunksjonen lagrer dem
--   i en egen, lukket bucket («bekreftelser»), ikke i den åpne med bildene i
--   listene, og legger dem ved e-posten. Bare de som kan redigere permen,
--   kan se dem (fra loggen).
-- * Administratorer i adminmodus ser også loggen og bildene.

begin;

alter table public.confirmations
  add column steps  jsonb,                         -- [{ "title": "...", "done": true }, …]
  add column photos text[] not null default '{}';  -- stier i bucketen «bekreftelser»

alter table public.lists
  add column confirm_photos boolean not null default false;  -- gjesten kan legge ved bilder

-- Loggen: også for administratorer.
drop policy "Redaktører kan se bekreftelsene" on public.confirmations;
create policy "Redaktører kan se bekreftelsene" on public.confirmations
  for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id and public.can_edit_group(l.group_id)));

-- ---------------------------------------------------------------------------
-- Bildene i bekreftelsene: lukket bucket, stien er <perm-id>/<bekreftelse-id>/<n>.jpg.
-- Lastes opp av serverfunksjonen; de som kan redigere permen, kan se og slette.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bekreftelser', 'bekreftelser', false, 5242880, array['image/jpeg']);

create policy "Redaktører ser bildene i bekreftelsene" on storage.objects
  for select to authenticated
  using (bucket_id = 'bekreftelser' and public.can_edit_group(public.path_group_id(name)));

create policy "Redaktører kan slette bildene i bekreftelsene" on storage.objects
  for delete to authenticated
  using (bucket_id = 'bekreftelser' and public.can_edit_group(public.path_group_id(name)));

-- ---------------------------------------------------------------------------
-- get_list: også valget for bilder, og innstillingene for dem som kan
-- redigere – nå også administratorer.
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
      'photos',       l.confirm_photos,
      'require_name', l.confirm_require_name),
    'confirm_settings', case when public.can_edit_group(g.id) then jsonb_build_object(
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

-- Mottakerne kan velges også av administratorer.
create or replace function public.confirm_candidates(p_list_id uuid)
returns table (user_id uuid, email text, is_owner boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, u.id = g.owner_id
  from public.lists l
  join public.groups g on g.id = l.group_id
  join auth.users u on u.id = g.owner_id
     or u.id in (select e.user_id from public.group_editors e where e.group_id = g.id)
  where l.id = p_list_id
    and public.can_edit_group(g.id)
  order by u.id = g.owner_id desc, lower(u.email);
$$;

commit;
