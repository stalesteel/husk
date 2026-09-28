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
