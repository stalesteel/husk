// Edge Function «registrer»: lar folk lage sin egen bruker mens
// selvregistreringen er åpen (se supabase/migrations/…_selvregistrering.sql).
//
// Kalles fra innloggingssiden uten innlogging:
//   { email, code }   – code bare om administratoren har satt en kode
//
// Den nye brukeren blir full bruker. Har adressen allerede en konto, blir den
// full bruker om den ikke var det. Svaret er det samme i begge tilfeller, så
// ingen kan bruke funksjonen til å finne ut hvem som har konto. Etterpå logger
// personen inn som vanlig, med lenke eller kode på e-post, fra nettleseren.
//
// Den hemmelige nøkkelen trengs for å lage brukere og ligger bare her, som i
// «inviter».

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const fail = (status: number, error: string, message: string) => reply(status, { error, message });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'method', 'Bare POST.');

  const key = Deno.env.get('HUSK_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return fail(500, 'config', 'Funksjonen mangler den hemmelige nøkkelen.');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Ugyldig forespørsel.');
  }
  const email = (body.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return fail(400, 'invalid_email', 'Det ser ikke ut som en e-postadresse.');

  // Er registreringen åpen, og stemmer koden?
  const { data: verdict, error: checkError } = await admin.rpc('signup_check', { p_code: body.code ?? '' });
  if (checkError) {
    console.error(checkError);
    return fail(500, 'check_failed', 'Kunne ikke lage brukeren. Prøv igjen om litt.');
  }
  if (verdict === 'closed') {
    return fail(403, 'closed', 'Det går ikke an å lage bruker selv akkurat nå. Er du invitert, kan du logge inn i stedet.');
  }
  if (verdict === 'wrong_code') {
    return fail(403, 'wrong_code', 'Koden stemmer ikke. Sjekk den med den som ga deg den.');
  }

  // Finnes brukeren? Hvis ikke: lag den, bekreftet, uten å sende e-post her.
  const { data: existingId, error: lookupError } = await admin.rpc('user_id_by_email', { p_email: email });
  if (lookupError) return fail(500, 'lookup_failed', 'Kunne ikke lage brukeren. Prøv igjen om litt.');

  let userId: string = existingId;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) {
      console.error(error);
      return fail(502, 'create_failed', 'Kunne ikke lage brukeren. Prøv igjen om litt.');
    }
    userId = data.user.id;
  }

  // Gjør til full bruker, og tell med i registreringen bare om det er nytt.
  const { data: fullRow } = await admin.from('full_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (!fullRow) {
    const { error: grantError } = await admin.from('full_users').insert({ user_id: userId });
    const { error: logError } = await admin.from('self_signups')
      .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (grantError || logError) {
      console.error(grantError ?? logError);
      return fail(500, 'grant_failed', 'Brukeren ble laget, men ikke ferdig satt opp. Prøv igjen.');
    }
  }

  return reply(200, { ok: true });
});
