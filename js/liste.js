import { getList, imageUrl } from './data.js';
import { canEdit } from './admin.js';
import { confirmForm } from './bekreftelse.js';
import { imageArrows } from './bildepiler.js';
import { el } from './dom.js';

const $ = (id) => document.getElementById(id);
const stepsEl = $('steps');

let list;
// Per steg: avkrysset, hvilke bilder som er sett, og elementene som oppdateres.
const steps = [];
let summaryEl;
// Skjemaet for bekreftelse på e-post, når det er slått på for listen.
let confirmation = null;

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
  stepsEl.hidden = true;
}

function stepTitle(step) {
  return step.title || 'Uten tittel';
}

// ---------------------------------------------------------------------------
// Ett steg
// ---------------------------------------------------------------------------

function renderStep(step, index) {
  const state = { checked: false, seen: new Set(), images: step.images, current: 0 };
  steps.push(state);

  const slides = el('div', { class: 'slides' }, step.images.map((image, i) => {
    const img = el('img', {
      src: imageUrl(image.path),
      alt: image.label ?? '',
      loading: index < 2 ? 'eager' : 'lazy',
      decoding: 'async',
    });
    const slide = el('div', { class: 'slide' }, img);
    img.addEventListener('error', () => slide.classList.add('broken'));
    return slide;
  }));

  state.dots = step.images.length > 1
    ? step.images.map((_, i) => el('button', {
        class: 'dot',
        type: 'button',
        'aria-label': `Bilde ${i + 1} av ${step.images.length}`,
        onclick: () => slides.scrollTo({ left: i * slides.clientWidth, behavior: 'smooth' }),
      }))
    : [];

  state.slides = slides;
  state.label = el('p', { class: 'image-label' });
  state.button = el('button', { class: 'check', type: 'button', onclick: () => toggle(index) });

  // Hvilket bilde som vises, regnes ut fra rulleposisjonen.
  slides.addEventListener('scroll', () => {
    const i = Math.round(slides.scrollLeft / slides.clientWidth);
    if (i !== state.current) setCurrentImage(index, i);
  }, { passive: true });

  const section = el('section', { class: 'step', 'aria-label': `Steg ${index + 1}: ${stepTitle(step)}` },
    el('div', { class: 'media' },
      slides,
      state.dots.length ? el('div', { class: 'dots' }, state.dots) : null,
      ...imageArrows(slides, step.images.length),
      state.label),
    el('div', { class: 'text' },
      el('h2', { class: 'step-title' }, stepTitle(step)),
      step.description ? el('p', { class: 'description' }, step.description) : null),
    el('div', { class: 'actions' }, state.button));

  setCurrentImage(index, 0, { markSeen: false });
  return section;
}

function setCurrentImage(index, i, { markSeen = true } = {}) {
  const state = steps[index];
  state.current = i;
  if (markSeen && state.images.length) state.seen.add(i);
  state.dots.forEach((dot, d) => dot.classList.toggle('active', d === i));
  // Etiketten hører til bildet, og brukes bare når steget har flere bilder.
  const label = state.images[i]?.label ?? '';
  state.label.textContent = label;
  state.label.hidden = !label;
  updateButton(index);
}

function updateButton(index) {
  const state = steps[index];
  const total = state.images.length;
  // Med ett bilde er det ingenting å sveipe gjennom, så kravet gjelder bare flere.
  const mustSee = list.require_all_images_seen && total > 1 && state.seen.size < total && !state.checked;

  state.button.disabled = mustSee;
  state.button.classList.toggle('done', state.checked);
  state.button.setAttribute('aria-pressed', String(state.checked));
  state.button.textContent = state.checked
    ? '✓ Utført'
    : mustSee
      ? `Sveip gjennom alle bildene først — ${state.seen.size} av ${total}`
      : 'Kryss av';
}

function toggle(index) {
  const state = steps[index];
  state.checked = !state.checked;
  updateButton(index);
  updateSummary();
  // Etter avkryssing går vi videre til neste steg, eller til oppsummeringen.
  if (state.checked) setTimeout(() => scrollToSection(index + 1), 350);
}

function scrollToSection(index) {
  stepsEl.children[index]?.scrollIntoView({ behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// Oppsummering
// ---------------------------------------------------------------------------

function updateSummary() {
  const total = list.steps.length;
  const remaining = list.steps
    .map((step, index) => ({ step, index }))
    .filter(({ index }) => !steps[index].checked);

  const back = el('a', { class: 'check secondary', href: `/perm/?id=${list.group.id}` },
    `Tilbake til ${list.group.name}`);
  confirmation?.update(remaining.length);
  const confirmBox = confirmation ? confirmation.box : null;

  if (total === 0) {
    summaryEl.replaceChildren(el('h2', {}, 'Tom liste'), el('p', {}, 'Listen har ingen punkter ennå.'), back);
  } else if (remaining.length === 0) {
    summaryEl.replaceChildren(
      el('h2', {}, 'Alt klart!'),
      el('p', {}, total === 1 ? 'Punktet er krysset av.' : `Alle ${total} punktene er krysset av.`),
      confirmBox,
      back);
  } else {
    summaryEl.replaceChildren(
      el('h2', {}, 'Dette gjenstår'),
      el('p', {}, `${remaining.length} av ${total} punkter er ikke krysset av.`),
      ...remaining.map(({ step, index }) => el('button', {
        class: 'check remaining',
        type: 'button',
        onclick: () => scrollToSection(index),
      }, `${index + 1}. ${stepTitle(step)}`)),
      confirmBox,
      back);
  }
}

// ---------------------------------------------------------------------------
// Teller, bilder sett og skjermlås
// ---------------------------------------------------------------------------

// Hvilket steg som vises, regnes ut fra rulleposisjonen, som for bildene.
function trackCurrentSection() {
  const total = list.steps.length;
  let shown = -1;
  const update = () => {
    const index = Math.round(stepsEl.scrollTop / stepsEl.clientHeight);
    if (index === shown) return;
    shown = index;
    $('counter').textContent = index < total ? `${index + 1} av ${total}` : 'Oppsummering';
    // Bildet som vises når steget kommer til syne, telles som sett.
    if (index < total) setCurrentImage(index, steps[index].current);
  };
  stepsEl.addEventListener('scroll', update, { passive: true });
  update();

  // Skjemaet for bekreftelse: når tastaturet åpnes og lukkes, ruller iPhone
  // selv for å vise feltet, og etterpå snapper rullingen til et steg midt i
  // listen. Mens noen skriver i oppsummeringen, og et øyeblikk etter, er
  // snappingen derfor av og listen låst på oppsummeringen: ruller noe den bort,
  // legges den straks tilbake.
  let lockTop = null;
  let release = null;
  const summaryTop = () => summaryEl.offsetTop - stepsEl.offsetTop;
  const holdSummary = () => {
    if (lockTop === null) return;
    lockTop = summaryTop();
    if (Math.abs(stepsEl.scrollTop - lockTop) > 1) stepsEl.scrollTop = lockTop;
  };
  const isField = (node) => node?.matches?.('input, textarea') && node.closest('.summary');
  stepsEl.addEventListener('focusin', (event) => {
    if (!isField(event.target)) return;
    clearTimeout(release);
    lockTop = summaryTop();
    stepsEl.style.scrollSnapType = 'none';
  });
  stepsEl.addEventListener('focusout', () => {
    setTimeout(() => {
      if (isField(document.activeElement)) return;
      holdSummary();
      // Tastaturet lukkes over litt tid; hold låsen til det er ferdig.
      clearTimeout(release);
      release = setTimeout(() => {
        holdSummary();
        lockTop = null;
        stepsEl.style.scrollSnapType = '';
      }, 1000);
    }, 50);
  });
  // Et trykk på et steg som gjenstår (eller tilbake), slipper låsen med en gang.
  stepsEl.addEventListener('click', (event) => {
    if (lockTop === null || !event.target.closest('.summary .check:not(.confirm-send)')) return;
    clearTimeout(release);
    lockTop = null;
    stepsEl.style.scrollSnapType = '';
  }, true);
  stepsEl.addEventListener('scroll', holdSummary, { passive: true });
  window.visualViewport?.addEventListener('resize', holdSummary);
  window.addEventListener('resize', holdSummary);

  // Piltastene til venstre og høyre blar mellom bildene i steget som vises.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const slides = steps[shown]?.slides;
    if (!slides || steps[shown].images.length < 2) return;
    event.preventDefault();
    slides.scrollBy({ left: (event.key === 'ArrowLeft' ? -1 : 1) * slides.clientWidth, behavior: 'smooth' });
  });
}

// Skjermen holdes våken mens listen er åpen, der nettleseren støtter det.
// Noen nettlesere (bl.a. Safari) godtar forespørselen bare rett etter en
// berøring, så den prøves på nytt ved hver berøring til den lykkes. Låsen
// slippes når siden skjules, og hentes igjen når den vises.
function keepAwake() {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const request = async () => {
    if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
    try { lock = await navigator.wakeLock.request('screen'); } catch { /* ikke tillatt nå */ }
  };
  request();
  document.addEventListener('visibilitychange', request);
  document.addEventListener('pointerup', request, { passive: true });
  document.addEventListener('click', request);
}

// ---------------------------------------------------------------------------

try {
  list = await getList(new URLSearchParams(location.search).get('id'));
} catch {
  showMessage('Kunne ikke laste listen. Sjekk nettet og prøv igjen.');
}

if (list === null) showMessage('Fant ikke denne listen. Sjekk at lenken er riktig.');

if (list) {
  document.title = `${list.title} – Husk Klommestein`;
  $('list-title').textContent = list.title;
  $('back').href = `/perm/?id=${list.group.id}`;
  $('back').setAttribute('aria-label', `Tilbake til ${list.group.name}`);
  if (canEdit(list)) {
    $('edit').href = `/rediger/?id=${list.id}`;
    $('edit').hidden = false;
  }

  stepsEl.append(...list.steps.map(renderStep));
  summaryEl = el('section', { class: 'summary', 'aria-label': 'Oppsummering' });
  if (list.confirm?.enabled && list.steps.length) {
    confirmation = confirmForm(list, () => list.steps.filter((_, i) => steps[i].checked).map((step) => step.id));
  }
  stepsEl.append(summaryEl);
  updateSummary();

  $('message').hidden = true;
  stepsEl.hidden = false;
  trackCurrentSection();
  keepAwake();
}
