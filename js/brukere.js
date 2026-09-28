// Admin-siden (/admin/): inviter fulle brukere, og gi og ta roller.
// Det er databasen som sjekker at du er administrator (admin_* i
// supabase/migrations/…_roller.sql); siden viser bare det den får.

import { getUser } from './auth.js';
import { adminListUsers, adminSetAdmin, adminSetFull, invite, isAdmin } from './data.js';
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

function describe(user) {
  const parts = [];
  if (user.owned_groups) parts.push(`eier ${count(user.owned_groups, 'gruppe', 'grupper')}`);
  if (user.edited_groups) parts.push(`redaktør i ${count(user.edited_groups, 'gruppe', 'grupper')}`);
  if (user.invited) parts.push('invitert, ikke logget inn ennå');
  return parts.join(' · ') || 'ingen grupper';
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
              `Gjøre ${user.email} til redaktør? Personen beholder gruppene sine, men kan ikke lage nye.`),
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
          `Gjøre ${user.email} til administrator? Personen får full tilgang til alle grupper og kan gi roller.`),
      }, 'Gjør til administrator'));
    }

    return el('div', { class: 'user-row' },
      el('div', {}, el('span', { class: 'user-email' }, user.email), role, isMe ? el('span', { class: 'badge' }, 'Deg') : null),
      el('span', { class: 'user-meta' }, describe(user)),
      tools.length ? el('div', { class: 'row-tools' }, tools) : null);
  }));
}

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
  await renderUsers();
  $('message').hidden = true;
  $('content').hidden = false;
}

main();
