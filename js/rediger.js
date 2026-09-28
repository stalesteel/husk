// Redigering av en liste. Ser ut som sjekklisten (liste.js), men tittel og
// beskrivelse er felt, bildene tas med kameraet rett inn i steget, og alt
// lagres fortløpende.

import { getUser } from './auth.js';
import {
  deleteImage, deleteStep, getList, imageUrl, insertImage, insertStep,
  removeFiles, saveOrder, updateImage, updateList, updateStep, uploadImage,
} from './data.js';
import { el } from './dom.js';
import { prepareImage } from './images.js';

const $ = (id) => document.getElementById(id);
const stepsEl = $('steps');

// Listen slik get_list gir den, og som endres lokalt i takt med lagringen.
// Hvert bilde kan i tillegg ha localUrl og uploading mens det lastes opp,
// og hvert steg shown (bildet som vises).
let list;
let current = 0;

// ---------------------------------------------------------------------------
// Lagring
// Tekst lagres litt etter at man har sluttet å skrive. Alt annet lagres med
// en gang. Statusen øverst viser om noe ikke er lagret ennå.
// ---------------------------------------------------------------------------

const timers = new Map();   // nøkkel -> { timer, run }
const inFlight = new Set();
let failed = false;
let changed = false;

function save(promise) {
  changed = true;
  const tracked = promise
    .catch((error) => { failed = true; console.error(error); })
    .finally(() => { inFlight.delete(tracked); showStatus(); });
  inFlight.add(tracked);
  showStatus();
  return tracked;
}

function later(key, run, delay = 700) {
  clearTimeout(timers.get(key)?.timer);
  timers.set(key, { run, timer: setTimeout(() => { timers.delete(key); save(run()); }, delay) });
  showStatus();
}

function flushAll() {
  for (const { timer, run } of timers.values()) {
    clearTimeout(timer);
    save(run());
  }
  timers.clear();
}

async function settle() {
  flushAll();
  await Promise.all(inFlight);
}

function showStatus() {
  const status = $('save-status');
  status.classList.toggle('error', failed);
  if (failed) status.textContent = 'Ikke lagret – last siden på nytt';
  else if (timers.size || inFlight.size) status.textContent = 'Lagrer …';
  else status.textContent = changed ? 'Lagret' : '';
}

// Lenker ut av siden venter til alt er lagret.
function leaveVia(link) {
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    await settle();
    location.assign(link.href);
  });
}

window.addEventListener('beforeunload', (event) => {
  if (timers.size || inFlight.size) event.preventDefault();
});
window.addEventListener('pagehide', flushAll);

// ---------------------------------------------------------------------------
// Tegning
// ---------------------------------------------------------------------------

function renderAll(scrollTo = current) {
  flushAll();
  stepsEl.replaceChildren(...list.steps.map(renderStep), renderSettings());
  current = Math.min(scrollTo, stepsEl.children.length - 1);
  stepsEl.scrollTop = current * stepsEl.clientHeight;
  updateCounter();
}

function rerenderStep(step) {
  const index = list.steps.indexOf(step);
  if (index === -1) return;
  flushAll();
  stepsEl.children[index].replaceWith(renderStep(step, index));
}

function renderStep(step, index) {
  const images = step.images;
  step.shown = Math.min(step.shown ?? 0, Math.max(images.length - 1, 0));
  const isLast = index === list.steps.length - 1;

  // Bildene
  const slides = el('div', { class: 'slides' }, images.map((image) => {
    const img = el('img', { src: image.localUrl ?? imageUrl(image.path), alt: '' });
    const slide = el('div', { class: image.uploading ? 'slide uploading' : 'slide' }, img);
    img.addEventListener('error', () => slide.classList.add('broken'));
    return slide;
  }));

  const dots = images.length > 1
    ? images.map((_, i) => el('button', {
        class: 'dot',
        type: 'button',
        'aria-label': `Bilde ${i + 1} av ${images.length}`,
        onclick: () => slides.scrollTo({ left: i * slides.clientWidth, behavior: 'smooth' }),
      }))
    : [];

  const shownImage = () => images[step.shown];
  const tools = images.length
    ? el('div', { class: 'media-tools' },
        images.length > 1 ? el('button', {
          class: 'tool', type: 'button', 'aria-label': 'Flytt bildet til venstre',
          disabled: step.shown === 0, onclick: () => moveImage(step, -1),
        }, '‹') : null,
        images.length > 1 ? el('button', {
          class: 'tool', type: 'button', 'aria-label': 'Flytt bildet til høyre',
          disabled: step.shown === images.length - 1, onclick: () => moveImage(step, 1),
        }, '›') : null,
        el('button', { class: 'tool', type: 'button', onclick: () => removeImage(step) }, 'Fjern'),
        el('button', { class: 'tool', type: 'button', onclick: () => pickImages(step) }, '+ Bilde'))
    : el('button', { class: 'take-photo', type: 'button', onclick: () => pickImages(step) }, '📷 Ta bilde');

  // Etiketten hører til bildet som vises, og brukes bare når steget har flere.
  const label = images.length > 1
    ? el('input', {
        class: 'field image-label', type: 'text', maxlength: 40,
        placeholder: 'Etikett for bildet (valgfri)', 'aria-label': 'Etikett for bildet',
      })
    : null;
  label?.addEventListener('input', () => {
    const image = shownImage();
    if (!image?.id) return;
    image.label = label.value.trim() || null;
    later(`label:${image.id}`, () => updateImage(image.id, { label: image.label }));
  });

  const showImage = (i) => {
    step.shown = i;
    dots.forEach((dot, d) => dot.classList.toggle('active', d === i));
    const [left, right] = tools.querySelectorAll?.('.tool') ?? [];
    if (images.length > 1) {
      left.disabled = i === 0;
      right.disabled = i === images.length - 1;
    }
    if (label) {
      label.value = shownImage()?.label ?? '';
      label.disabled = !shownImage()?.id;
    }
  };

  slides.addEventListener('scroll', () => {
    const i = Math.round(slides.scrollLeft / slides.clientWidth);
    if (i !== step.shown) showImage(i);
  }, { passive: true });

  // Teksten
  const title = el('input', {
    class: 'field step-title', type: 'text', placeholder: 'Tittel', 'aria-label': 'Tittel',
    value: step.title, enterkeyhint: 'next',
  });
  title.addEventListener('input', () => {
    step.title = title.value;
    later(`title:${step.id}`, () => updateStep(step.id, { title: step.title.trim() }));
  });
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); description.focus(); }
  });

  const description = el('textarea', {
    class: 'field description', rows: 3, placeholder: 'Beskrivelse', 'aria-label': 'Beskrivelse',
  }, step.description);
  const fit = () => { description.style.height = 'auto'; description.style.height = `${description.scrollHeight}px`; };
  description.addEventListener('input', () => {
    fit();
    step.description = description.value;
    later(`description:${step.id}`, () => updateStep(step.id, { description: step.description.trim() }));
  });

  const section = el('section', { class: 'step editing', 'aria-label': `Steg ${index + 1}` },
    el('div', { class: 'media' },
      slides,
      dots.length ? el('div', { class: 'dots' }, dots) : null,
      tools),
    el('div', { class: 'text' }, label, title, description),
    el('div', { class: 'actions' },
      el('button', {
        class: 'check', type: 'button',
        onclick: () => (isLast ? addStep() : scrollToSection(index + 1)),
      }, 'Neste steg'),
      el('div', { class: 'step-tools' },
        el('button', { type: 'button', disabled: index === 0, onclick: () => moveStep(index, -1) }, '↑ Flytt opp'),
        el('button', { type: 'button', disabled: isLast, onclick: () => moveStep(index, 1) }, '↓ Flytt ned'),
        el('button', { type: 'button', class: 'danger', onclick: () => removeStep(index) }, 'Slett steg'))));

  // Plassering og høyde kan først regnes ut når steget står i siden.
  requestAnimationFrame(() => {
    fit();
    if (step.shown) slides.scrollLeft = step.shown * slides.clientWidth;
    showImage(step.shown);
  });
  return section;
}

function renderSettings() {
  const title = el('input', { id: 'list-title-input', type: 'text', value: list.title });
  title.addEventListener('input', () => {
    const value = title.value.trim();
    if (!value) return; // en liste må ha navn
    list.title = value;
    $('list-title').textContent = value;
    later('list-title', () => updateList(list.id, { title: list.title }));
  });

  const requireSeen = el('input', { type: 'checkbox', checked: list.require_all_images_seen });
  requireSeen.addEventListener('change', () => {
    list.require_all_images_seen = requireSeen.checked;
    save(updateList(list.id, { require_all_images_seen: requireSeen.checked }));
  });

  const view = el('a', { class: 'check secondary', href: `/liste/?id=${list.id}` }, 'Se listen slik andre ser den');
  leaveVia(view);

  return el('section', { class: 'summary settings', 'aria-label': 'Innstillinger for listen' },
    el('h2', {}, 'Listen'),
    el('label', { class: 'setting', for: 'list-title-input' }, 'Navn'),
    title,
    el('label', { class: 'setting toggle' },
      requireSeen,
      el('span', {},
        'Krev at alle bildene er sett før avkryssing',
        el('small', {}, 'Nyttig for lister andre skal følge. Gjelder steg med flere bilder.'))),
    el('button', { class: 'check', type: 'button', onclick: addStep },
      list.steps.length ? '+ Nytt steg' : '+ Legg til første steg'),
    view);
}

function scrollToSection(index) {
  stepsEl.children[index]?.scrollIntoView({ behavior: 'smooth' });
}

function updateCounter() {
  const total = list.steps.length;
  $('counter').textContent = current < total ? `${current + 1} av ${total}` : '';
}

function trackCurrentSection() {
  stepsEl.addEventListener('scroll', () => {
    const index = Math.round(stepsEl.scrollTop / stepsEl.clientHeight);
    if (index !== current) {
      current = index;
      updateCounter();
    }
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Steg
// ---------------------------------------------------------------------------

async function addStep() {
  flushAll();
  let row;
  await save(insertStep(list.id, list.steps.length + 1).then((r) => { row = r; }));
  if (!row) return;
  list.steps.push({ id: row.id, title: '', description: '', images: [] });
  renderAll(list.steps.length - 1);
  // Arbeidsflyten er tittel, beskrivelse, bilde – så tittelen får fokus.
  stepsEl.children[list.steps.length - 1].querySelector('.step-title')?.focus({ preventScroll: true });
}

function moveStep(index, direction) {
  const target = index + direction;
  const [step] = list.steps.splice(index, 1);
  list.steps.splice(target, 0, step);
  renderAll(target);
  save(saveOrder('steps', list.steps.map((s) => s.id)));
}

function removeStep(index) {
  const step = list.steps[index];
  const count = step.images.length;
  const name = step.title.trim() ? `«${step.title.trim()}»` : `steg ${index + 1}`;
  const withImages = count ? ` og ${count === 1 ? 'bildet' : `de ${count} bildene`}` : '';
  if (!confirm(`Slette ${name}${withImages}?`)) return;

  list.steps.splice(index, 1);
  renderAll(Math.min(index, list.steps.length));
  const paths = step.images.map((image) => image.path).filter(Boolean);
  save(deleteStep(step.id).then(() => removeFiles(paths)));
}

// ---------------------------------------------------------------------------
// Bilder
// Uten capture-attributt får man både kamera og bildebibliotek å velge fra.
// ---------------------------------------------------------------------------

let pickingFor = null;

function pickImages(step) {
  pickingFor = step;
  $('file').value = '';
  $('file').click();
}

$('file').addEventListener('change', async () => {
  const step = pickingFor;
  const files = [...$('file').files];
  for (const file of files) await addImage(step, file);
});

async function addImage(step, file) {
  let blob;
  try {
    blob = await prepareImage(file);
  } catch {
    alert('Kunne ikke lese bildet. Prøv et annet.');
    return;
  }

  // Bildet vises med en gang, mens det lastes opp i bakgrunnen.
  const image = { id: null, path: null, label: null, localUrl: URL.createObjectURL(blob), uploading: true };
  step.images.push(image);
  step.shown = step.images.length - 1;
  rerenderStep(step);

  await save((async () => {
    image.path = await uploadImage(list.group.id, blob);
    try {
      image.id = (await insertImage(step.id, image.path, step.images.indexOf(image) + 1)).id;
    } catch (error) {
      await removeFiles([image.path]);
      throw error;
    }
  })());

  image.uploading = false;
  if (!image.id) {
    step.images.splice(step.images.indexOf(image), 1);
    URL.revokeObjectURL(image.localUrl);
    alert('Bildet ble ikke lagret. Sjekk nettet og prøv igjen.');
  }
  rerenderStep(step);
}

function moveImage(step, direction) {
  if (step.images.some((image) => image.uploading)) return;
  const from = step.shown;
  const to = from + direction;
  const [image] = step.images.splice(from, 1);
  step.images.splice(to, 0, image);
  step.shown = to;
  rerenderStep(step);
  save(saveOrder('step_images', step.images.map((i) => i.id)));
}

function removeImage(step) {
  const image = step.images[step.shown];
  if (!image || image.uploading) return;
  if (!confirm('Fjerne dette bildet?')) return;
  step.images.splice(step.shown, 1);
  step.shown = Math.max(0, step.shown - 1);
  rerenderStep(step);
  save(deleteImage(image.id).then(() => removeFiles([image.path])));
}

// ---------------------------------------------------------------------------

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
  stepsEl.hidden = true;
}

async function main() {
  const listId = new URLSearchParams(location.search).get('id');

  // Redigering krever innlogging. Etterpå kommer man tilbake hit.
  if (!(await getUser())) {
    location.replace(`/logg-inn/?neste=${encodeURIComponent(location.pathname + location.search)}`);
    return;
  }

  try {
    list = await getList(listId);
  } catch {
    showMessage('Kunne ikke laste listen. Sjekk nettet og prøv igjen.');
    return;
  }
  if (!list) return showMessage('Fant ikke denne listen. Sjekk at lenken er riktig.');
  if (!list.can_edit) return showMessage('Du har ikke tilgang til å redigere denne listen.');

  document.title = `Rediger ${list.title} – Husk Klommestein`;
  $('list-title').textContent = list.title;
  $('back').href = `/gruppe/?id=${list.group.id}`;
  $('back').setAttribute('aria-label', `Tilbake til ${list.group.name}`);
  $('done').href = `/liste/?id=${list.id}`;
  leaveVia($('back'));
  leaveVia($('done'));

  $('message').hidden = true;
  stepsEl.hidden = false;
  renderAll(0);
  trackCurrentSection();
}

main();
