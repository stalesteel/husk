// QR-kode for en gruppeside (?gruppe=id) eller en liste (?liste=id), klar
// til å skrives ut eller lastes ned som bilde med navnet under.

import qrcode from 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm';
import { getGroup, getList } from './data.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const QUIET = 4; // hvit kant rundt koden, i moduler, som skannere trenger

function showMessage(text) {
  $('message').textContent = text;
  $('message').hidden = false;
  $('content').hidden = true;
}

function makeCode(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return qr;
}

function svgFor(qr) {
  const count = qr.getModuleCount();
  const size = count + QUIET * 2;
  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + QUIET},${row + QUIET}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR-kode">`
    + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

// Bildet til nedlasting: koden med navnet og teksten under, på hvitt.
function pngFor(qr, name, caption) {
  const count = qr.getModuleCount();
  const scale = Math.floor(1000 / (count + QUIET * 2));
  const codeSize = scale * (count + QUIET * 2);
  const width = codeSize;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Navnet krympes til det får plass på én linje.
  let fontSize = 72;
  const font = (size) => `700 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.font = font(fontSize);
  while (fontSize > 28 && ctx.measureText(name).width > width - 80) {
    fontSize -= 4;
    ctx.font = font(fontSize);
  }

  canvas.width = width;
  canvas.height = codeSize + fontSize + 110;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect((col + QUIET) * scale, (row + QUIET) * scale, scale, scale);
    }
  }

  ctx.textAlign = 'center';
  ctx.font = font(fontSize);
  ctx.fillText(name, width / 2, codeSize + fontSize);
  ctx.fillStyle = '#555';
  ctx.font = font(36).replace('700', '400');
  ctx.fillText(caption, width / 2, codeSize + fontSize + 64);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function main() {
  const groupId = params.get('gruppe');
  const listId = params.get('liste');

  let name, url, caption, back;
  try {
    if (groupId) {
      const group = await getGroup(groupId);
      if (!group) return showMessage('Fant ikke denne gruppen.');
      name = group.name;
      url = `${location.origin}/gruppe/?id=${group.id}`;
      caption = 'Skann for sjekklistene';
      back = `/rediger/gruppe/?id=${group.id}`;
    } else {
      const list = await getList(listId);
      if (!list) return showMessage('Fant ikke denne listen.');
      name = list.title;
      url = `${location.origin}/liste/?id=${list.id}`;
      caption = 'Skann for sjekklisten';
      back = `/rediger/gruppe/?id=${list.group.id}`;
    }
  } catch {
    return showMessage('Kunne ikke laste. Sjekk nettet og prøv igjen.');
  }

  const qr = makeCode(url);
  document.title = `QR-kode: ${name} – Husk Klommestein`;
  $('back').href = back;
  $('name').textContent = name;
  $('caption').textContent = caption;
  $('code').innerHTML = svgFor(qr);
  $('url').textContent = url;

  $('print').addEventListener('click', () => window.print());
  $('download').addEventListener('click', async () => {
    const blob = await pngFor(qr, name, caption);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `QR – ${name}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  });

  $('message').hidden = true;
  $('content').hidden = false;
}

main();
