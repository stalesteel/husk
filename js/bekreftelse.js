// Bekreftelse på e-post når en liste er gjennomført. Egen fil (ikke i
// data.js), så en nettleser med en eldre data.js i hurtigminnet ikke stopper
// sjekklisten. Sendes av Edge Function-en «bekreft» (supabase/functions/bekreft).

import { el } from './dom.js';
import { prepareImage } from './images.js';
import { supabase } from './supabase.js';

const NAME_KEY = 'husk-navn';
const MAX_PHOTOS = 4;

// Bildet krympet til JPEG (1280 px) som data-URL, klart til å sendes.
async function photoData(file) {
  const blob = await prepareImage(file, 1280, 0.8);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Sender bekreftelsen. Kaster en feil med en melding som kan vises.
export async function sendConfirmation(listId, checked, name, comment, photos = []) {
  const { data, error } = await supabase.functions.invoke('bekreft', {
    body: { list_id: listId, checked, name, comment, photos },
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
  // Bilder (når det er slått på): opptil fire, vist som små bilder som kan fjernes.
  const photos = [];   // { data, url }
  const thumbs = el('div', { class: 'confirm-photos' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const addPhoto = c.photos
    ? el('button', { class: 'confirm-add-photo', type: 'button', onclick: () => { fileInput.value = ''; fileInput.click(); } }, '📷 Legg ved bilde')
    : null;
  function renderPhotos() {
    thumbs.replaceChildren(...photos.map((photo, i) => el('span', { class: 'confirm-thumb' },
      el('img', { src: photo.url, alt: `Bilde ${i + 1}` }),
      el('button', { type: 'button', 'aria-label': 'Fjern bildet', onclick: () => { photos.splice(i, 1); renderPhotos(); } }, '×'))));
    if (addPhoto) addPhoto.hidden = photos.length >= MAX_PHOTOS;
  }
  fileInput.addEventListener('change', async () => {
    for (const file of [...fileInput.files].slice(0, MAX_PHOTOS - photos.length)) {
      try {
        const data = await photoData(file);
        photos.push({ data, url: data });
      } catch {
        showStatus('Kunne ikke lese et av bildene. Prøv et annet.', true);
      }
    }
    renderPhotos();
  });

  const button = el('button', { class: 'check confirm-send', type: 'button' }, 'Send bekreftelse');
  const status = el('p', { class: 'confirm-status', role: 'status', hidden: true });
  const box = el('div', { class: 'confirm' },
    el('h3', {}, 'Send bekreftelse'),
    el('p', { class: 'confirm-intro' }, 'Gi beskjed om at listen er gått gjennom. Den som har ansvaret, får en e-post.'),
    name, comment, c.photos ? thumbs : null, addPhoto, fileInput, button, status);

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
    // Animasjonen viser at sendingen pågår (kan ta litt tid med bilder).
    button.classList.add('sending');
    button.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Sender …');
    try {
      await sendConfirmation(list.id, checkedIds(), who, comment?.value.trim() ?? '', photos.map((p) => p.data));
      sent = true;
      box.replaceChildren(el('h3', {}, '✓ Bekreftelsen er sendt'),
        el('p', { class: 'confirm-intro' }, 'Takk! Den som har ansvaret for listen, har fått beskjed.'));
    } catch (error) {
      button.classList.remove('sending');
      showStatus(error.message, true);
      update();
    }
  });

  update();
  return { box, update };
}
