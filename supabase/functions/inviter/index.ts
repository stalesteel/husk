// Edge Function «inviter»: legger til en bruker som redaktør i en gruppe, eller
// som full bruker, og inviterer vedkommende på e-post om kontoen ikke finnes.
//
// Kalles fra appen med innloggingen til den som inviterer:
//   { email, role: 'editor', group_id }  – eieren av gruppen (eller en administrator)
//   { email, role: 'full' }              – bare administratorer
//
// Den hemmelige nøkkelen trengs for å sende invitasjoner og ligger bare her,
// aldri i nettleseren. Supabase gir funksjonen SUPABASE_SERVICE_ROLE_KEY
// automatisk. Virker ikke den (prosjekter med bare nye nøkler), legg inn en
// hemmelig nøkkel (sb_secret_…) som secret med navnet HUSK_SECRET_KEY.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://husk.klommestein.no';

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

  // Hvem spør?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user: caller } } = await admin.auth.getUser(token);
  if (!caller) return fail(401, 'not_signed_in', 'Du må være logget inn.');

  let body: { email?: string; role?: string; group_id?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Ugyldig forespørsel.');
  }
  const email = (body.email ?? '').trim().toLowerCase();
  const role = body.role;
  if (!EMAIL.test(email)) return fail(400, 'invalid_email', 'Det ser ikke ut som en e-postadresse.');
  if (role !== 'editor' && role !== 'full') return fail(400, 'bad_request', 'Ukjent rolle.');

  // Har den som spør lov?
  const { data: adminRow } = await admin.from('admins').select('user_id').eq('user_id', caller.id).maybeSingle();
  const callerIsAdmin = Boolean(adminRow);

  let groupName = '';
  let groupOwner = '';
  if (role === 'full') {
    if (!callerIsAdmin) return fail(403, 'forbidden', 'Bare administratorer kan invitere fulle brukere.');
  } else {
    const { data: group } = await admin.from('groups').select('id, name, owner_id').eq('id', body.group_id ?? '').maybeSingle();
    if (!group) return fail(404, 'no_group', 'Fant ikke gruppen.');
    if (group.owner_id !== caller.id && !callerIsAdmin) {
      return fail(403, 'forbidden', 'Bare eieren kan gi redigeringstilgang.');
    }
    groupName = group.name;
    groupOwner = group.owner_id;
  }

  // Finnes brukeren? Hvis ikke: inviter.
  const { data: existingId, error: lookupError } = await admin.rpc('user_id_by_email', { p_email: email });
  if (lookupError) return fail(500, 'lookup_failed', 'Kunne ikke slå opp brukeren.');

  if (existingId && existingId === groupOwner) {
    return fail(400, 'is_owner', 'Personen eier gruppen, og kan allerede redigere.');
  }

  let userId: string = existingId;
  let invited = false;
  if (!userId) {
    const redirectTo = role === 'editor' ? `${SITE}/gruppe/?id=${body.group_id}` : `${SITE}/`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      // Tilgjengelig i e-postmalen som {{ .Data.group_name }}.
      data: groupName ? { group_name: groupName } : {},
    });
    if (error || !data.user) {
      console.error(error);
      return fail(502, 'invite_failed', 'Kunne ikke sende invitasjonen. Prøv igjen om litt.');
    }
    userId = data.user.id;
    invited = true;
  }

  // Gi rollen eller tilgangen.
  const { error: grantError } = role === 'full'
    ? await admin.from('full_users').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
    : await admin.from('group_editors').upsert(
        { group_id: body.group_id, user_id: userId },
        { onConflict: 'group_id,user_id', ignoreDuplicates: true },
      );
  if (grantError) {
    console.error(grantError);
    return fail(500, 'grant_failed', invited
      ? 'Invitasjonen ble sendt, men tilgangen ble ikke lagret. Prøv igjen.'
      : 'Tilgangen ble ikke lagret. Prøv igjen.');
  }

  return reply(200, { user_id: userId, invited });
});
