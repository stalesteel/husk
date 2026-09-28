# Husk — designgrunnlag

Dette notatet oppsummerer beslutningene som ble tatt i planleggingen, før koden ble
skrevet. Det er skrevet for å kunne leses av en som ikke var med på samtalen.

## Hva appen er

Sjekklister med bilder, til bruk på et fysisk sted. Du står i hytta, på båten eller i
verkstedet, og går gjennom punktene ett om gangen på mobilen.

Hovedveien inn er **QR-kode** — en etikett på hytteveggen eller i båten. Lenker fra andre
nettsteder kommer i tillegg, men QR er det som former designet.

Brukerne er familie, venner og menighet. Ikke et produkt for salg.

## Teknisk grunnlag

| | |
|---|---|
| Frontend | Statiske filer på GitHub Pages, `husk.klommestein.no` |
| Repo | `github.com/stalesteel/husk` (offentlig) |
| Backend | Supabase — database, innlogging og bildelagring |

Repoet kan være offentlig fordi dataene ligger i Supabase, ikke i koden, og den
offentlige `anon`-nøkkelen er laget for å stå åpent. Det er tilgangsreglene i databasen
som beskytter dataene.

**Gratisnivået i Supabase settes på pause ved inaktivitet.** En sjekkliste for hytta
brukes kanskje to ganger i måneden, så dette er en reell risiko. UptimeRobot skal pinge
med jevne mellomrom, og pingen må treffe noe som teller som databaseaktivitet — en liten
spørring mot en tabell. Å pinge nettadressen holder ikke.

Alt grensesnitt er på norsk (bokmål).

## Struktur

**Grupper er øverste nivå, og alle lister hører til en gruppe.** Ingen løse lister.

En gruppe er for eksempel «Hytte på Skjeggestad», med listene «Ankomst hytte»,
«Forlat hytta» og «Utvendig sjekkliste».

Gruppesiden er trolig den viktigste siden i appen: overskrift, et bilde av stedet, en
beskrivende tekst som gjerne kan være lang, og nederst en knapp til hver liste. Den
fungerer som en liten hjemmeside du deler med gjester som skal låne hytta. **QR-koden på
veggen bør peke hit**, ikke til en enkeltliste — da velger gjesten selv om han kommer
eller drar.

Gruppen er også eierskapsenheten. Den som lager gruppen eier den, og listene arver. Skal
noen andre få redigere, gis det på gruppen én gang i stedet for på hver liste.

Eiere skal kunne hente ut QR-kode både for gruppesiden og for hver enkelt liste.

## Tilgang

**Lesing er åpen for den som har lenken. Redigering krever innlogging.**

Det følger av QR-bruken: svigermor skal ikke måtte opprette konto for å krysse av at hun
har skrudd av vannet. Men ingen skal kunne endre listen uten å være logget inn.

For innlogging anbefales e-post med engangslenke — ingen passord å glemme eller
administrere for en familie- og menighetskrets.

**Kontoer kun ved invitasjon.** Åpen registrering er slått av i Supabase. Nye brukere
inviteres fra Supabase-dashbordet, og logger deretter inn med engangslenke. Appen skal
aldri opprette brukere selv når en ukjent e-postadresse skrives inn. Å få konto er noe
annet enn å få redigere en bestemt gruppe — det gir eieren inne i appen.

## Sluttbrukerens visning

Ett sjekkpunkt fyller hele skjermen. **Vertikal sveip bytter steg**, med scroll-snap så
det alltid lander rent på ett punkt.

### Bilde og tekst

Bildet ligger øverst og teksten på sort under, med en fade imellom som binder dem
visuelt sammen. Det ser nesten ut som om teksten ligger oppå bildet, men gjør det ikke.

Dette er et bevisst brudd med den opprinnelige løsningen i Flyt, der teksten lå oppå og
nederste tredjedel av hvert bilde i praksis gikk tapt. Prisen er at bildet får mindre
høyde og beskjæres strammere. Gevinsten er at ingenting i bildet noen gang skjules —
viktig når bildet er hele poenget med steget.

### Flere bilder per steg

Et steg kan ha flere bilder, med **horisontal sveip mellom dem**. Eksempel: «Opprydding»
har fire bilder av ulike områder som skal ryddes, i rekkefølge — uten at steget deles opp
i fire avkryssingspunkter.

Beskrivelsen hører til hele steget. I tillegg kan hvert bilde ha en **valgfri kort
etikett** på to-tre ord («Salongbordet», «Akterdekk»), vist over beskrivelsen. Steg med
ett bilde bruker den aldri, så det enkle forblir enkelt.

### To tellere, ulikt visuelt språk

Stegtelleren står som tall øverst («7 av 11») og svarer på «hvor langt er jeg kommet».
Bildene vises som **prikker** rett over tekstbåndet, som umiddelbart leses som «det
finnes flere her». De må ikke se like ut, ellers forveksles de.

### Avkryssing

Avkryssing er per steg, med en stor, tommelvennlig knapp. **Avkryssinger lagres ikke** —
listen starter blank hver gang den åpnes.

Listen kan settes opp til å **kreve at alle bildene er sett før avkryssing** er mulig.
Dette er et valg eieren tar per liste, og **standard er av**. Det er nyttig for lister
andre skal følge (steng vannet, skru av gassen), unødvendig for dine egne.

Når kravet er på: knappen skal ikke bare være grå og død. Den skal stå der og forklare
seg — «Sveip gjennom alle bildene først — 2 av 4». En deaktivert knapp uten forklaring
leses som en feil.

### Ellers

- Skjermen holdes våken mens en liste er åpen (Wake Lock der det støttes).
- Siste side oppsummerer: «Alt klart!» eller en liste over punkter som gjenstår, med
  knapper tilbake til hvert av dem.
- Mangler et bilde, vises en nøytral mørk bakgrunn — aldri et ødelagt bilde.
- Skal fungere godt med én hånd, i sollys, på iPhone Safari og Android Chrome.

## Eierens redigering

**Redigeringsgrensesnittet skal ligne sluttbrukerens visning så mye som mulig.** Dette er
det viktigste prinsippet i hele redigeringsdelen.

Grunnen: når eieren tar bildet og umiddelbart ser det bak teksten, oppdages det med en
gang hvis viktige detaljer havner feil. Uten dette oppdages feilen først tre uker senere,
når noen står i hytta og lurer på hva som er skjult.

Kamera skal kunne brukes direkte i grensesnittet, og bildet skal vises umiddelbart i
riktig format. Man skal kunne ta flere bilder per steg, og fjerne dem igjen.

Arbeidsflyten er:

1. Opprett gruppe (blir din)
2. Opprett liste i gruppen, gi den navn
3. Begynn på steg 1: skriv tittel, skriv beskrivelse, ta bilde
4. «Neste steg»
5. Samme grensesnitt brukes når en eksisterende liste redigeres senere

## Tilbakenavigasjon

Kommer brukeren fra et annet nettsted, bør en tilbakeknapp føre dit igjen. Kommer man fra
en QR-kode, finnes ingen vei tilbake, og knappen skal da ikke vises.

**Ikke bruk nettleserens referrer til dette.** Den er ofte tom — ved QR-skanning finnes
den ikke, og mange nettlesere og apper fjerner den. Bruk heller en eksplisitt parameter i
lenken, for eksempel `?retur=https://flyt.klommestein.no`. Nettstedet som lenker inn lager
lenken selv og kan alltid sende den med, mens en QR-kode bare utelater den.

Dette er lavt prioritert, siden QR blir hovedveien inn.

## Datamodell — det som må være på plass fra start

Dette er ikke et ferdig skjema, men de føringene som er dyre å legge til i ettertid:

- Grupper som egen enhet, med navn, lang beskrivelse, bilde og eier
- Alle lister hører til en gruppe
- Steg hører til en liste, med sortering
- **Bilder er en egen, sortert samling under hvert steg** — ikke ett bildefelt på steget
- Hvert bilde kan ha en valgfri kort etikett
- Liste har et valg for om alle bilder må ses før avkryssing

## Innhold som skal over fra Flyt

To sjekklister ligger i dag i Flyt-appen og skal flyttes hit. Det finnes ingen ekte foto
ennå — bare tekst — så flyttingen er billig.

### Ankomst båt – før tur

1. **Åpne sideåpningen** — Løft inn bagasje, barn og lignende.
2. **Rull opp bak** — Løsne hempene nederst. Rull opp bakveggen og fest den med hempene. En fordel å være to personer.
3. **Åpne hele taket** — Løsne stengene og flytt dem frem. Fest med hemper.
4. **Åpne sjåførluken** — Åpne luken og vipp den bakover.
5. **Slå på strømmen** — Vipp begge de røde bryterne i loddrett stilling.
6. **Sett på gløding** — Vri nøkkelen til høyre til glødelyset er påslått, og la den gløde i 40–50 sekunder.
7. **Sett båten i fri** — Trykk inn knappen, og skyv spaken frem i flukt med dashbordet mens knappen holdes inne.
8. **Start båten** — Vri nøkkelen videre mot høyre og start motoren. Trekk spaken tilbake til midtposisjon så knappen slipper. Vri nøkkelen til venstre til glødelyset slår seg av, og la den bli stående der.
9. **Løsne fortøyningene** — Løsne fortøyningene fra båten. Prøv å slippe tauene ned på bryggekanten og midtdeleren så de ikke blir liggende i vannet. Får du det ikke helt til, er det ingen krise — båthaken fisker dem opp når du kommer tilbake.
10. **Bakk ut av bryggen** — Sett båten forsiktig i revers. Du kan prøve å svinge til babord eller styrbord mens du bakker, men det viktigste er å komme trygt ut. Båten snur lett når den går forover.
11. **Ta inn fendere** — Når du er ute av havna, tar du inn fenderne og legger dem i beholderne sine. Legg dem etter hvor de hang på båten, så husker du hvor de skal når du kommer tilbake.

### Forlate båten

1. **Heng ut fendere** — Heng fenderne på sin rette plass FØR du kjører inn i båthavna.
2. **Fortøy båten** — Bruk båthaken som henger over og bak hodet til styrmann. Fisk opp fortøyningene og fortøy båten.
3. **Skru av motoren** — Vri nøkkelen til venstre så motoren stopper. Ta ut nøkkelen.
4. **Skru av all strøm** — Vipp de røde bryterne slik som vist på bildet.
5. **Sjekk at reservepumpen er aktiv** — Reservepumpen skal alltid lyse for å vise at den er klar.
6. **Lukk sjåførluka (VIKTIG)** — Husk å lukke sjåførluka. Hvis ikke regner det rett inn i båten.
7. **Interiør** — Sett bord, stoler og puter på plass slik som på bildet.
8. **Opprydding** — Pass på at det er ryddet etter bruk.
9. **Indre dører** — Lukk døra til badet. Åpne døra til hovedkabinen. Lukk døra til akterkabinen.
10. **Ta med søppel** — Ta med søppel og kast det i containerne ved porten til brygga.
11. **Tilbakestill kalesje** — Husker du ikke hvordan, se sjekklista for før tur — nå gjør du bare det motsatte ;-)

Disse to bør høre til en gruppe «Båten» eller lignende.

## Til slutt, når Husk virker

I Flyt-appen skal menyknappene «Før tur» og «Etter tur» peke hit i stedet, `/sjekkliste`
fjernes fra Flyt-repoet, og ArcGIS-tabellen `SjekklisteFlyt` slettes. Flyt fungerer
uforstyrret helt til dette gjøres, så det haster ikke.
