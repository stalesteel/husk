// Admin-siden (/admin/): selvregistrering, inviter fulle brukere, og gi og ta roller.
// Det er databasen som sjekker at du er administrator (admin_* i
// supabase/migrations/…_roller.sql); siden viser bare det den får.

import { getUser } from './auth.js';
import { adminGetSignup, adminListUsers, adminSetAdmin, adminSetFull, adminSetSignup, invite, isAdmin } from './data.js';
import { el } from './dom.js';

const $ = (id) => document.getElementById(id);
let me;

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
  $('content').hidden = true;
}

function inviteMessage(text, isError = false) {
  $('invite-message').textContent = text ?? '';
  $('invite-message').className = isError ? 'error' : 'muted';
  $('invite-message').hidden = !text;
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const dayMonth = (date) => new Date(date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' });

function describe(user) {
  const parts = [];
  if (user.owned_groups) parts.push(`eier ${count(user.owned_groups, 'perm', 'permer')}`);
  if (user.edited_groups) parts.push(`redaktør i ${count(user.edited_groups, 'perm', 'permer')}`);
  if (user.self_signed_at) parts.push(`registrerte seg selv ${dayMonth(user.self_signed_at)}`);
  if (user.invited) parts.push(user.self_signed_at ? 'ikke logget inn ennå' : 'invitert, ikke logget inn ennå');
  return parts.join(' · ') || 'ingen permer';
}

async function change(action, question) {
  if (question && !confirm(question)) return;
  try {
    await action();
  } catch (error) {
    alert(error.message || 'Kunne ikke endre rollen.');
  }
  renderUsers();
}

async function renderUsers() {
  let users;
  try {
    users = await adminListUsers();
  } catch {
    $('users').replaceChildren(el('p', { class: 'error' }, 'Kunne ikke hente brukerne.'));
    return;
  }

  $('users').replaceChildren(...users.map((user) => {
    const isMe = user.user_id === me.id;
    const role = user.is_admin
      ? el('span', { class: 'badge admin' }, 'Administrator')
      : user.is_full
        ? el('span', { class: 'badge full' }, 'Full bruker')
        : el('span', { class: 'badge' }, 'Redaktør');

    const tools = [];
    if (!user.is_admin) {
      tools.push(user.is_full
        ? el('button', {
            type: 'button',
            onclick: () => change(() => adminSetFull(user.user_id, false),
              `Gjøre ${user.email} til redaktør? Personen beholder permene sine, men kan ikke lage nye.`),
          }, 'Gjør til redaktør')
        : el('button', {
            type: 'button', onclick: () => change(() => adminSetFull(user.user_id, true)),
          }, 'Gjør til full bruker'));
    }
    if (user.is_admin && !isMe) {
      tools.push(el('button', {
        type: 'button', class: 'danger',
        onclick: () => change(() => adminSetAdmin(user.user_id, false), `Fjerne administratorrollen til ${user.email}?`),
      }, 'Fjern som administrator'));
    }
    if (!user.is_admin) {
      tools.push(el('button', {
        type: 'button',
        onclick: () => change(() => adminSetAdmin(user.user_id, true),
          `Gjøre ${user.email} til administrator? Personen får full tilgang til alle permer og kan gi roller.`),
      }, 'Gjør til administrator'));
    }

    return el('div', { class: 'user-row' },
      el('div', {}, el('span', { class: 'user-email' }, user.email), role, isMe ? el('span', { class: 'badge' }, 'Deg') : null),
      el('span', { class: 'user-meta' }, describe(user)),
      tools.length ? el('div', { class: 'row-tools' }, tools) : null);
  }));
}

// ---------------------------------------------------------------------------
// Selvregistrering
// ---------------------------------------------------------------------------

// Datofeltet gir en dag; registreringen er åpen ut den dagen, i din tidssone.
const endOfDay = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).toISOString();
};
const dateValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const longDate = (date) => new Date(date).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });

function signupMessage(text, isError = false) {
  $('signup-message').textContent = text ?? '';
  $('signup-message').className = isError ? 'error' : 'muted';
  $('signup-message').hidden = !text;
}

function renderSignup(info) {
  const state = $('signup-state');
  const places = `${info.used} av ${count(info.max_signups, 'plass', 'plasser')} brukt`;
  state.classList.toggle('open', info.open);
  if (info.open) {
    state.replaceChildren(
      el('strong', {}, `Åpen til og med ${longDate(info.open_until)}`),
      `${places} · ${info.code ? `kode: ${info.code}` : 'ingen kode'}`);
  } else if (info.open_until && new Date(info.open_until) > new Date()) {
    state.replaceChildren(el('strong', {}, 'Stengt – alle plassene er brukt'),
      `${places}. Øk antallet for å åpne igjen.`);
  } else {
    state.replaceChildren(el('strong', {}, 'Stengt'),
      'Bare de du inviterer, kan få bruker.');
  }

  // Skjemaet: gjeldende verdier når den er åpen, ellers forslag (en uke, 20).
  const running = info.open_until && new Date(info.open_until) > new Date();
  const inAWeek = new Date();
  inAWeek.setDate(inAWeek.getDate() + 7);
  $('signup-until').min = dateValue(new Date());
  $('signup-until').value = dateValue(running ? new Date(info.open_until) : inAWeek);
  $('signup-max').value = info.max_signups ?? 20;
  $('signup-code').value = info.code ?? '';
  $('signup-save').textContent = running ? 'Lagre endringene' : 'Åpne registreringen';
  $('signup-close').hidden = !running;

  // Lenken tar med koden, så den kan deles som den er.
  const link = `${location.origin}/logg-inn/?ny${info.code ? `&kode=${encodeURIComponent(info.code)}` : ''}`;
  $('signup-link').textContent = link;
  $('signup-share').hidden = !info.open;
}

async function setupSignup() {
  renderSignup(await adminGetSignup());

  $('signup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    signupMessage(null);
    $('signup-save').disabled = true;
    try {
      renderSignup(await adminSetSignup(endOfDay($('signup-until').value),
        Number($('signup-max').value), $('signup-code').value.trim()));
      signupMessage('Lagret.');
    } catch (error) {
      signupMessage(error.message || 'Kunne ikke lagre. Prøv igjen.', true);
    } finally {
      $('signup-save').disabled = false;
    }
  });

  $('signup-close').addEventListener('click', async () => {
    signupMessage(null);
    try {
      renderSignup(await adminSetSignup(null, null, $('signup-code').value.trim()));
      signupMessage('Registreringen er stengt.');
    } catch (error) {
      signupMessage(error.message || 'Kunne ikke stenge. Prøv igjen.', true);
    }
  });

  $('signup-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('signup-link').textContent);
      $('signup-copy').textContent = 'Kopiert ✓';
    } catch {
      $('signup-copy').textContent = 'Merk og kopier lenken over';
    }
    setTimeout(() => { $('signup-copy').textContent = 'Kopier lenken'; }, 2500);
  });
}

// ---------------------------------------------------------------------------

function setupInvite() {
  $('invite').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('invite-email').value.trim();
    if (!email) return;
    const button = $('invite').querySelector('button');
    button.disabled = true;
    inviteMessage(null);
    try {
      const { invited } = await invite(email, 'full');
      $('invite-email').value = '';
      inviteMessage(invited
        ? `Invitasjon sendt til ${email}.`
        : `${email} hadde allerede konto, og er nå full bruker.`);
      renderUsers();
    } catch (error) {
      inviteMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

async function main() {
  me = await getUser();
  if (!me) {
    location.replace(`/logg-inn/?neste=${encodeURIComponent(location.pathname)}`);
    return;
  }
  if (!(await isAdmin())) return showMessage('Denne siden er bare for administratorer.');

  setupInvite();
  await Promise.all([setupSignup().catch(() => signupMessage('Kunne ikke hente registreringen.', true)), renderUsers()]);
  $('message').hidden = true;
  $('content').hidden = false;
}

main();
