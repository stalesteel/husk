import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://keudhpoylbcdqzlrkqra.supabase.co';
// Offentlig nøkkel, laget for å stå i klientkoden. Det er tilgangsreglene i
// databasen som beskytter dataene.
const SUPABASE_KEY = 'sb_publishable_wqbphPloNYBDlyzhN6JzfQ_drYI-ZeV';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Implicit flow, ikke PKCE: engangslenken må virke også når den åpnes i en
    // annen nettleser enn der den ble bestilt, f.eks. fra e-postappen på mobilen.
    flowType: 'implicit',
  },
});
