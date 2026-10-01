// Egen fil, ikke i dom.js: en nettleser som har en eldre dom.js i
// hurtigminnet, ville ellers ikke funnet funksjonen, og hele siden stoppet.

import { el } from './dom.js';

// Piler for å bla mellom bildene i et steg med mus (PC). På mobil sveiper man,
// og pilene vises ikke (se .nav i liste.css). Skjules i hver ende.
export function imageArrows(slides, count) {
  if (count < 2) return [];
  const go = (direction) => slides.scrollBy({ left: direction * slides.clientWidth, behavior: 'smooth' });
  const prev = el('button', { class: 'nav prev', type: 'button', 'aria-label': 'Forrige bilde', onclick: () => go(-1) }, '‹');
  const next = el('button', { class: 'nav next', type: 'button', 'aria-label': 'Neste bilde', onclick: () => go(1) }, '›');
  const update = () => {
    const i = Math.round(slides.scrollLeft / (slides.clientWidth || 1));
    prev.hidden = i <= 0;
    next.hidden = i >= count - 1;
  };
  slides.addEventListener('scroll', update, { passive: true });
  requestAnimationFrame(update);
  return [prev, next];
}
