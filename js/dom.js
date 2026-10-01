// Lager et element. Tekst settes alltid som tekst, aldri som HTML.
//   el('a', { class: 'button', href: '/' }, 'Tilbake')
//   el('button', { onclick: () => … }, 'Kryss av')
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((child) => child != null && child !== false));
  return node;
}

// Haken som brukes som ikon og logo. SVG kan ikke lages med el(), så den
// settes inn som fast markup (ingen tekst fra brukere).
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

export function checkIcon(className = 'card-icon') {
  const span = el('span', { class: className, 'aria-hidden': 'true' });
  span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75"'
    + ' stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  return span;
}

// Gjør lenker i vanlig tekst klikkbare, og åpner dem i en ny fane. Gir en
// liste med tekst og lenker til append(); teksten settes aldri som HTML.
// Tar med http(s)://… og www.…, men ikke tegnsetting rett etter lenken.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

export function linkify(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:!?)»”'"]+$/, '');
    parts.push(text.slice(last, match.index));
    const href = url.startsWith('www.') ? `https://${url}` : url;
    parts.push(el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, url));
    last = match.index + url.length;
  }
  parts.push(text.slice(last));
  return parts.filter(Boolean);
}
