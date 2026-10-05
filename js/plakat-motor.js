// Plakatmotor: tegner en plakat for en perm, eller et QR-merke for en liste,
// på et canvas. Samme kode brukes til forhåndsvisning og til PDF, så det man
// ser er det man får. Alle mål er i millimeter på et A4-ark (210 × 297);
// canvaset skaleres. A5 og A6 er det samme arket skrevet ut mindre, men med
// QR-kodene holdt store nok til å skannes (se drawPoster).

import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';

// ---------------------------------------------------------------------------
// Skrifter (Google Fonts). Lastes én gang før tegning.
// ---------------------------------------------------------------------------
export const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800&family=Inter:wght@400;600;700;800&family=Lora:wght@400;600;700&family=Roboto+Slab:wght@400;700&family=Playfair+Display:wght@400;700&family=Bebas+Neue&family=Oswald:wght@400;600&family=Caveat:wght@700&display=swap';

export async function loadFonts() {
  if (!document.querySelector('link[data-plakat-fonts]')) {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONT_CSS });
    link.dataset.plakatFonts = '';
    document.head.append(link);
    await new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; });
  }
  const faces = ['800 10px Nunito', '400 10px Nunito', '800 10px Inter', '700 10px Inter', '600 10px Inter', '400 10px Inter', '400 10px Lora', '700 10px Lora',
    '700 10px "Roboto Slab"', '400 10px "Roboto Slab"', '400 10px "Playfair Display"', '700 10px "Playfair Display"',
    '400 10px "Bebas Neue"', '600 10px Oswald', '400 10px Oswald', '700 10px Caveat'];
  await Promise.all(faces.map((f) => document.fonts.load(f, 'ÆØÅæøå Hyttepermen').catch(() => {})));
}

// ---------------------------------------------------------------------------
// Designene. kind: 'paper' (hvitt papir), 'fill' (hele arket i farge),
// 'photo' (bildet som bakgrunn).
// ---------------------------------------------------------------------------
const F = {
  nunito: { title: '800 {s} Nunito', body: '400 {s} Nunito', bold: '800 {s} Nunito' },
  inter: { title: '800 {s} Inter', body: '400 {s} Inter', bold: '700 {s} Inter' },
  lora: { title: '700 {s} Lora', body: '400 {s} Lora', bold: '700 {s} Lora' },
  slab: { title: '700 {s} "Roboto Slab"', body: '400 {s} "Roboto Slab"', bold: '700 {s} "Roboto Slab"' },
  playfair: { title: '400 {s} "Playfair Display"', body: '400 {s} Lora', bold: '700 {s} Lora' },
  bebas: { title: '400 {s} "Bebas Neue"', body: '400 {s} Inter', bold: '700 {s} Inter', upper: true, titleScale: 1.25 },
  oswald: { title: '600 {s} Oswald', body: '400 {s} Inter', bold: '600 {s} Oswald', upper: true },
  caveat: { title: '700 {s} Caveat', body: '400 {s} Lora', bold: '700 {s} Lora', titleScale: 1.3 },
};

export const DESIGNS = [
  // Hvitt papir
  { id: 'gronn', name: 'Klassisk grønn', group: 'Hvitt papir', kind: 'paper', header: 'band', font: F.nunito,
    main: '#1f6f4a', soft: '#d8efe2', text: '#1c1c1c', muted: '#5c6b63', qr: '#1f6f4a', round: true },
  { id: 'minimal', name: 'Minimal', group: 'Hvitt papir', kind: 'paper', header: 'rule', font: F.inter,
    main: '#111111', soft: '#f1f1ef', text: '#111111', muted: '#666666', qr: '#111111', round: false },
  { id: 'hytte', name: 'Hytte', group: 'Hvitt papir', kind: 'paper', header: 'plank', font: F.lora,
    main: '#9c3b2a', soft: '#f6ece0', text: '#3b2a20', muted: '#7a6352', qr: '#5a2418', round: true },
  { id: 'maritim', name: 'Maritim', group: 'Hvitt papir', kind: 'paper', header: 'stripes', font: F.slab,
    main: '#1f3a5f', soft: '#e6edf5', text: '#14243b', muted: '#56677e', qr: '#1f3a5f', round: false },
  { id: 'elegant', name: 'Elegant', group: 'Hvitt papir', kind: 'paper', header: 'frame', font: F.playfair, center: true,
    main: '#4d5d57', soft: '#eef1ee', text: '#2b3330', muted: '#6f7a75', qr: '#2f3a36', round: true },
  { id: 'signal', name: 'Signal', group: 'Hvitt papir', kind: 'paper', header: 'hazard', font: F.bebas,
    main: '#111111', soft: '#ffd400', text: '#111111', muted: '#444444', qr: '#111111', round: false },
  // Hele arket i farge
  { id: 'salvie', name: 'Salvie', group: 'Fylt farge', kind: 'fill', font: F.nunito,
    bg: '#e2efe5', main: '#1f6f4a', soft: '#ffffff', text: '#1c2b22', muted: '#4f6b5a', qr: '#1f6f4a', round: true },
  { id: 'sand', name: 'Sand', group: 'Fylt farge', kind: 'fill', font: F.caveat,
    bg: '#f2e6d2', main: '#8a4b2a', soft: '#fffaf2', text: '#3b2a20', muted: '#7a6352', qr: '#5a2a14', round: true },
  { id: 'himmel', name: 'Himmel', group: 'Fylt farge', kind: 'fill', font: F.slab,
    bg: '#dfeaf6', main: '#1f3a5f', soft: '#ffffff', text: '#14243b', muted: '#4c6080', qr: '#1f3a5f', round: false },
  { id: 'lavendel', name: 'Lavendel', group: 'Fylt farge', kind: 'fill', font: F.playfair, center: true,
    bg: '#ebe5f4', main: '#4b3a6b', soft: '#ffffff', text: '#2c2340', muted: '#6a5e80', qr: '#3a2c55', round: true },
  { id: 'solgul', name: 'Solgul', group: 'Fylt farge', kind: 'fill', font: F.bebas,
    bg: '#ffd400', main: '#111111', soft: '#ffffff', text: '#111111', muted: '#3a3200', qr: '#111111', round: false },
  { id: 'skog', name: 'Skog', group: 'Fylt farge', kind: 'fill', font: F.nunito, dark: true,
    bg: '#1f4d38', main: '#ffffff', soft: '#ffffff', text: '#ffffff', muted: '#cfe3d7', qr: '#1f4d38', round: true },
  // Bildet som bakgrunn
  { id: 'fjord', name: 'Bilde øverst', group: 'Bilde som bakgrunn', kind: 'photo', font: F.nunito,
    filter: 'none', fade: 'bottom', bg: '#ffffff', main: '#1f6f4a', soft: '#eef5f0', text: '#1c1c1c', muted: '#5c6b63', qr: '#1f6f4a', round: true },
  { id: 'sepia', name: 'Sepia', group: 'Bilde som bakgrunn', kind: 'photo', font: F.lora,
    filter: 'sepia', fade: 'bottom', bg: '#f4ead8', main: '#6b4a2b', soft: '#fffaf0', text: '#3b2a1a', muted: '#7a6448', qr: '#4a3018', round: true },
  { id: 'svarthvitt', name: 'Sort-hvitt fra siden', group: 'Bilde som bakgrunn', kind: 'photo', font: F.inter,
    filter: 'gray', fade: 'left', bg: '#ffffff', main: '#111111', soft: '#f1f1ef', text: '#111111', muted: '#555555', qr: '#111111', round: false },
  { id: 'blatone', name: 'Blåtone', group: 'Bilde som bakgrunn', kind: 'photo', font: F.oswald, dark: true,
    filter: 'blue', fade: 'full', bg: '#13294a', main: '#ffffff', soft: '#ffffff', text: '#ffffff', muted: '#d7e3f4', qr: '#13294a', round: false },
  { id: 'gronnflate', name: 'Bilde mot grønt', group: 'Bilde som bakgrunn', kind: 'photo', font: F.nunito, dark: true,
    filter: 'none', fade: 'bottom', bg: '#1f6f4a', main: '#ffffff', soft: '#ffffff', text: '#ffffff', muted: '#d8efe2', qr: '#1f6f4a', round: true },
  { id: 'nederst', name: 'Bilde nederst', group: 'Bilde som bakgrunn', kind: 'photo', font: F.playfair, center: true,
    filter: 'none', fade: 'top', bg: '#ffffff', main: '#2f3a36', soft: '#f3f4f2', text: '#2b3330', muted: '#6f7a75', qr: '#2f3a36', round: true },
  // Bildet som bakgrunn, flere komposisjoner
  { id: 'sepia-venstre', name: 'Sepia fra venstre', group: 'Bilde som bakgrunn', kind: 'photo', font: F.lora,
    filter: 'sepia', fade: 'right', bg: '#f4ead8', main: '#6b4a2b', soft: '#fffaf0', text: '#3b2a1a', muted: '#7a6448', qr: '#4a3018', round: true },
  { id: 'gra-topp', name: 'Grå topp', group: 'Bilde som bakgrunn', kind: 'photo', font: F.playfair, center: true,
    filter: 'gray', fade: 'bottom', bg: '#ffffff', main: '#333333', soft: '#f2f2f0', text: '#222222', muted: '#666666', qr: '#222222', round: true },
  { id: 'blabunn', name: 'Blå bunn', group: 'Bilde som bakgrunn', kind: 'photo', font: F.oswald, dark: true,
    filter: 'blue', fade: 'top', bg: '#13294a', main: '#ffffff', soft: '#ffffff', text: '#ffffff', muted: '#c9d8ee', qr: '#13294a', round: false },
  { id: 'kveld', name: 'Kveld', group: 'Bilde som bakgrunn', kind: 'photo', font: F.inter, dark: true,
    filter: 'gray', fade: 'full', bg: '#111111', main: '#ffffff', soft: '#ffffff', text: '#ffffff', muted: '#cccccc', qr: '#111111', round: false },
  { id: 'panel', name: 'Panel', group: 'Bilde som bakgrunn', kind: 'photo', font: F.nunito,
    filter: 'none', fade: 'panel-bottom', bg: '#fffaf2', main: '#1f6f4a', soft: '#eef5f0', text: '#1c1c1c', muted: '#5c6b63', qr: '#1f6f4a', round: true },
  { id: 'passepartout', name: 'Passepartout', group: 'Bilde som bakgrunn', kind: 'photo', font: F.playfair, center: true,
    filter: 'sepia', fade: 'panel-center', bg: '#fbf8f2', main: '#6b4a2b', soft: '#f3ece0', text: '#3b2a1a', muted: '#7a6448', qr: '#4a3018', round: true },
  { id: 'gronntone', name: 'Grønntone', group: 'Bilde som bakgrunn', kind: 'photo', font: F.nunito, dark: true,
    filter: 'green', fade: 'full', bg: '#0f3d2a', main: '#ffffff', soft: '#ffffff', text: '#ffffff', muted: '#cfe3d7', qr: '#0f3d2a', round: true },
  { id: 'sepia-mork', name: 'Mørk sepia', group: 'Bilde som bakgrunn', kind: 'photo', font: F.lora, dark: true,
    filter: 'sepia', fade: 'full', bg: '#3b2a1a', main: '#f6e7cf', soft: '#fffaf0', text: '#fff6e6', muted: '#e6d3b5', qr: '#3b2a1a', round: true },
  { id: 'tittel-pa-bildet', name: 'Tittel på bildet', group: 'Bilde som bakgrunn', kind: 'photo', font: F.bebas,
    filter: 'none', fade: 'split-top', bg: '#ffffff', main: '#111111', soft: '#f1f1ef', text: '#111111', muted: '#555555', qr: '#111111', round: false },
  { id: 'lys', name: 'Lys tåke', group: 'Bilde som bakgrunn', kind: 'photo', font: F.inter,
    filter: 'none', fade: 'wash', bg: '#ffffff', main: '#1f3a5f', soft: '#ffffff', text: '#14243b', muted: '#3f5270', qr: '#1f3a5f', round: false },
  { id: 'band', name: 'Bånd', group: 'Bilde som bakgrunn', kind: 'photo', font: F.caveat,
    filter: 'none', fade: 'band', bg: '#f2e6d2', main: '#8a4b2a', soft: '#fffaf2', text: '#3b2a20', muted: '#7a6352', qr: '#5a2a14', round: true },
  { id: 'bla-venstre', name: 'Blå fra venstre', group: 'Bilde som bakgrunn', kind: 'photo', font: F.slab,
    filter: 'blue', fade: 'right', bg: '#ffffff', main: '#1f3a5f', soft: '#e6edf5', text: '#14243b', muted: '#56677e', qr: '#1f3a5f', round: false },
  // Store QR-koder, enkle
  { id: 'stor-gronn', name: 'Store QR-koder, grønn', group: 'Store QR-koder', kind: 'paper', header: 'band', font: F.nunito, bigQr: true,
    main: '#1f6f4a', soft: '#d8efe2', text: '#1c1c1c', muted: '#5c6b63', qr: '#1f6f4a', round: false },
  { id: 'stor-minimal', name: 'Store QR-koder, minimal', group: 'Store QR-koder', kind: 'paper', header: 'rule', font: F.inter, bigQr: true,
    main: '#111111', soft: '#f1f1ef', text: '#111111', muted: '#666666', qr: '#111111', round: false },
];

// Utskriftsstørrelser. scale er størrelsen i forhold til A4; perSheet er hvor
// mange som får plass på et A4-ark (med skjæremerker).
export const SIZES = [
  { id: 'A4', name: 'A4', scale: 1, perSheet: 1, note: 'Vegg og dør' },
  { id: 'A5', name: 'A5', scale: Math.SQRT1_2, perSheet: 2, note: '2 per A4-ark' },
  { id: 'A6', name: 'A6', scale: 0.5, perSheet: 4, note: '4 per A4-ark' },
];

// Settes av drawPoster for størrelsen som tegnes: minste QR for listene og
// hvor mye permkortet forstørres (begge i mm på A4-arket).
let minListQ = 17;
let cardK = 1;

// ---------------------------------------------------------------------------
// Hjelpere
// ---------------------------------------------------------------------------
const font = (d, kind, size) => {
  const scale = kind === 'title' ? (d.font.titleScale ?? 1) : 1;
  return d.font[kind].replace('{s}', `${size * scale}px`);
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Bryter teksten i linjer som får plass i bredden.
function wrap(ctx, text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > width && line) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}

// QR-koden, med de tre hjørnemerkene alltid hele (det er dem skanneren leter
// etter). Avrundede moduler ligger tett, så koden skannes like sikkert.
function drawQR(ctx, url, x, y, size, color, round) {
  const q = qrcode(0, 'M');
  q.addData(url);
  q.make();
  const n = q.getModuleCount(), c = size / n;
  const finder = (r, k) => (r < 7 && k < 7) || (r < 7 && k >= n - 7) || (r >= n - 7 && k < 7);
  ctx.fillStyle = color;
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) {
    if (!q.isDark(r, k) || finder(r, k)) continue;
    if (round) { roundRect(ctx, x + k * c, y + r * c, c * 1.01, c * 1.01, c * 0.28); ctx.fill(); }
    else ctx.fillRect(x + k * c, y + r * c, c * 1.02, c * 1.02);
  }
  const eye = (ex, ey) => {
    const rr = round ? c * 0.7 : 0;
    ctx.fillStyle = color; roundRect(ctx, ex, ey, 7 * c, 7 * c, rr); ctx.fill();
    ctx.fillStyle = '#ffffff'; roundRect(ctx, ex + c, ey + c, 5 * c, 5 * c, rr * 0.7); ctx.fill();
    ctx.fillStyle = color; roundRect(ctx, ex + 2 * c, ey + 2 * c, 3 * c, 3 * c, round ? c * 0.4 : 0); ctx.fill();
  };
  eye(x, y); eye(x + (n - 7) * c, y); eye(x, y + (n - 7) * c);
}

// Bildet med filter (sepia, sort-hvitt, blåtone), regnet ut piksel for
// piksel, fordi ctx.filter ikke virker i Safari. Mellomlagres per bilde.
const filtered = new WeakMap();
function filteredImage(img, filter) {
  if (!img || filter === 'none' || !filter) return img;
  let cache = filtered.get(img);
  if (!cache) { cache = {}; filtered.set(img, cache); }
  if (cache[filter]) return cache[filter];
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, c.width, c.height);
  const data = x.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  const duo = { blue: [[12, 28, 58], [178, 208, 240]], green: [[10, 40, 26], [196, 230, 206]] }[filter];
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    if (filter === 'gray') { p[i] = p[i + 1] = p[i + 2] = l; }
    else if (filter === 'sepia') {
      p[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b) * 0.92 + 14;
      p[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b) * 0.9 + 10;
      p[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b) * 0.85 + 6;
    } else if (duo) {
      const t = l / 255;
      p[i] = duo[0][0] + (duo[1][0] - duo[0][0]) * t;
      p[i + 1] = duo[0][1] + (duo[1][1] - duo[0][1]) * t;
      p[i + 2] = duo[0][2] + (duo[1][2] - duo[0][2]) * t;
    }
  }
  x.putImageData(data, 0, 0);
  cache[filter] = c;
  return c;
}

// Tegner bildet slik at det dekker flaten (beskjæres, strekkes aldri).
function drawCover(ctx, img, x, y, w, h, radius = 0) {
  const iw = img.naturalWidth ?? img.width, ih = img.naturalHeight ?? img.height;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  ctx.save();
  if (radius) { roundRect(ctx, x, y, w, h, radius); ctx.clip(); }
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------------------
// Innholdet i flyt: overskrift, bilde, tekst, QR for permen, listene.
// Tegnes ovenfra og ned i boksen. Får det ikke plass, krymper teksten og
// QR-kodene; listene som ikke får plass, telles i result.skipped.
// ---------------------------------------------------------------------------
function flow(ctx, d, data, show, box, o = {}) {
  const { x, w } = box;
  let y = box.y;
  const bottom = box.y + box.h;
  const center = d.center;
  const tx = center ? x + w / 2 : x;
  ctx.textAlign = center ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';
  const result = { skipped: 0 };

  if (show.title && o.title !== false) {
    let size = o.titleSize ?? 13;
    const title = d.font.upper ? data.title.toUpperCase() : data.title;
    ctx.font = font(d, 'title', size);
    while (ctx.measureText(title).width > (o.titleMaxW ?? w) && size > 7) { size -= 0.5; ctx.font = font(d, 'title', size); }
    ctx.fillStyle = o.titleColor ?? d.text;
    y += size * (d.font.titleScale ?? 1) * 0.9;
    ctx.fillText(title, tx, y);
    y += o.titleGap ?? 6;
  }

  if (show.image && data.image && o.photo) {
    // Listene går foran bildet: anslå hva tekst og lister trenger, og la
    // bildet ta resten (mellom minstehøyden og ønsket høyde).
    const n = show.lists ? data.lists.length : 0;
    const c = Math.max(1, Math.min(n, n >= 7 && w >= 120 ? 4 : 3));
    const r = Math.ceil(n / c);
    const cw = (w - (c - 1) * 9) / c;
    const q = Math.min(Math.max(o.listQ ?? 24, minListQ), cw - 10);
    ctx.font = font(d, 'body', 4.6);
    const textH = show.text && data.text ? wrap(ctx, data.text, center ? w * 0.92 : w).length * 4.6 * 1.4 + 8 : 0;
    const listH = d.bigQr ? (show.permQr ? 72 : 0) + r * 55 : (n ? 9 + r * (q + 14 + 9) : 0);
    const h = Math.max(o.photoMin ?? 34, Math.min(o.photo, bottom - y - textH - listH - 8));
    if (o.photoBleed) {
      // Et bånd helt ut til kantene, tonet ut oppe og nede.
      drawCover(ctx, filteredImage(data.image, d.filter), 0, y, o.pageW, h);
      for (const [a, b] of [[y, y + 14], [y + h, y + h - 14]]) {
        const g = ctx.createLinearGradient(0, a, 0, b);
        g.addColorStop(0, hexA(o.bg, 1)); g.addColorStop(1, hexA(o.bg, 0));
        ctx.fillStyle = g; ctx.fillRect(0, Math.min(a, b), o.pageW, 14);
      }
      y += h + 4;
    } else {
      drawCover(ctx, filteredImage(data.image, d.filter), x, y, w, h, 2.5);
      y += h + 6;
    }
  }

  // Plassen igjen: teksten, så listene. Listene er hovedsaken; QR-koden for
  // hele permen er liten og står for seg (permCard). Bare designene med store
  // QR-koder (d.bigQr) har den stor her.
  const big = d.bigQr;
  const listCount = show.lists ? data.lists.length : 0;
  const cols = Math.max(1, Math.min(listCount, listCount >= 7 && w >= 120 ? 4 : 3));
  const rows = Math.ceil(listCount / cols);
  const gap = big ? 5 : rows >= 3 ? 7 : 9;   // luft, så man ikke skanner feil kode
  const cellW = (w - (cols - 1) * gap) / cols;
  let listQ = Math.min(Math.max(o.listQ ?? (big ? 36 : 24), minListQ), cellW - 10);
  let permQ = big && show.permQr ? (o.permQ ?? 58) : 0;
  const head = listCount && !big ? 9 : 0;
  const cellH = () => listQ + 14;

  const need = () => (permQ ? permQ + 14 : 0) + head + rows * (cellH() + gap);
  let textSize = 5.4, lines = [];
  if (show.text && data.text) {
    const textW = center ? w * 0.92 : w;
    for (; textSize >= 3.2; textSize -= 0.2) {
      ctx.font = font(d, 'body', textSize);
      lines = wrap(ctx, data.text, textW);
      if (lines.length * textSize * 1.4 + 7 <= Math.max(bottom - y - need(), textSize * 2.8)) break;
    }
    ctx.fillStyle = o.textColor ?? d.text;
    for (const line of lines) { y += textSize * 1.4; ctx.fillText(line, tx, y); }
    y += 8;
  }

  // Krymp QR-kodene om det trengs, men ikke under lesbar størrelse.
  while (need() > bottom - y && (permQ > 34 || listQ > minListQ)) {
    if (permQ > 34) permQ -= 2; else listQ -= 1;
  }
  let fitRows = rows;
  while (fitRows > 0 && (permQ ? permQ + 14 : 0) + head + fitRows * (cellH() + gap) > bottom - y) fitRows--;
  result.skipped = listCount - Math.min(listCount, fitRows * cols);

  // Listene forankres nederst; luften havner mellom teksten og listene.
  const block = (permQ ? permQ + 14 : 0) + (fitRows ? head + fitRows * (cellH() + gap) - gap : 0);
  if (o.anchor !== false) y = Math.max(y, bottom - block);

  if (permQ) {
    const qx = center ? x + w / 2 - permQ / 2 : x;
    ctx.fillStyle = '#ffffff'; roundRect(ctx, qx - 3, y - 3, permQ + 6, permQ + 6, 3); ctx.fill();
    if (o.qrBorder) { ctx.strokeStyle = o.qrBorder; ctx.lineWidth = 0.8; roundRect(ctx, qx - 3, y - 3, permQ + 6, permQ + 6, 3); ctx.stroke(); }
    drawQR(ctx, data.permUrl, qx, y, permQ, d.qr, d.round);
    const lx = x + permQ + 9;
    ctx.fillStyle = o.accent ?? d.main;
    ctx.font = font(d, 'bold', 6);
    ctx.fillText('Skann for', lx, y + permQ * 0.38);
    ctx.fillText('sjekklistene', lx, y + permQ * 0.38 + 7.5);
    ctx.fillStyle = o.mutedColor ?? d.muted;
    ctx.font = font(d, 'body', 3.6);
    ctx.fillText('Ingen app å laste ned.', lx, y + permQ * 0.38 + 15);
    ctx.fillText('Åpne kameraet og pek.', lx, y + permQ * 0.38 + 20);
    y += permQ + 10;
  }

  if (head && fitRows) {
    ctx.fillStyle = o.accent ?? d.main;
    ctx.font = font(d, 'bold', 3.8);
    const label = 'Skann koden for sjekklisten';
    ctx.fillText(d.font.upper ? label.toUpperCase() : label, tx, y + 4);
    y += head;
  }

  const shown = data.lists.slice(0, fitRows * cols);
  const used = Math.min(cols, shown.length);
  const rowW = used * cellW + (used - 1) * gap;
  const startX = center ? x + (w - rowW) / 2 : x;
  shown.forEach((list, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = startX + col * (cellW + gap), cy = y + row * (cellH() + gap);
    ctx.fillStyle = o.cellBg ?? d.soft;
    roundRect(ctx, cx, cy, cellW, cellH(), 3); ctx.fill();
    if (o.cellBorder) { ctx.strokeStyle = o.cellBorder; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, cx + cellW / 2 - listQ / 2 - 1.5, cy + 2.5, listQ + 3, listQ + 3, 1.5); ctx.fill();
    drawQR(ctx, list.url, cx + cellW / 2 - listQ / 2, cy + 4, listQ, d.qr, d.round);
    ctx.fillStyle = o.cellText ?? d.text;
    ctx.textAlign = 'center';
    let size = 3.8;
    ctx.font = font(d, 'bold', size);
    const t = d.font.upper ? list.title.toUpperCase() : list.title;
    while (ctx.measureText(t).width > cellW - 3 && size > 2.6) { size -= 0.2; ctx.font = font(d, 'bold', size); }
    ctx.fillText(t, cx + cellW / 2, cy + listQ + 10.5);
    ctx.textAlign = center ? 'center' : 'left';
  });
  return result;
}

function hazard(ctx, y, h, W, yellow) {
  ctx.fillStyle = yellow; ctx.fillRect(0, y, W, h);
  ctx.fillStyle = '#111111';
  for (let i = -2; i < W / 10 + 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 10, y); ctx.lineTo(i * 10 + 5, y); ctx.lineTo(i * 10 + 5 - h * 0.6, y + h); ctx.lineTo(i * 10 - h * 0.6, y + h);
    ctx.fill();
  }
}

// QR-koden for hele permen: et lite, liggende kort som deler bunnlinjen med
// «Husk Klommestein · husk.klommestein.no», så det ikke tar en egen rad.
// QR-koden er 15 mm, nok til å skannes på nært hold.
const PERM_CARD = { w: 44, h: 19 };
function permCard(ctx, d, data, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(cardK, cardK);
  x = 0; y = 0;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, PERM_CARD.w, PERM_CARD.h, 2.5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 0.3; ctx.stroke();
  drawQR(ctx, data.permUrl, x + PERM_CARD.w - 17, y + 2, 15, d.qr, d.round);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#222222';
  ctx.font = '700 3.1px Inter';
  ctx.fillText('Hele permen', x + PERM_CARD.w - 19.5, y + 8.6);
  ctx.fillStyle = '#666666';
  ctx.font = '400 2.5px Inter';
  ctx.fillText('Åpne på mobilen', x + PERM_CARD.w - 19.5, y + 12.8);
  ctx.restore();
}

function footerText(ctx, d, W, y, color, left = null, shadow = false) {
  ctx.save();
  ctx.textAlign = left === null ? 'center' : 'left';
  ctx.font = '400 2.6px Inter';
  ctx.fillStyle = color ?? d.muted;
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 1.2; }
  ctx.fillText('Husk Klommestein · husk.klommestein.no', left ?? W / 2, y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Plakat. W × H i mm (A4: 210 × 297). Returnerer { skipped } – antall lister
// som ikke fikk plass.
// ---------------------------------------------------------------------------
export function drawPoster(canvas, d, data, show, size = SIZES[0]) {
  const W = 210, H = 297;
  // QR-kodene må være minst ca. 14 mm (listene) og 12 mm (permen) på det
  // utskrevne arket. På mindre ark tegnes de derfor større på A4-arket.
  minListQ = Math.max(17, 14 / size.scale);
  cardK = Math.max(1, 12 / (15 * size.scale));
  const ctx = canvas.getContext('2d');
  const s = canvas.width / W;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const m = 16; // marg
  const img = data.image;
  let res;
  // Det lille permkortet står nede til høyre; innholdet holder seg over det.
  const card = !d.bigQr && show.permQr;
  const CW = PERM_CARD.w * cardK, CH = PERM_CARD.h * cardK;
  // Kortet ligger i bunnmargen; innholdet trenger bare litt ekstra luft.
  const inset = d.header === 'frame' ? 13 : d.header === 'plank' || d.header === 'hazard' ? 9 : 6;
  const cardSpace = card ? inset + 4 + (CH - PERM_CARD.h) : 0;
  let cardPos = { x: W - (d.header === 'frame' ? 13 : m) - CW, y: H - inset - CH };
  let footer = { x: d.header === 'frame' ? 14 : m, color: null, shadow: false, inline: true };

  if (d.kind === 'paper') {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    let top = 20;
    const title = (y, color, size = 19, x = m, align = 'left') => {
      if (!show.title) return;
      let sz = size;
      const t = d.font.upper ? data.title.toUpperCase() : data.title;
      ctx.font = font(d, 'title', sz);
      while (ctx.measureText(t).width > W - 2 * m && sz > 8) { sz -= 0.5; ctx.font = font(d, 'title', sz); }
      ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(t, x, y);
    };
    switch (d.header) {
      case 'band': ctx.fillStyle = d.main; ctx.fillRect(0, 0, W, show.title ? 44 : 12); title(30, '#ffffff'); top = show.title ? 56 : 22; break;
      case 'rule': title(34, d.text, 21); if (show.title) { ctx.fillStyle = d.text; ctx.fillRect(m, 42, W - 2 * m, 1.4); } top = show.title ? 54 : 20; break;
      case 'plank': ctx.fillStyle = d.main; ctx.fillRect(0, 0, W, 9); ctx.fillStyle = '#c9896f'; ctx.fillRect(0, 9, W, 2.5);
        ctx.fillStyle = d.main; ctx.fillRect(0, H - 7, W, 7); title(36, d.main, 20); top = show.title ? 50 : 22; break;
      case 'stripes': ctx.strokeStyle = d.main; ctx.lineWidth = 1.4; ctx.setLineDash([5, 2.5]); roundRect(ctx, 5, 5, W - 10, H - 10, 5); ctx.stroke(); ctx.setLineDash([]);
        [0, 1, 2].forEach((i) => { ctx.fillStyle = hexA(d.main, 1 - i * 0.3); ctx.fillRect(0, 13 + i * 5, W, 2.5); });
        title(47, d.main, 18); top = show.title ? 58 : 34; break;
      case 'frame': ctx.strokeStyle = d.main; ctx.lineWidth = 0.6; ctx.strokeRect(7, 7, W - 14, H - 14); ctx.lineWidth = 0.3; ctx.strokeRect(10, 10, W - 20, H - 20);
        title(37, d.text, 19, W / 2, 'center'); if (show.title) { ctx.fillStyle = d.main; ctx.fillRect(W / 2 - 15, 44, 30, 0.6); } top = show.title ? 54 : 22; break;
      case 'hazard': hazard(ctx, 0, 9, W, d.soft); hazard(ctx, H - 7, 7, W, d.soft); title(38, '#111111', 22); top = show.title ? 50 : 20; break;
    }
    res = flow(ctx, d, data, show, { x: m, y: top, w: W - 2 * m, h: H - top - 20 - cardSpace },
      { title: false, photo: 100, qrBorder: d.main, cellBorder: d.header === 'hazard' ? d.soft : null, cellBg: d.header === 'hazard' ? '#ffffff' : d.soft });
    if (!card) footerText(ctx, d, W, H - (d.header === 'plank' || d.header === 'hazard' ? 11 : d.header === 'frame' ? 14 : 9));
  }

  else if (d.kind === 'fill') {
    ctx.fillStyle = d.bg; ctx.fillRect(0, 0, W, H);
    res = flow(ctx, d, data, show, { x: m, y: 18, w: W - 2 * m, h: H - 18 - 20 - cardSpace },
      { titleSize: 19, titleGap: 8, titleColor: d.dark ? '#ffffff' : d.main, photo: 100, accent: d.dark ? '#ffffff' : d.main,
        cellBg: d.soft, cellText: d.dark ? '#1f4d38' : d.text, qrBorder: null });
    if (!card) footerText(ctx, d, W, H - 9, d.muted);
  }

  else { // photo
    ctx.fillStyle = d.bg; ctx.fillRect(0, 0, W, H);
    const pic = img ? filteredImage(img, d.filter) : null;
    const has = pic && show.image;
    const fade = (x0, y0, x1, y1, color = d.bg) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, hexA(color, 0)); g.addColorStop(1, hexA(color, 1));
      return g;
    };
    const dark = d.dark;
    const o = { title: true, titleSize: 20, titleGap: 8, photo: 0, accent: d.main, cellBg: d.soft, cellText: dark ? d.qr : d.text,
      titleColor: dark ? '#ffffff' : d.text, mutedColor: d.muted, qrBorder: null };
    const full = () => { if (has) drawCover(ctx, pic, 0, 0, W, H); };
    // Flere rader med lister gir mindre bilde, så listene får plass.
    const nl = show.lists ? data.lists.length : 0;
    const listRows = Math.ceil(nl / (nl >= 7 ? 4 : 3));
    const sf = listRows <= 1 ? 1 : listRows === 2 ? 0.72 : 0.5;
    switch (d.fade) {
      case 'bottom': { // bildet øverst, tones ut før teksten
        const ph = H * 0.44 * sf;
        if (has) { drawCover(ctx, pic, 0, 0, W, ph + 10); ctx.fillStyle = fade(0, ph - 42, 0, ph + 2); ctx.fillRect(0, ph - 43, W, 54); }
        res = flow(ctx, d, data, show, { x: m, y: has ? ph + 2 : 18, w: W - 2 * m, h: H - (has ? ph + 2 : 18) - 16 - cardSpace }, o);
        break;
      }
      case 'top': { // bildet nederst, innholdet over
        const ph = H * 0.34 * sf;
        if (has) { drawCover(ctx, pic, 0, H - ph - 4, W, ph + 4); ctx.fillStyle = fade(0, H - ph + 32, 0, H - ph - 4); ctx.fillRect(0, H - ph - 5, W, 38); }
        res = flow(ctx, d, data, show, { x: m, y: 18, w: W - 2 * m, h: (has ? H - ph - 6 : H - 18 - cardSpace) - 18 }, { ...o, cellBg: dark ? d.soft : '#ffffff' });
        if (has) footer = { ...footer, color: '#ffffff', shadow: true };
        break;
      }
      case 'left': case 'right': { // bildet på den ene siden, innholdet i en kolonne
        const pw = W * 0.42, photoRight = d.fade === 'left';
        if (has) {
          if (photoRight) { drawCover(ctx, pic, W - pw - 12, 0, pw + 12, H); ctx.fillStyle = fade(W - pw + 22, 0, W - pw - 12, 0); ctx.fillRect(W - pw - 13, 0, 36, H); }
          else { drawCover(ctx, pic, 0, 0, pw + 12, H); ctx.fillStyle = fade(pw - 22, 0, pw + 12, 0); ctx.fillRect(pw - 23, 0, 36, H); }
        }
        const cw = has ? W - pw - m - 14 : W - 2 * m;
        const cx = has && !photoRight ? pw + 14 : m;
        res = flow(ctx, d, data, show, { x: cx, y: 26, w: cw, h: H - 50 - cardSpace }, { ...o, titleSize: 14, listQ: 22 });
        cardPos = { x: cx + cw - CW, y: H - 6 - CH };
        footer = { ...footer, x: cx };
        break;
      }
      case 'wash': { // hele bildet, lyst nedtonet, mørk tekst
        full(); ctx.fillStyle = hexA(d.bg, 0.74); ctx.fillRect(0, 0, W, H);
        res = flow(ctx, d, data, show, { x: m, y: 26, w: W - 2 * m, h: H - 26 - 22 - cardSpace }, { ...o, titleSize: 24 });
        break;
      }
      case 'band': { // bildet som et bånd midt på
        res = flow(ctx, d, data, show, { x: m, y: 20, w: W - 2 * m, h: H - 20 - 18 - cardSpace },
          { ...o, titleSize: 22, photo: has ? 82 : 0, photoMin: 30, photoBleed: true, pageW: W, bg: d.bg });
        break;
      }
      case 'panel-bottom': case 'panel-center': { // hele bildet, innholdet på et panel
        full();
        const center = d.fade === 'panel-center';
        const px = center ? 14 : 10, py = center ? 14 : H * (sf === 1 ? 0.4 : sf > 0.6 ? 0.3 : 0.2), pw = W - 2 * px, ph = center ? H - 28 : H - py - 10;
        ctx.fillStyle = hexA(d.bg, center ? 0.93 : 0.95);
        roundRect(ctx, px, py, pw, ph, center ? 2 : 5); ctx.fill();
        const win = 70 * sf;
        if (center && has) drawCover(ctx, pic, px + 8, py + 34, pw - 16, win, 2); // bildet som et vindu i panelet
        res = flow(ctx, d, data, show, { x: px + 10, y: py + 10, w: pw - 20, h: ph - 20 },
          { ...o, titleSize: center ? 17 : 19, titleGap: center ? (has ? win + 12 : 8) : 7,
            titleMaxW: card ? pw - 20 - (center ? 2 : 1) * (CW + 4) : undefined });
        cardPos = { x: px + pw - 6 - CW, y: py + 6 };
        footer = { ...footer, inline: false };
        break;
      }
      case 'split-top': { // bildet øverst med skarp kant, tittelen ligger på bildet
        const ph = H * 0.42 * Math.max(sf, 0.6);
        if (has) {
          drawCover(ctx, pic, 0, 0, W, ph);
          const g = ctx.createLinearGradient(0, ph * 0.45, 0, ph);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, ph);
        }
        if (show.title) {
          let size = 24;
          const t = d.font.upper ? data.title.toUpperCase() : data.title;
          ctx.font = font(d, 'title', size);
          while (ctx.measureText(t).width > W - 2 * m && size > 10) { size -= 0.5; ctx.font = font(d, 'title', size); }
          ctx.textAlign = 'left'; ctx.fillStyle = has ? '#ffffff' : d.text;
          ctx.fillText(t, m, has ? ph - 10 : 34);
        }
        res = flow(ctx, d, data, show, { x: m, y: has ? ph + 8 : 46, w: W - 2 * m, h: H - (has ? ph + 8 : 46) - 18 - cardSpace }, { ...o, title: false });
        break;
      }
      default: { // full: hele bildet, mørkt nedtonet, lys tekst
        if (has) {
          full();
          ctx.fillStyle = hexA(d.bg, 0.45); ctx.fillRect(0, 0, W, H);
          const g = ctx.createLinearGradient(0, H * 0.25, 0, H);
          g.addColorStop(0, hexA(d.bg, 0)); g.addColorStop(1, hexA(d.bg, 0.85));
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
        res = flow(ctx, d, data, show, { x: m, y: 30, w: W - 2 * m, h: H - 30 - 22 - cardSpace }, { ...o, titleSize: 24, listQ: 26 });
      }
    }
    if (!card || !footer.inline) footerText(ctx, d, W, H - 8, d.muted);
  }
  if (card) {
    if (footer.inline) footerText(ctx, d, W, cardPos.y + CH * 0.6, footer.color ?? d.muted, footer.x, footer.shadow);
    permCard(ctx, d, data, cardPos.x, cardPos.y);
  }
  return res;
}

// ---------------------------------------------------------------------------
// QR-merke for én liste, 70 × 90 mm.
// ---------------------------------------------------------------------------
export function drawSticker(canvas, d, data, list, caption = 'Skann for sjekklisten') {
  const W = 70, H = 90;
  const ctx = canvas.getContext('2d');
  const s = canvas.width / W;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const q = 50, qx = (W - q) / 2, qy = 9;
  const bg = d.kind === 'paper' ? '#ffffff' : d.bg;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (d.kind === 'photo' && data.image) {
    drawCover(ctx, filteredImage(data.image, d.filter), 0, 0, W, H);
    ctx.fillStyle = hexA(d.bg, d.dark ? 0.55 : 0.35); ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.8);
    g.addColorStop(0, hexA(d.bg, 0)); g.addColorStop(1, hexA(d.bg, 1));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (d.header === 'hazard') { hazard(ctx, H - 5, 5, W, d.soft); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6; ctx.strokeRect(1.5, 1.5, W - 3, H - 8); }
  else if (d.header === 'frame') { ctx.strokeStyle = d.main; ctx.lineWidth = 0.4; ctx.strokeRect(3, 3, W - 6, H - 6); }
  else if (d.header === 'stripes') { ctx.strokeStyle = d.main; ctx.lineWidth = 0.9; ctx.setLineDash([3, 1.5]); roundRect(ctx, 2.5, 2.5, W - 5, H - 5, 4); ctx.stroke(); ctx.setLineDash([]); }
  else if (d.kind === 'paper') { ctx.strokeStyle = d.main; ctx.lineWidth = d.header === 'rule' ? 0.7 : 1; roundRect(ctx, 2.5, 2.5, W - 5, H - 5, d.header === 'rule' ? 0 : 5); ctx.stroke(); }
  const band = d.header === 'band' || d.header === 'plank';
  if (band) { ctx.save(); roundRect(ctx, 2.5, 2.5, W - 5, H - 5, d.header === 'band' ? 5 : 0); ctx.clip(); ctx.fillStyle = d.main; ctx.fillRect(0, qy + q + 5, W, H); ctx.restore(); }
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, qx - 3, qy - 3, q + 6, q + 6, 3); ctx.fill();
  drawQR(ctx, list.url, qx, qy, q, d.qr, d.round);
  const light = band || d.dark;
  ctx.textAlign = 'center';
  let size = 7;
  const t = d.font.upper ? list.title.toUpperCase() : list.title;
  ctx.font = font(d, 'title', size);
  while (ctx.measureText(t).width > W - 8 && size > 4) { size -= 0.3; ctx.font = font(d, 'title', size); }
  ctx.fillStyle = light ? '#ffffff' : (d.kind === 'fill' ? d.main : d.text);
  ctx.fillText(t, W / 2, qy + q + 14);
  ctx.font = font(d, 'body', 3.4);
  ctx.fillStyle = light ? 'rgba(255,255,255,.85)' : d.muted;
  ctx.fillText(caption, W / 2, qy + q + 20);
}
