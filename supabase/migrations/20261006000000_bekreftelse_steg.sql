-- Husk: loggen over bekreftelser tar også vare på stegene – tittel og om de
-- ble krysset av – slik de var da bekreftelsen ble sendt. Da kan eiere og
-- redaktører se hvilke steg det gjelder, ikke bare «4 av 11».
-- Kjøres én gang i Supabase sin SQL Editor, etter 20261005000000_bekreftelse.sql.
-- Edge Function-en «bekreft» må oppdateres samtidig (den fyller ut stegene).

alter table public.confirmations
  add column steps jsonb;  -- [{ "title": "...", "done": true }, …]; tom for eldre bekreftelser
