// Redigering av en perm: forsiden av permen (navn, bilde, beskrivelse), listene
// i den, QR-kode og sletting. Ser ut som permen, og lagres fortløpende.
// I koden og databasen heter en perm fortsatt «group».

import { actsAsAdmin, canEdit } from './admin.js';
import { getUser } from './auth.js';
import {
  createList, deleteGroup, deleteList, getGroup, getGroupEditors,
  getGroupOwner, imageUrl, insertStep, invite, listImagePaths, removeFiles, removeGroupEditor,
  saveOrder, updateGroup, uploadImage,
} from './data.js';
import { checkIcon, el } from './dom.js';
import { prepareImage } from './images.js';
import { later, leaveVia, save, settle, showStatusIn } from './saving.js';
import { supabase } from './supabase.js';

const $ = (id) => document.getElementById(id);
let group;

showStatusIn($('save-status'));

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
  $('group').hidden = true;
}

// ---------------------------------------------------------------------------
// Navn og beskrivelse
// ---------------------------------------------------------------------------

function setupText() {
  $('name').value = group.name;
  $('name').addEventListener('input', () => {
    const name = $('name').value.trim();
    if (!name) return; // en perm må ha navn
    group.name = name;
    later('name', () => updateGroup(group.id, { name: group.name }));
  });

  const description = $('description');
  description.value = group.description;
  const fit = () => { description.style.height = 'auto'; description.style.height = `${description.scrollHeight}px`; };
  description.addEventListener('input', () => {
    fit();
    group.description = description.value;
    later('description', () => updateGroup(group.id, { description: group.description.trim() }));
  });
  // Høyden kan først regnes ut når siden vises (se main).
  return fit;
}

// ---------------------------------------------------------------------------
// Bildet
// ---------------------------------------------------------------------------

// Samme topp som i permen: bildet, eller en grønn flate uten bilde.
function showHero(src) {
  $('hero').hidden = !src;
  $('hero-tools').hidden = !src;
  $('hero-empty').hidden = !!src;
  $('hero-wrap').classList.toggle('no-image', !src);
  if (src) $('hero').src = src;
}

function setupImage() {
  showHero(group.image_path ? imageUrl(group.image_path) : null);
  $('hero').addEventListener('error', () => showHero(null));

  const pick = () => { $('file').value = ''; $('file').click(); };
  $('add-image').addEventListener('click', pick);
  $('replace-image').addEventListener('click', pick);

  $('file').addEventListener('change', async () => {
    const file = $('file').files[0];
    if (!file) return;
    let blob;
    try {
      blob = await prepareImage(file);
    } catch {
      alert('Kunne ikke lese bildet. Prøv et annet.');
      return;
    }
    const previous = group.image_path;
    showHero(URL.createObjectURL(blob));

    let saved = false;
    await save((async () => {
      const path = await uploadImage(group.id, blob);
      await updateGroup(group.id, { image_path: path });
      group.image_path = path;
      saved = true;
    })());
    if (!saved) {
      showHero(previous ? imageUrl(previous) : null);
      alert('Bildet ble ikke lagret. Sjekk nettet og prøv igjen.');
      return;
    }
    if (previous) removeFiles([previous]);
  });

  $('remove-image').addEventListener('click', () => {
    if (!confirm('Fjerne bildet av stedet?')) return;
    const previous = group.image_path;
    group.image_path = null;
    showHero(null);
    save(updateGroup(group.id, { image_path: null }).then(() => previous && removeFiles([previous])));
  });
}

// ---------------------------------------------------------------------------
// Listene
// ---------------------------------------------------------------------------

function renderLists() {
  const lists = group.lists;
  $('lists').replaceChildren(...lists.map((list, index) => {
    const editLink = el('a', { href: `/rediger/?id=${list.id}` }, 'Rediger');
    const qrLink = el('a', { href: `/qr/?liste=${list.id}` }, 'QR-kode');
    leaveVia(editLink);
    leaveVia(qrLink);
    return el('div', { class: 'list-row' },
      el('div', { class: 'list-row-title' }, checkIcon(), list.title),
      el('div', { class: 'row-tools' },
        editLink,
        qrLink,
        el('button', { type: 'button', 'aria-label': 'Flytt opp', disabled: index === 0, onclick: () => moveList(index, -1) }, '↑'),
        el('button', { type: 'button', 'aria-label': 'Flytt ned', disabled: index === lists.length - 1, onclick: () => moveList(index, 1) }, '↓'),
        el('button', { type: 'button', class: 'danger', onclick: () => removeList(index) }, 'Slett')));
  }));
}

function moveList(index, direction) {
  const [list] = group.lists.splice(index, 1);
  group.lists.splice(index + direction, 0, list);
  renderLists();
  save(saveOrder('lists', group.lists.map((l) => l.id)));
}

async function removeList(index) {
  const list = group.lists[index];
  if (!confirm(`Slette listen «${list.title}» med alle steg og bilder? Dette kan ikke angres.`)) return;
  group.lists.splice(index, 1);
  renderLists();
  save((async () => {
    const paths = await listImagePaths(list.id);
    await deleteList(list.id);
    await removeFiles(paths);
  })());
}

// Ny liste: får med en gang et tomt første steg, og åpnes i redigeringen
// med markøren i tittelen – navn, så steg 1, som i arbeidsflyten.
function setupNewList() {
  $('new-list').addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = $('new-list-title').value.trim();
    if (!title) return;
    const button = $('new-list').querySelector('button');
    button.disabled = true;

    let listId = null;
    await save((async () => {
      const { id } = await createList(group.id, title, group.lists.length + 1);
      await insertStep(id, 1);
      listId = id;
    })());

    if (!listId) {
      button.disabled = false;
      alert('Kunne ikke lage listen. Sjekk nettet og prøv igjen.');
      return;
    }
    await settle();
    location.assign(`/rediger/?id=${listId}&ny`);
  });
}

// ---------------------------------------------------------------------------
// Redaktører
// Eieren ser og endrer hvem som kan redigere. En redaktør kan trekke seg.
// ---------------------------------------------------------------------------

function editorMessage(text, isError = false) {
  const message = $('editor-message');
  message.textContent = text ?? '';
  message.className = isError ? 'error' : 'muted';
  message.hidden = !text;
}

async function renderEditors() {
  let editors;
  try {
    editors = await getGroupEditors(group.id);
  } catch {
    $('editors').replaceChildren(el('p', { class: 'error' }, 'Kunne ikke hente redaktørene.'));
    return;
  }
  $('editors').replaceChildren(...(editors.length
    ? editors.map((editor) => el('div', { class: 'editor-row' },
        el('span', {}, editor.email,
          editor.invited ? el('small', { class: 'muted' }, ' · invitert, ikke logget inn ennå') : null),
        el('button', { type: 'button', onclick: () => removeEditor(editor) }, 'Fjern')))
    : [el('p', { class: 'muted' }, 'Ingen andre enn deg kan redigere ennå.')]));
}

async function removeEditor(editor) {
  if (!confirm(`Fjerne redigeringstilgangen til ${editor.email}?`)) return;
  editorMessage(null);
  await save(removeGroupEditor(group.id, editor.user_id));
  renderEditors();
}

// Eieren skriver bare e-postadressen. Serverfunksjonen finner ut om personen
// har konto (legges til med en gang) eller må inviteres (får e-post, og blir
// redaktør uten mulighet til å lage egne permer).
function setupEditors() {
  $('new-editor').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = $('new-editor-email').value.trim();
    if (!email) return;

    const button = $('new-editor').querySelector('button');
    button.disabled = true;
    editorMessage(null);
    try {
      const { invited } = await invite(email, 'editor', group.id);
      $('new-editor-email').value = '';
      editorMessage(invited
        ? `Invitasjon sendt til ${email}. Personen kan redigere permen når invitasjonen er tatt imot.`
        : `${email} kan nå redigere. Det sendes ingen e-post, så gi gjerne beskjed – permen står på forsiden neste gang personen logger inn.`);
      renderEditors();
    } catch (error) {
      editorMessage(error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

function setupLeave(user) {
  $('leave').addEventListener('click', async () => {
    if (!confirm(`Fjerne deg selv som redaktør av «${group.name}»? Du kan ikke redigere den etterpå.`)) return;
    await settle();
    try {
      await removeGroupEditor(group.id, user.id);
    } catch {
      alert('Kunne ikke fjerne deg. Sjekk nettet og prøv igjen.');
      return;
    }
    location.assign(`/perm/?id=${group.id}`);
  });
}

// ---------------------------------------------------------------------------
// Sletting av hele permen (bare eieren)
// ---------------------------------------------------------------------------

function setupDelete() {
  $('delete-perm').addEventListener('click', async () => {
    const count = group.lists.length;
    const lists = count ? ` og ${count === 1 ? 'listen i den' : `alle de ${count} listene`}` : '';
    if (!confirm(`Slette permen «${group.name}»${lists}, med alle bilder? Dette kan ikke angres.`)) return;

    $('delete-perm').disabled = true;
    await settle();

    // Alle bildene ligger i mappen til permen, så den tømmes i sin helhet.
    const { data: files } = await supabase.storage.from('images').list(group.id, { limit: 1000 });
    try {
      await deleteGroup(group.id);
    } catch {
      $('delete-perm').disabled = false;
      alert('Kunne ikke slette permen. Bare eieren kan slette den.');
      return;
    }
    await removeFiles((files ?? []).map((file) => `${group.id}/${file.name}`));
    location.assign('/');
  });
}

// ---------------------------------------------------------------------------

async function main() {
  const groupId = new URLSearchParams(location.search).get('id');

  const user = await getUser();
  if (!user) {
    location.replace(`/logg-inn/?neste=${encodeURIComponent(location.pathname + location.search)}`);
    return;
  }

  try {
    group = await getGroup(groupId);
  } catch {
    return showMessage('Kunne ikke laste permen. Sjekk nettet og prøv igjen.');
  }
  if (!group) return showMessage('Fant ikke denne permen. Sjekk at lenken er riktig.');
  if (!canEdit(group)) return showMessage('Du har ikke tilgang til å redigere denne permen.');

  document.title = `Rediger ${group.name} – Husk Klommestein`;
  $('back').href = `/perm/?id=${group.id}`;
  $('done').href = `/perm/?id=${group.id}`;
  $('group-qr').href = `/qr/?perm=${group.id}`;
  $('poster').href = `/plakat/?perm=${group.id}`;
  for (const link of [$('back'), $('done'), $('group-qr'), $('poster')]) leaveVia(link);

  const fitDescription = setupText();
  setupImage();
  renderLists();
  setupNewList();
  setupDelete();
  setupEditors();
  setupLeave(user);

  // I adminmodus har du eierens rettigheter: styre redaktører og slette.
  const isOwner = (await getGroupOwner(group.id).catch(() => null)) === user.id;
  const asAdmin = !isOwner && actsAsAdmin(group);
  const fullAccess = isOwner || asAdmin;
  $('danger').hidden = !fullAccess;
  $('editors-section').hidden = !fullAccess;
  $('leave-section').hidden = fullAccess || !group.can_edit;
  $('admin-note').hidden = !asAdmin;
  if (asAdmin) $('editors-intro').textContent = 'Adminmodus: du styrer redaktørene i en annens perm.';
  if (fullAccess) renderEditors();

  $('message').hidden = true;
  $('group').hidden = false;
  fitDescription();
}

main();
