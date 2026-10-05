// Plakatsiden (/plakat/?perm=id): velg design ved å sveipe, velg innhold og
// størrelse, og last ned som PDF. Plakaten tegnes av plakat-motor.js, så
// forhåndsvisningen og PDF-en blir like.

import { canEdit } from './admin.js';
import { getGroup, imageUrl } from './data.js';
import { designPicker } from './designvelger.js';
import { el } from './dom.js';
import { DESIGNS, SIZES, drawPoster, loadFonts } from './plakat-motor.js';

const $ = (id) => document.getElementById(id);
const SITE = location.origin;
const DESIGN_KEY = 'husk-plakat-design';

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
    img.crossOrigin = 'anonymous'; // så bildet kan filtreres og legges i PDF-en
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = imageUrl(path);
  });
}

async function main() {
  let perm;
  try {
    perm = await getGroup(new URLSearchParams(location.search).get('perm'));
  } catch {
    return showMessage('Kunne ikke laste permen. Sjekk nettet og prøv igjen.');
  }
  if (!perm) return showMessage('Fant ikke denne permen. Sjekk at lenken er riktig.');

  $('back').href = canEdit(perm) ? `/rediger/perm/?id=${perm.id}` : `/perm/?id=${perm.id}`;
  document.title = `Plakat: ${perm.name} – Husk Klommestein`;

  const [image] = await Promise.all([loadImage(perm.image_path), loadFonts()]);
  const data = {
    title: perm.name,
    text: perm.description ?? '',
    image,
    permUrl: `${SITE}/perm/?id=${perm.id}`,
    lists: perm.lists.map((list) => ({ title: list.title, url: `${SITE}/liste/?id=${list.id}` })),
  };

  // Innholdet: det som mangler i permen, kan ikke velges.
  const show = { title: true, image: true, text: true, lists: true, permQr: true };
  const missing = { image: !image, text: !data.text.trim(), lists: !data.lists.length };
  for (const box of $('show').querySelectorAll('input')) {
    if (missing[box.value]) { box.checked = false; box.disabled = true; show[box.value] = false; }
    box.addEventListener('change', () => { show[box.value] = box.checked; update(); });
  }

  // Størrelsen
  let size = SIZES[0];
  $('sizes').replaceChildren(...SIZES.map((s) => el('label', { class: 'chip size' },
    el('input', { type: 'radio', name: 'size', value: s.id, checked: s === size,
      onchange: () => { size = s; update(); } }),
    el('span', {}, s.name, el('small', {}, s.note)))));

  // Innholdet vises før designvelgeren lages, så den har en bredde å tegne i.
  $('message').hidden = true;
  $('content').hidden = false;

  // Designene
  const saved = DESIGNS.findIndex((d) => d.id === store.get(DESIGN_KEY));
  const picker = designPicker($('picker'), DESIGNS, {
    aspect: 297 / 210,
    start: saved >= 0 ? saved : 0,
    render: (canvas, design) => drawPoster(canvas, design, data, show, size),
    onChange: (i) => { store.set(DESIGN_KEY, DESIGNS[i].id); showName(i); recheck(); },
  });

  function showName(i) {
    $('design-name').textContent = DESIGNS[i].name;
    $('design-count').textContent = `${i + 1} av ${DESIGNS.length}`;
  }

  function setWarning(count) {
    $('warn').hidden = !count;
    $('warn').textContent = count
      ? `${count === 1 ? 'Én liste' : `${count} lister`} fikk ikke plass på plakaten. Prøv uten bilde eller tekst, en større størrelse, eller et annet design.`
      : '';
  }

  // Varselet gjelder designet som er valgt; regnes ut uten å vise noe.
  const probe = document.createElement('canvas');
  probe.width = 210; probe.height = 297;
  function recheck() { setWarning(drawPoster(probe, DESIGNS[picker.index], data, show, size).skipped); }

  function update() { picker.invalidate(); recheck(); }

  $('pdf').addEventListener('click', () => downloadPdf(DESIGNS[picker.index], data, show, size));

  showName(picker.index);
  recheck();
}

// ---------------------------------------------------------------------------
// PDF: plakaten tegnes i 300 dpi og legges på A4-ark. A5 og A6 kommer flere
// på samme ark, med stiplede linjer å klippe etter.
// ---------------------------------------------------------------------------

async function downloadPdf(design, data, show, size) {
  const button = $('pdf');
  button.disabled = true;
  button.textContent = 'Lager PDF …';
  try {
    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm');
    const mmW = 210 * size.scale, mmH = 297 * size.scale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((mmW / 25.4) * 300);
    canvas.height = Math.round((mmH / 25.4) * 300);
    drawPoster(canvas, design, data, show, size);
    const jpeg = canvas.toDataURL('image/jpeg', 0.92);

    const landscape = size.perSheet === 2;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
    const places = size.perSheet === 1 ? [[0, 0]]
      : size.perSheet === 2 ? [[0, 0], [148.5, 0]]
        : [[0, 0], [105, 0], [0, 148.5], [105, 148.5]];
    for (const [x, y] of places) pdf.addImage(jpeg, 'JPEG', x, y, mmW, mmH);
    if (size.perSheet > 1) {
      pdf.setDrawColor(150);
      pdf.setLineWidth(0.2);
      pdf.setLineDashPattern([2, 2], 0);
      if (size.perSheet === 2) pdf.line(148.5, 0, 148.5, 210);
      else { pdf.line(105, 0, 105, 297); pdf.line(0, 148.5, 210, 148.5); }
    }

    const name = `Plakat – ${data.title} (${size.name}).pdf`;
    const blob = pdf.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    // På mobil gir delingsarket «Lagre i Filer» og utskrift; ellers lastes den ned.
    if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name }).catch(() => {});
    } else {
      pdf.save(name);
    }
  } catch (error) {
    console.error(error);
    alert('Kunne ikke lage PDF-en. Sjekk nettet og prøv igjen.');
  } finally {
    button.disabled = false;
    button.textContent = 'Last ned PDF';
  }
}

main();
