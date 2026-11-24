-- Husk: avkrysningsliste blir visningen for eksisterende lister, unntatt de
-- som krever at alle bildene er sett før avkryssing (der kan man bare bruke
-- ett punkt om gangen). Nye lister får avkrysningsliste som forhåndsvalg i
-- skjemaet; standardverdien i tabellen er fortsatt 'cards'.
-- Kjøres én gang i Supabase sin SQL Editor, etter 20261124000000_visning.sql.

update public.lists
   set display_mode = 'list'
 where display_mode = 'cards'
   and not require_all_images_seen;
