// Bekreftelse på e-post når en liste er gjennomført. Egen fil (ikke i
// data.js), så en nettleser med en eldre data.js i hurtigminnet ikke stopper
// sjekklisten. Sendes av Edge Function-en «bekreft» (supabase/functions/bekreft).

import { el } from './dom.js';
import { supabase } from './supabase.js';

const NAME_KEY = 'husk-navn';

// Sender bekreftelsen. Kaster en feil med en melding som kan vises.
export async function sendConfirmation(listId, checked, name, comment) {
  const { data, error } = await supabase.functions.invoke('bekreft', {
    body: { list_id: listId, checked, name, comment },
  });
  if (!error) return data;
  let message = 'Kunne ikke sende bekreftelsen. Sjekk nettet og prøv igjen.';
  try {
    const reply = await error.context.json();
    if (reply?.message) message = reply.message;
  } catch { /* ingen melding fra funksjonen */ }
  throw new Error(message);
}

// Eieren og redaktørene som kan velges som mottakere: { user_id, email, is_owner }.
export async function getConfirmCandidates(listId) {
  const { data, error } = await supabase.rpc('confirm_candidates', { p_list_id: listId });
  if (error) throw error;
  return data;
}

// Skjemaet på oppsummeringen. checkedIds() gir stegene som er krysset av.
// Elementet lages én gang og flyttes inn i oppsummeringen når den tegnes på
// nytt, så det som er skrevet, blir stående. update(remaining) oppdaterer
// knappen.
export function confirmForm(list, checkedIds) {
  const c = list.confirm;
  let saved = '';
  try { saved = localStorage.getItem(NAME_KEY) ?? ''; } catch { /* privat modus */ }

  const name = el('input', {
    class: 'confirm-input', type: 'text', maxlength: 80, autocomplete: 'name', value: saved,
    placeholder: c.require_name ? 'Navnet ditt' : 'Navnet ditt (valgfritt)', 'aria-label': 'Navnet ditt',
  });
  const comment = c.comment
    ? el('textarea', { class: 'confirm-input', rows: 3, maxlength: 2000, placeholder: 'Kommentar (valgfritt)', 'aria-label': 'Kommentar' })
    : null;
  const button = el('button', { class: 'check confirm-send', type: 'button' }, 'Send bekreftelse');
  const status = el('p', { class: 'confirm-status', role: 'status', hidden: true });
  const box = el('div', { class: 'confirm' },
    el('h3', {}, 'Send bekreftelse'),
    el('p', { class: 'confirm-intro' }, 'Gi beskjed om at listen er gått gjennom. Den som har ansvaret, får en e-post.'),
    name, comment, button, status);

  let remaining = 0;
  let sent = false;

  function showStatus(text, isError = false) {
    status.textContent = text;
    status.classList.toggle('error', isError);
    status.hidden = !text;
  }

  function update(left = remaining) {
    remaining = left;
    if (sent) return;
    const blocked = c.require_all && remaining > 0;
    button.disabled = blocked;
    button.textContent = blocked
      ? `Alle punktene må være krysset av først — ${remaining} gjenstår`
      : 'Send bekreftelse';
  }

  button.addEventListener('click', async () => {
    const who = name.value.trim();
    if (c.require_name && !who) {
      showStatus('Skriv navnet ditt først.', true);
      name.focus();
      return;
    }
    try { localStorage.setItem(NAME_KEY, who); } catch { /* privat modus */ }
    showStatus('');
    button.disabled = true;
    button.textContent = 'Sender …';
    try {
      await sendConfirmation(list.id, checkedIds(), who, comment?.value.trim() ?? '');
      sent = true;
      box.replaceChildren(el('h3', {}, '✓ Bekreftelsen er sendt'),
        el('p', { class: 'confirm-intro' }, 'Takk! Den som har ansvaret for listen, har fått beskjed.'));
    } catch (error) {
      showStatus(error.message, true);
      update();
    }
  });

  update();
  return { box, update };
}
