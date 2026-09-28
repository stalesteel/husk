// Redigering av en gruppe: gruppesiden (navn, bilde, beskrivelse), listene
// i den, QR-kode og sletting. Ser ut som gruppesiden, og lagres fortløpende.

import { getUser } from './auth.js';
import {
  createList, deleteGroup, deleteList, getGroup, getGroupOwner, imageUrl,
  insertStep, listImagePaths, removeFiles, saveOrder, updateGroup, uploadImage,
} from './data.js';
import { el } from './dom.js';
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
    if (!name) return; // en gruppe må ha navn
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
  requestAnimationFrame(fit);
}

// ---------------------------------------------------------------------------
// Bildet
// ---------------------------------------------------------------------------

function showHero(src) {
  $('hero').hidden = !src;
  $('hero-tools').hidden = !src;
  $('hero-empty').hidden = !!src;
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
      el('div', { class: 'list-row-title' }, list.title),
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
// Sletting av hele gruppen (bare eieren)
// ---------------------------------------------------------------------------

function setupDelete() {
  $('delete-group').addEventListener('click', async () => {
    const count = group.lists.length;
    const lists = count ? ` og ${count === 1 ? 'listen i den' : `alle de ${count} listene`}` : '';
    if (!confirm(`Slette gruppen «${group.name}»${lists}, med alle bilder? Dette kan ikke angres.`)) return;

    $('delete-group').disabled = true;
    await settle();

    // Alle bildene ligger i mappen til gruppen, så den tømmes i sin helhet.
    const { data: files } = await supabase.storage.from('images').list(group.id, { limit: 1000 });
    try {
      await deleteGroup(group.id);
    } catch {
      $('delete-group').disabled = false;
      alert('Kunne ikke slette gruppen. Bare eieren kan slette den.');
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
    return showMessage('Kunne ikke laste gruppen. Sjekk nettet og prøv igjen.');
  }
  if (!group) return showMessage('Fant ikke denne gruppen. Sjekk at lenken er riktig.');
  if (!group.can_edit) return showMessage('Du har ikke tilgang til å redigere denne gruppen.');

  document.title = `Rediger ${group.name} – Husk Klommestein`;
  $('back').href = `/gruppe/?id=${group.id}`;
  $('done').href = `/gruppe/?id=${group.id}`;
  $('group-qr').href = `/qr/?gruppe=${group.id}`;
  for (const link of [$('back'), $('done'), $('group-qr')]) leaveVia(link);

  setupText();
  setupImage();
  renderLists();
  setupNewList();
  setupDelete();
  $('danger').hidden = (await getGroupOwner(group.id).catch(() => null)) !== user.id;

  $('message').hidden = true;
  $('group').hidden = false;
}

main();
