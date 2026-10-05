// Redigering av en liste. Ser ut som sjekklisten (liste.js), men tittel og
// beskrivelse er felt, bildene tas med kameraet rett inn i steget, og alt
// lagres fortløpende.

import { canEdit } from './admin.js';
import { getUser } from './auth.js';
import {
  deleteImage, deleteStep, getList, imageUrl, insertImage, insertStep,
  removeFiles, saveOrder, updateImage, updateList, updateStep, uploadImage,
} from './data.js';
import { getConfirmCandidates } from './bekreftelse.js';
import { imageArrows } from './bildepiler.js';
import { el } from './dom.js';
import { prepareImage } from './images.js';
import { flushAll, later, leaveVia, save, showStatusIn } from './saving.js';

const $ = (id) => document.getElementById(id);
const stepsEl = $('steps');

// Listen slik get_list gir den, og som endres lokalt i takt med lagringen.
// Hvert bilde kan i tillegg ha localUrl og uploading mens det lastes opp,
// og hvert steg shown (bildet som vises).
let list;
// Sidene i redigeringen: først innstillingene for listen, så stegene. Steg i
// står derfor på side i + 1. current er siden som vises.
let current = 0;
const pageOf = (stepIndex) => stepIndex + 1;
// Eieren og redaktørene som kan få bekreftelse på e-post (hentes i main).
let candidates = [];

showStatusIn($('save-status'));

// ---------------------------------------------------------------------------
// Etikettbredde
// Grensen er bildebredden på en liten telefon (375 px) minus margen rundt
// etiketten, så den får plass på én linje på alle skjermer.
// ---------------------------------------------------------------------------

const LABEL_MAX_WIDTH = 375 - 24;
const measureContext = document.createElement('canvas').getContext('2d');

// Bredden etiketten får med denne teksten, med polstring og ramme.
function labelWidth(input, text) {
  const style = getComputedStyle(input);
  measureContext.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return measureContext.measureText(text).width + padding + 4;
}

// ---------------------------------------------------------------------------
// Tegning
// ---------------------------------------------------------------------------

// scrollTo er siden som skal vises (se pageOf).
function renderAll(scrollTo = current) {
  flushAll();
  stepsEl.replaceChildren(renderSettings(), ...list.steps.map(renderStep));
  current = Math.min(scrollTo, stepsEl.children.length - 1);
  stepsEl.scrollTop = current * stepsEl.clientHeight;
  updateCounter();
}

function rerenderStep(step) {
  const index = list.steps.indexOf(step);
  if (index === -1) return;
  flushAll();
  stepsEl.children[pageOf(index)].replaceWith(renderStep(step, index));
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
        class: 'field image-label', type: 'text', maxlength: 60,
        placeholder: '+ Etikett', 'aria-label': 'Etikett for bildet (valgfri)',
      })
    : null;
  // Etiketten må få plass på én linje på bildet også på en liten telefon.
  // Blir den for lang, beholdes forrige tekst. Feltet er så bredt som teksten.
  let lastLabel = '';
  const fitLabel = () => {
    const text = label.value || label.placeholder;
    label.style.width = `${Math.ceil(labelWidth(label, text))}px`;
  };
  label?.addEventListener('input', () => {
    const image = shownImage();
    if (!image?.id) return;
    if (labelWidth(label, label.value) > LABEL_MAX_WIDTH) {
      const caret = label.selectionStart - (label.value.length - lastLabel.length);
      label.value = lastLabel;
      label.setSelectionRange(caret, caret);
      return;
    }
    lastLabel = label.value;
    fitLabel();
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
      lastLabel = label.value;
      label.disabled = !shownImage()?.id;
      fitLabel();
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
      ...imageArrows(slides, images.length),
      label,
      tools),
    el('div', { class: 'text' }, title, description),
    el('div', { class: 'actions' },
      el('button', {
        class: 'check', type: 'button',
        onclick: () => (isLast ? addStep() : scrollToPage(pageOf(index + 1))),
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

  // Har listen steg, fører knappen ned til dem; ellers lager den det første.
  const toSteps = list.steps.length
    ? el('button', { class: 'check', type: 'button', onclick: () => scrollToPage(pageOf(0)) },
        `Til stegene (${list.steps.length}) ↓`)
    : el('button', { class: 'check', type: 'button', onclick: addStep }, '+ Legg til første steg');

  return el('section', { class: 'summary settings', 'aria-label': 'Innstillinger for listen' },
    el('h2', {}, 'Listen'),
    el('p', { class: 'settings-intro' }, 'Valgene her gjelder hele listen. Stegene ligger under.'),
    el('label', { class: 'setting', for: 'list-title-input' }, 'Navn'),
    title,
    el('label', { class: 'setting toggle' },
      requireSeen,
      el('span', {},
        'Krev at alle bildene er sett før avkryssing',
        el('small', {}, 'Nyttig for lister andre skal følge. Gjelder steg med flere bilder.'))),
    renderConfirmSettings(),
    toSteps,
    view);
}

// Bekreftelse på e-post: av som standard. Slås den på, kommer valgene for
// mottakere og hva gjesten må gjøre.
function renderConfirmSettings() {
  const c = list.confirm ??= { enabled: false, require_all: false, comment: false, require_name: false };
  const cs = list.confirm_settings ??= { to_owner: true, editors: [], include_steps: true };

  const toggle = (checked, text, help, onchange) => {
    const box = el('input', { type: 'checkbox', checked });
    box.addEventListener('change', () => onchange(box.checked));
    return el('label', { class: 'setting toggle' }, box, el('span', {}, text, help ? el('small', {}, help) : null));
  };
  const warn = el('p', { class: 'settings-warn', hidden: true }, 'Velg minst én mottaker, ellers kan ikke bekreftelsen sendes.');
  const checkRecipients = () => { warn.hidden = !(c.enabled && !cs.to_owner && !cs.editors.length); };

  const recipients = candidates.map((person) => toggle(
    person.is_owner ? cs.to_owner : cs.editors.includes(person.user_id),
    person.email,
    person.is_owner ? 'Eier' : 'Redaktør',
    (on) => {
      if (person.is_owner) {
        cs.to_owner = on;
        save(updateList(list.id, { confirm_to_owner: on }));
      } else {
        cs.editors = on ? [...new Set([...cs.editors, person.user_id])] : cs.editors.filter((id) => id !== person.user_id);
        save(updateList(list.id, { confirm_editors: cs.editors }));
      }
      checkRecipients();
    }));

  const options = el('div', { class: 'settings-group', hidden: !c.enabled },
    el('p', { class: 'setting' }, 'Hvem får e-posten'),
    ...recipients,
    warn,
    el('p', { class: 'setting' }, 'Gjesten'),
    toggle(c.require_all, 'Krev at alle punktene er krysset av',
      'Slå av hvis ikke alle punktene alltid kan gjøres.',
      (on) => { c.require_all = on; save(updateList(list.id, { confirm_require_all: on })); }),
    toggle(c.require_name, 'Krev navn',
      'Gjesten får alltid et felt for navnet. Med dette må det fylles ut.',
      (on) => { c.require_name = on; save(updateList(list.id, { confirm_require_name: on })); }),
    toggle(c.comment, 'Gjesten kan skrive en kommentar', null,
      (on) => { c.comment = on; save(updateList(list.id, { confirm_comment: on })); }),
    el('p', { class: 'setting' }, 'E-posten'),
    toggle(cs.include_steps, 'Ta med punktene og hvilke som er krysset av', null,
      (on) => { cs.include_steps = on; save(updateList(list.id, { confirm_include_steps: on })); }));

  const main = toggle(c.enabled, 'Send bekreftelse på e-post når listen er gjennomført',
    'Gjesten får en knapp på oppsummeringen til slutt.',
    (on) => {
      c.enabled = on;
      options.hidden = !on;
      checkRecipients();
      save(updateList(list.id, { confirm_enabled: on }));
    });
  checkRecipients();

  return el('div', { class: 'settings-confirm' }, el('h3', {}, 'Bekreftelse'), main, options);
}

function scrollToPage(page) {
  stepsEl.children[page]?.scrollIntoView({ behavior: 'smooth' });
}

// Telleren viser steget; på innstillingssiden står den tom.
function updateCounter() {
  const total = list.steps.length;
  $('counter').textContent = current >= 1 && current <= total ? `${current} av ${total}` : '';
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
// Skrivemodus (se rediger.css): mens et tekstfelt i et steg har fokus, krymper
// siden til høyden over tastaturet, og teksten får plassen.
// ---------------------------------------------------------------------------

function setupWritingMode() {
  const viewport = window.visualViewport;
  const writing = () => document.body.classList.contains('writing');

  const sync = () => {
    document.documentElement.style.setProperty('--vvh', `${viewport?.height ?? innerHeight}px`);
    if (!writing()) return;
    // iPhone skyver siden opp for å vise feltet. Siden passer nå over
    // tastaturet, så den legges tilbake, og steget holdes på plass.
    window.scrollTo(0, 0);
    stepsEl.scrollTop = current * stepsEl.clientHeight;
  };
  viewport?.addEventListener('resize', sync);
  viewport?.addEventListener('scroll', sync);
  sync();

  const isStepField = (node) => node?.closest?.('.step .field');
  // Bare med berøringsskjerm, der tastaturet dekker siden. På PC står
  // feltene synlige, og redigeres der de står.
  const touch = window.matchMedia('(pointer: coarse)');

  stepsEl.addEventListener('focusin', (event) => {
    if (!touch.matches || !isStepField(event.target)) return;
    document.body.classList.add('writing');
    requestAnimationFrame(sync);
  });

  // Fokus kan flytte fra tittel til beskrivelse; modusen slutter først når
  // ingen av feltene har det.
  stepsEl.addEventListener('focusout', () => {
    setTimeout(() => {
      if (isStepField(document.activeElement)) return;
      document.body.classList.remove('writing');
      requestAnimationFrame(() => {
        sync();
        stepsEl.scrollTop = current * stepsEl.clientHeight;
      });
    }, 50);
  });

  $('write-done').addEventListener('click', () => document.activeElement?.blur());
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
  renderAll(pageOf(list.steps.length - 1));
  // Arbeidsflyten er tittel, beskrivelse, bilde – så tittelen får fokus.
  stepsEl.children[pageOf(list.steps.length - 1)].querySelector('.step-title')?.focus({ preventScroll: true });
}

function moveStep(index, direction) {
  const target = index + direction;
  const [step] = list.steps.splice(index, 1);
  list.steps.splice(target, 0, step);
  renderAll(pageOf(target));
  save(saveOrder('steps', list.steps.map((s) => s.id)));
}

function removeStep(index) {
  const step = list.steps[index];
  const count = step.images.length;
  const name = step.title.trim() ? `«${step.title.trim()}»` : `steg ${index + 1}`;
  const withImages = count ? ` og ${count === 1 ? 'bildet' : `de ${count} bildene`}` : '';
  if (!confirm(`Slette ${name}${withImages}?`)) return;

  list.steps.splice(index, 1);
  // Steget som tar plassen vises, eller det forrige; uten steg, innstillingene.
  renderAll(list.steps.length ? pageOf(Math.min(index, list.steps.length - 1)) : 0);
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
  if (!canEdit(list)) return showMessage('Du har ikke tilgang til å redigere denne listen.');

  candidates = await getConfirmCandidates(list.id).catch(() => []);
  document.title = `Rediger ${list.title} – Husk Klommestein`;
  $('list-title').textContent = list.title;
  $('back').href = `/perm/?id=${list.group.id}`;
  $('back').setAttribute('aria-label', `Tilbake til ${list.group.name}`);
  $('done').href = `/liste/?id=${list.id}`;
  leaveVia($('back'));
  leaveVia($('done'));

  $('message').hidden = true;
  stepsEl.hidden = false;
  // Redigeringen starter på innstillingene øverst. En nyopprettet liste
  // starter på steg 1 med markøren i tittelen.
  const isNew = new URLSearchParams(location.search).has('ny') && list.steps.length > 0;
  renderAll(isNew ? pageOf(0) : 0);
  trackCurrentSection();
  setupWritingMode();
  if (isNew) stepsEl.children[pageOf(0)].querySelector('.step-title')?.focus({ preventScroll: true });
}

main();
