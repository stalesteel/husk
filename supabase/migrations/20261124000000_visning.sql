-- Husk: visning per liste – «ett punkt om gangen» (som før) eller
-- «avkrysningsliste» (alle punktene på én skjerm, med hake til høyre).
-- Kjøres én gang i Supabase sin SQL Editor, etter 20261006000000_bekreftelse_steg_og_bilder.sql.
--
-- Innholdet i punktene er som før: bilde og beskrivelse er valgfrie per punkt,
-- så en liste med bare titler (eller noen bilder her og der) trenger ingen
-- egen type. Visningen er bare eierens standard; gjesten kan bytte selv.

begin;

alter table public.lists
  add column display_mode text not null default 'cards'
    check (display_mode in ('cards', 'list'));  -- cards: ett punkt om gangen, list: avkrysningsliste

-- get_list: også visningen.
create or replace function public.get_list(p_list_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',                      l.id,
    'title',                   l.title,
    'require_all_images_seen', l.require_all_images_seen,
    'display_mode',            l.display_mode,
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

commit;
