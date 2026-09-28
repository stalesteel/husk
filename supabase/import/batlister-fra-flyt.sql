-- Engangsimport: de to båtlistene fra Flyt, i gruppen «Båten».
-- Kjøres i Supabase sin SQL Editor etter at eieren har logget inn minst én gang.
-- Bytt ut e-postadressen på linjen merket «EIER» før du kjører.

do $$
declare
  v_owner_email text := 'DIN-EPOST@example.no';  -- EIER
  v_owner uuid;
  v_group uuid;
  v_list  uuid;
begin
  select id into v_owner from auth.users where lower(email) = lower(trim(v_owner_email));
  if v_owner is null then
    raise exception 'Fant ingen bruker med e-postadressen %', v_owner_email;
  end if;

  if exists (select 1 from public.groups where owner_id = v_owner and name = 'Båten') then
    raise exception 'Gruppen «Båten» finnes allerede. Importen er trolig kjørt før.';
  end if;

  insert into public.groups (owner_id, name, description)
  values (v_owner, 'Båten', 'Sjekklister for båten: hva som skal gjøres før du drar ut, og når du kommer tilbake.')
  returning id into v_group;

  -- Ankomst båt – før tur
  insert into public.lists (group_id, title, sort_order)
  values (v_group, 'Ankomst båt – før tur', 1)
  returning id into v_list;

  insert into public.steps (list_id, sort_order, title, description) values
    (v_list,  1, 'Åpne sideåpningen', 'Løft inn bagasje, barn og lignende.'),
    (v_list,  2, 'Rull opp bak', 'Løsne hempene nederst. Rull opp bakveggen og fest den med hempene. En fordel å være to personer.'),
    (v_list,  3, 'Åpne hele taket', 'Løsne stengene og flytt dem frem. Fest med hemper.'),
    (v_list,  4, 'Åpne sjåførluken', 'Åpne luken og vipp den bakover.'),
    (v_list,  5, 'Slå på strømmen', 'Vipp begge de røde bryterne i loddrett stilling.'),
    (v_list,  6, 'Sett på gløding', 'Vri nøkkelen til høyre til glødelyset er påslått, og la den gløde i 40–50 sekunder.'),
    (v_list,  7, 'Sett båten i fri', 'Trykk inn knappen, og skyv spaken frem i flukt med dashbordet mens knappen holdes inne.'),
    (v_list,  8, 'Start båten', 'Vri nøkkelen videre mot høyre og start motoren. Trekk spaken tilbake til midtposisjon så knappen slipper. Vri nøkkelen til venstre til glødelyset slår seg av, og la den bli stående der.'),
    (v_list,  9, 'Løsne fortøyningene', 'Løsne fortøyningene fra båten. Prøv å slippe tauene ned på bryggekanten og midtdeleren så de ikke blir liggende i vannet. Får du det ikke helt til, er det ingen krise — båthaken fisker dem opp når du kommer tilbake.'),
    (v_list, 10, 'Bakk ut av bryggen', 'Sett båten forsiktig i revers. Du kan prøve å svinge til babord eller styrbord mens du bakker, men det viktigste er å komme trygt ut. Båten snur lett når den går forover.'),
    (v_list, 11, 'Ta inn fendere', 'Når du er ute av havna, tar du inn fenderne og legger dem i beholderne sine. Legg dem etter hvor de hang på båten, så husker du hvor de skal når du kommer tilbake.');

  -- Forlate båten
  insert into public.lists (group_id, title, sort_order)
  values (v_group, 'Forlate båten', 2)
  returning id into v_list;

  insert into public.steps (list_id, sort_order, title, description) values
    (v_list,  1, 'Heng ut fendere', 'Heng fenderne på sin rette plass FØR du kjører inn i båthavna.'),
    (v_list,  2, 'Fortøy båten', 'Bruk båthaken som henger over og bak hodet til styrmann. Fisk opp fortøyningene og fortøy båten.'),
    (v_list,  3, 'Skru av motoren', 'Vri nøkkelen til venstre så motoren stopper. Ta ut nøkkelen.'),
    (v_list,  4, 'Skru av all strøm', 'Vipp de røde bryterne slik som vist på bildet.'),
    (v_list,  5, 'Sjekk at reservepumpen er aktiv', 'Reservepumpen skal alltid lyse for å vise at den er klar.'),
    (v_list,  6, 'Lukk sjåførluka (VIKTIG)', 'Husk å lukke sjåførluka. Hvis ikke regner det rett inn i båten.'),
    (v_list,  7, 'Interiør', 'Sett bord, stoler og puter på plass slik som på bildet.'),
    (v_list,  8, 'Opprydding', 'Pass på at det er ryddet etter bruk.'),
    (v_list,  9, 'Indre dører', 'Lukk døra til badet. Åpne døra til hovedkabinen. Lukk døra til akterkabinen.'),
    (v_list, 10, 'Ta med søppel', 'Ta med søppel og kast det i containerne ved porten til brygga.'),
    (v_list, 11, 'Tilbakestill kalesje', 'Husker du ikke hvordan, se sjekklista for før tur — nå gjør du bare det motsatte ;-)');
end $$;

-- Viser id-ene som trengs for lenker og QR-koder.
select g.id as gruppe_id, l.id as liste_id, l.title as liste,
       (select count(*) from public.steps s where s.list_id = l.id) as antall_steg
from public.groups g
join public.lists l on l.group_id = g.id
where g.name = 'Båten'
order by l.sort_order;
