// Avkrysningsliste: alle punktene på én skjerm, med en hake til høyre på
// hver linje. Alternativ til «ett punkt om gangen» (liste.js) for lister man
// vil løpe raskt gjennom. Beskrivelsen vises avkortet under tittelen; et trykk
// på linjen viser hele teksten og bildene. Har linjen ingenting mer å vise,
// krysser et trykk av i stedet.
//
// Egen fil, så en nettleser med eldre filer i hurtigminnet ikke stopper siden.

import { imageUrl } from './data.js';
import { el } from './dom.js';

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"'
  + ' stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// checked: Set med id-ene til punktene som er krysset av (felles med den andre
// visningen). onChange kalles når en hake endres. tail: elementer nederst
// (bekreftelse og «Tilbake til …»), som flyttes hit.
export function renderChecklist(container, list, { checked, onChange, tail }) {
  const rows = list.steps.map((step, index) => {
    const title = step.title || 'Uten tittel';
    const more = Boolean(step.description) || step.images.length > 0;

    const check = el('button', { class: 'cl-check', type: 'button' });
    check.innerHTML = CHECK_SVG;
    const row = el('div', { class: 'cl-row' });

    const thumb = step.images.length
      ? el('span', { class: 'cl-thumb', 'aria-hidden': 'true' },
          el('img', { src: imageUrl(step.images[0].path), alt: '', loading: index < 12 ? 'eager' : 'lazy' }))
      : null;
    const body = el('button', { class: 'cl-body', type: 'button', 'aria-expanded': more ? 'false' : null },
      thumb,
      el('span', { class: 'cl-text' },
        el('span', { class: 'cl-title' }, `${index + 1}. ${title}`),
        step.description ? el('span', { class: 'cl-desc' }, step.description) : null),
      more ? el('span', { class: 'cl-chevron', 'aria-hidden': 'true' }, '›') : null);

    // Mer: hele beskrivelsen og bildene, med etiketten under hvert bilde.
    const details = more
      ? el('div', { class: 'cl-more', hidden: true },
          step.description ? el('p', { class: 'cl-more-text' }, step.description) : null,
          step.images.length
            ? el('div', { class: 'cl-images' }, step.images.map((image) => el('figure', {},
                el('img', { src: imageUrl(image.path), alt: image.label ?? '', loading: 'lazy' }),
                image.label ? el('figcaption', {}, image.label) : null)))
            : null)
      : null;

    const paint = () => {
      const on = checked.has(step.id);
      row.classList.toggle('done', on);
      check.setAttribute('aria-pressed', String(on));
      check.setAttribute('aria-label', `${on ? 'Fjern haken på' : 'Kryss av'} «${title}»`);
    };
    const toggle = () => {
      if (checked.has(step.id)) checked.delete(step.id); else checked.add(step.id);
      paint();
      onChange();
    };
    check.addEventListener('click', toggle);
    body.addEventListener('click', () => {
      if (!more) return toggle();
      details.hidden = !details.hidden;
      body.setAttribute('aria-expanded', String(!details.hidden));
      row.classList.toggle('open', !details.hidden);
    });
    paint();
    row.append(body, check);
    if (details) row.append(details);
    return row;
  });

  const status = el('p', { class: 'cl-status' });
  const update = () => {
    const done = list.steps.filter((step) => checked.has(step.id)).length;
    const total = list.steps.length;
    status.textContent = !total ? 'Listen har ingen punkter ennå.'
      : done === total ? `✓ Alt klart! Alle ${total} punktene er krysset av.`
        : `${total - done} av ${total} punkter gjenstår.`;
    status.classList.toggle('ok', total > 0 && done === total);
  };
  update();

  container.replaceChildren(
    el('div', { class: 'cl-list' }, rows),
    el('section', { class: 'cl-end', 'aria-label': 'Oppsummering' }, status, ...tail.filter(Boolean)));
  return { update };
}
