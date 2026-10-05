// Designvelger: alle designene på rad, og man sveiper mellom dem. Brukes av
// plakatsiden og QR-siden. Bare designet i midten og de to på hver side
// tegnes, resten etter hvert som man sveiper, og de tegnes på nytt når
// valgene endres (invalidate).
//
//   const picker = designPicker(container, DESIGNS, {
//     aspect: 297 / 210,                 // høyde / bredde
//     render: (canvas, design) => …,     // tegner ett design
//     onChange: (index) => …,            // designet i midten er byttet
//     start: 3,
//   });

import { el } from './dom.js';

export function designPicker(container, designs, { aspect, render, onChange, start = 0 }) {
  const slides = designs.map((design, i) => {
    const canvas = el('canvas', { class: 'dp-canvas', 'aria-label': design.name });
    const slide = el('div', { class: 'dp-slide', 'data-index': i }, canvas);
    slide.style.setProperty('--aspect', aspect);
    return { slide, canvas, design, drawn: false };
  });
  const track = el('div', { class: 'dp-track' }, slides.map((s) => s.slide));
  const prev = el('button', { class: 'dp-nav prev', type: 'button', 'aria-label': 'Forrige design', onclick: () => go(current - 1) }, '‹');
  const next = el('button', { class: 'dp-nav next', type: 'button', 'aria-label': 'Neste design', onclick: () => go(current + 1) }, '›');
  container.replaceChildren(el('div', { class: 'dp' }, track, prev, next));

  let current = Math.min(Math.max(start, 0), designs.length - 1);

  // Tegner et lerret i skjermens oppløsning.
  function draw(s) {
    const w = s.slide.clientWidth;
    if (!w) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
    s.canvas.width = Math.round(w * ratio);
    s.canvas.height = Math.round(w * aspect * ratio);
    render(s.canvas, s.design);
    s.drawn = true;
  }

  // Tegner designene rundt det valgte som ikke er tegnet ennå.
  function ensure() {
    for (let i = Math.max(0, current - 2); i <= Math.min(slides.length - 1, current + 2); i++) {
      if (!slides[i].drawn) draw(slides[i]);
    }
  }

  // Designet i midten av raden er det valgte.
  function centered() {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0, dist = Infinity;
    slides.forEach((s, i) => {
      const c = s.slide.offsetLeft + s.slide.offsetWidth / 2;
      if (Math.abs(c - mid) < dist) { dist = Math.abs(c - mid); best = i; }
    });
    return best;
  }

  function updateNav() {
    prev.hidden = current === 0;
    next.hidden = current === designs.length - 1;
    slides.forEach((s, i) => s.slide.classList.toggle('active', i === current));
  }

  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const i = centered();
      if (i !== current) { current = i; updateNav(); ensure(); onChange?.(current); }
    });
  }, { passive: true });

  function go(i, behavior = 'smooth') {
    i = Math.min(Math.max(i, 0), designs.length - 1);
    const s = slides[i].slide;
    track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2, behavior });
  }

  // Et klikk på et design ved siden av sentrerer det.
  track.addEventListener('click', (event) => {
    const slide = event.target.closest('.dp-slide');
    if (slide && Number(slide.dataset.index) !== current) go(Number(slide.dataset.index));
  });

  // Piltastene blar (når man ikke skriver i et felt).
  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, select')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(current - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); go(current + 1); }
  });

  // Ny bredde (f.eks. snudd telefon): tegn de synlige på nytt.
  let width = track.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(track.clientWidth - width) < 2) return;
    width = track.clientWidth;
    invalidate();
    go(current, 'auto');
  }).observe(track);

  function invalidate() {
    slides.forEach((s) => { s.drawn = false; });
    ensure();
  }

  updateNav();
  requestAnimationFrame(() => { go(current, 'auto'); ensure(); });
  return { invalidate, get index() { return current; }, go };
}
