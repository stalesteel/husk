// Edge Function «bekreft»: sender bekreftelse på e-post når en gjest har gått
// gjennom en liste (se supabase/migrations/…_bekreftelse.sql).
//
// Kalles fra oppsummeringen i sjekklisten, uten innlogging:
//   { list_id, checked: [steg-id, …], name, comment }
//
// Funksjonen sjekker innstillingene på listen (er det slått på, må alle punkter
// være krysset av, må navnet fylles ut), sperrer for mange bekreftelser på kort
// tid, finner mottakernes e-post selv (de sendes aldri til nettleseren),
// sender e-posten via Resend og logger bekreftelsen.
//
// Hemmeligheter: RESEND_API_KEY (Resend), og den hemmelige nøkkelen til
// Supabase som i «inviter».

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://husk.klommestein.no';
const FROM = 'Husk Klommestein <stale@klommestein.no>';
const PER_DAY = 20;         // bekreftelser per liste per døgn
const MIN_GAP_MS = 60_000;  // minst ett minutt mellom to bekreftelser

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const fail = (status: number, error: string, message: string) => reply(status, { error, message });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'method', 'Bare POST.');

  const key = Deno.env.get('HUSK_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!key || !resendKey) return fail(500, 'config', 'Bekreftelse er ikke satt opp riktig ennå.');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { list_id?: string; checked?: unknown; name?: string; comment?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request', 'Ugyldig forespørsel.');
  }

  // Listen og innstillingene
  const { data: list } = await admin.from('lists')
    .select('id, title, group_id, confirm_enabled, confirm_to_owner, confirm_editors, confirm_require_all, confirm_include_steps, confirm_comment, confirm_require_name, groups(name, owner_id)')
    .eq('id', body.list_id ?? '')
    .maybeSingle();
  if (!list) return fail(404, 'no_list', 'Fant ikke listen.');
  if (!list.confirm_enabled) return fail(403, 'disabled', 'Bekreftelse er ikke slått på for denne listen.');
  const perm = list.groups as unknown as { name: string; owner_id: string };

  const { data: steps } = await admin.from('steps')
    .select('id, title')
    .eq('list_id', list.id)
    .order('sort_order').order('created_at');
  const all = steps ?? [];
  const checked = new Set(Array.isArray(body.checked) ? body.checked.map(String) : []);
  const done = all.filter((s) => checked.has(s.id)).length;

  if (list.confirm_require_all && done < all.length) {
    return fail(400, 'not_all', 'Alle punktene må være krysset av før bekreftelsen kan sendes.');
  }
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (list.confirm_require_name && !name) return fail(400, 'no_name', 'Skriv navnet ditt.');
  const comment = list.confirm_comment ? String(body.comment ?? '').trim().slice(0, 2000) : '';

  // Sperre: ikke for ofte, og ikke for mange per døgn.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent } = await admin.from('confirmations')
    .select('created_at').eq('list_id', list.id).gte('created_at', since)
    .order('created_at', { ascending: false });
  if (recent?.length && Date.now() - new Date(recent[0].created_at).getTime() < MIN_GAP_MS) {
    return fail(429, 'too_soon', 'Det ble nettopp sendt en bekreftelse. Vent litt og prøv igjen.');
  }
  if ((recent?.length ?? 0) >= PER_DAY) {
    return fail(429, 'too_many', 'Det er sendt mange bekreftelser for denne listen i dag. Prøv igjen i morgen.');
  }

  // Mottakerne: eieren og/eller valgte redaktører som fortsatt er redaktører.
  const ids = new Set<string>();
  if (list.confirm_to_owner) ids.add(perm.owner_id);
  if (list.confirm_editors?.length) {
    const { data: editors } = await admin.from('group_editors').select('user_id').eq('group_id', list.group_id);
    for (const e of editors ?? []) if (list.confirm_editors.includes(e.user_id)) ids.add(e.user_id);
  }
  const emails: string[] = [];
  for (const id of ids) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data.user?.email) emails.push(data.user.email);
  }
  if (!emails.length) return fail(400, 'no_recipients', 'Listen har ingen mottakere for bekreftelsen.');

  // E-posten
  const allDone = done === all.length;
  const when = new Intl.DateTimeFormat('nb-NO', { timeZone: 'Europe/Oslo', dateStyle: 'full', timeStyle: 'short' }).format(new Date());
  const who = name || 'En gjest';
  const subject = allDone
    ? `✓ ${list.title} er gjennomført – ${perm.name}`
    : `${list.title}: ${done} av ${all.length} punkter gjennomført – ${perm.name}`;
  const stepsHtml = list.confirm_include_steps && all.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">${all.map((s, i) => {
        const ok = checked.has(s.id);
        return `<tr><td style="padding:4px 10px 4px 0;font-size:16px;color:${ok ? '#1f6f4a' : '#b3261e'};font-weight:700">${ok ? '✓' : '✗'}</td>`
          + `<td style="padding:4px 0;font-size:15px;color:${ok ? '#1c1c1c' : '#b3261e'}">${i + 1}. ${esc(s.title || 'Uten tittel')}</td></tr>`;
      }).join('')}</table>`
    : '';
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#1c1c1c">
    <h2 style="margin:0 0 12px;color:${allDone ? '#1f6f4a' : '#1c1c1c'}">${allDone ? '✓ Alt er gjort' : `${done} av ${all.length} punkter er gjort`}</h2>
    <p style="font-size:16px;margin:0 0 6px"><strong>${esc(who)}</strong> har gått gjennom «${esc(list.title)}» i ${esc(perm.name)}.</p>
    <p style="color:#6b6b6b;margin:0 0 16px">${esc(when)}</p>
    ${comment ? `<blockquote style="margin:16px 0;padding:10px 14px;border-left:4px solid #1f6f4a;background:#f3f7f4;font-size:15px;white-space:pre-line">${esc(comment)}</blockquote>` : ''}
    ${stepsHtml}
    <p style="margin:20px 0"><a href="${SITE}/liste/?id=${list.id}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1f6f4a;color:#fff;text-decoration:none;font-weight:600">Åpne listen</a></p>
    <p style="color:#8a8a8a;font-size:13px">Du får denne e-posten fordi du er mottaker av bekreftelser for listen. Det endres under «Listen» når listen redigeres i Husk Klommestein.</p>
  </div>`;
  const text = `${who} har gått gjennom «${list.title}» i ${perm.name}. ${when}.\n${done} av ${all.length} punkter er gjort.`
    + (comment ? `\n\nKommentar:\n${comment}` : '')
    + (list.confirm_include_steps ? `\n\n${all.map((s, i) => `${checked.has(s.id) ? '✓' : '✗'} ${i + 1}. ${s.title || 'Uten tittel'}`).join('\n')}` : '')
    + `\n\n${SITE}/liste/?id=${list.id}`;

  // Én e-post per mottaker, så de ikke ser hverandres adresser.
  const results = await Promise.all(emails.map((to) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  }).then(async (r) => { if (!r.ok) console.error(to, r.status, await r.text()); return r.ok; })));
  const sent = results.filter(Boolean).length;
  if (!sent) return fail(502, 'send_failed', 'Kunne ikke sende bekreftelsen. Prøv igjen om litt.');

  await admin.from('confirmations').insert({
    list_id: list.id, name: name || null, comment: comment || null, done, total: all.length, recipients: sent,
  });
  return reply(200, { ok: true, sent });
});
