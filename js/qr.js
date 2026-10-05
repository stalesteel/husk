// QR-merke for en perm (?perm=id) eller en liste (?liste=id), i et av
// designene fra plakatene. Klart til å skrives ut (7 × 9 cm) eller lastes ned
// som bilde.

import { getGroup, getList, imageUrl } from './data.js';
import { designPicker } from './designvelger.js';
import { DESIGNS, drawSticker, loadFonts } from './plakat-motor.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DESIGN_KEY = 'husk-qr-design';

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
  $('content').hidden = true;
}

const store = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* privat modus */ } },
};

function loadImage(path) {
  if (!path) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = imageUrl(path);
  });
}

// Merket i 300 dpi (7 × 9 cm).
function stickerCanvas(design, data, item, caption) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((70 / 25.4) * 300);
  canvas.height = Math.round((90 / 25.4) * 300);
  drawSticker(canvas, design, data, item, caption);
  return canvas;
}

async function main() {
  const permId = params.get('perm');
  const listId = params.get('liste');

  let item, caption, back, perm;
  try {
    if (permId) {
      perm = await getGroup(permId);
      if (!perm) return showMessage('Fant ikke denne permen.');
      item = { title: perm.name, url: `${location.origin}/perm/?id=${perm.id}` };
      caption = 'Skann for sjekklistene';
      back = `/rediger/perm/?id=${perm.id}`;
    } else {
      const list = await getList(listId);
      if (!list) return showMessage('Fant ikke denne listen.');
      perm = await getGroup(list.group.id);
      item = { title: list.title, url: `${location.origin}/liste/?id=${list.id}` };
      caption = 'Skann for sjekklisten';
      back = `/rediger/perm/?id=${list.group.id}`;
    }
  } catch {
    return showMessage('Kunne ikke laste. Sjekk nettet og prøv igjen.');
  }

  document.title = `QR-kode: ${item.title} – Husk Klommestein`;
  $('back').href = back;
  $('url').textContent = item.url;

  // Bildet av permen brukes av designene med bilde som bakgrunn.
  const [image] = await Promise.all([loadImage(perm?.image_path), loadFonts()]);
  const data = { image };

  // Innholdet vises før designvelgeren lages, så den har en bredde å tegne i.
  $('message').hidden = true;
  $('content').hidden = false;

  const saved = DESIGNS.findIndex((d) => d.id === store.get(DESIGN_KEY));
  const minimal = DESIGNS.findIndex((d) => d.id === 'minimal');
  const picker = designPicker($('picker'), DESIGNS, {
    aspect: 90 / 70,
    start: saved >= 0 ? saved : minimal,
    render: (canvas, design) => drawSticker(canvas, design, data, item, caption),
    onChange: (i) => { store.set(DESIGN_KEY, DESIGNS[i].id); showName(i); },
  });

  function showName(i) {
    $('design-name').textContent = DESIGNS[i].name;
    $('design-count').textContent = `${i + 1} av ${DESIGNS.length}`;
  }

  $('print').addEventListener('click', () => {
    const canvas = stickerCanvas(DESIGNS[picker.index], data, item, caption);
    $('print-img').onload = () => window.print();
    $('print-img').src = canvas.toDataURL('image/png');
  });

  $('download').addEventListener('click', () => {
    const canvas = stickerCanvas(DESIGNS[picker.index], data, item, caption);
    canvas.toBlob((blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `QR – ${item.title}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    }, 'image/png');
  });

  showName(picker.index);
}

main();
