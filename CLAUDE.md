# Husk Klommestein

Sjekklister med bilder, brukt der man står (hytta, båten, kirka) via QR-koder.
Ikke-kommersielt, for familie, venner og menighet. **Les DESIGN.md** for
designbeslutningene; den er grunnlaget for alt.

All kommunikasjon og alt grensesnitt er på norsk bokmål. Unngå «hen» i tekster.

## Teknologi

- Statiske filer på **GitHub Pages** (`husk.klommestein.no`, se CNAME). Ingen
  byggesteg: vanlige ES-moduler, ingen npm.
- **Supabase** er backend: database, innlogging, bildelagring og Edge Functions.
  Den offentlige nøkkelen står i `js/supabase.js`; tilgangsreglene (RLS) i
  databasen beskytter dataene. Repoet er offentlig: aldri hemmeligheter i koden.
- E-post sendes via Resend (innlogging via Supabase SMTP, bekreftelser fra
  Edge Function-en `bekreft`). Domenet og DNS ligger hos ProISP.

## Struktur

- En mappe per side: `index.html` (forsiden), `perm/`, `liste/` (sjekklisten),
  `rediger/` (liste, som kort eller linjer), `rediger/perm/`, `logg-inn/`, `admin/`, `qr/`, `plakat/`,
  `om/`, `film/`. `gruppe/` sender gamle lenker videre til `perm/`.
- `js/`: én modul per side, pluss felles moduler (`data.js`, `dom.js` med `el()`,
  `saving.js`, `plakat-motor.js`, `avkrysning.js` og `linjeredigering.js` for avkrysningslister osv.). `css/`: felles og per side.
- `supabase/migrations/`: SQL i rekkefølge. `supabase/functions/`: Edge
  Functions (`inviter`, `registrer`, `bekreft`).
- **«Perm» heter `group` i kode og database** (tabellen `groups`, `get_group`).
  Brukerne ser aldri det ordet.

## Slik kommer endringer ut

- **Nettstedet:** push til `main` → ute på GitHub Pages etter 1–2 minutter.
  Sjekk med `curl` mot husk.klommestein.no at den nye filen er publisert.
- **Supabase gjøres manuelt av Ståle** i dashbordet: SQL-migreringer limes inn i
  SQL Editor, og Edge Functions limes inn og deployes (JWT-verifisering av).
  Hemmeligheter (f.eks. `RESEND_API_KEY`) legges inn under Edge Functions →
  Secrets. **SQL som koden er avhengig av må være kjørt før push.**

## Push-regler

- Små rettelser pushes direkte.
- Ny funksjonalitet og større endringer: test lokalt først, og avslutt
  meldingen med spørsmålet i store bokstaver på egen linje: **SKAL JEG PUSHE?**
- Commit-meldinger på norsk.

## Fallgruver

- **Mobil først.** Endringer for PC skal aldri gjøre mobilen dårligere.
  PC-oppsett styres av `(hover: hover) and (pointer: fine)`, aldri av høyden.
- **Hurtigminne:** GitHub Pages lar nettlesere bruke gamle filer i opptil 10
  minutter. Importerer en side en *ny* funksjon fra en eksisterende modul, kan
  en gammel kopi stoppe hele siden. Legg nye funksjoner i en ny fil.
- **Git i Dropbox:** `update_ref failed` / `couldn't set refs` etter push er
  Dropbox-krøll; sjekk med `git ls-remote origin main` at pushen gikk gjennom.

## Testing lokalt

- `python -m http.server 8765` i roten gir http://localhost:8765/ mot den ekte
  databasen. Innlogging lokalt: bruk koden fra e-posten, ikke lenken.
- Skjermbilder og sjekk av konsollfeil: Playwright med `channel="msedge"`.
