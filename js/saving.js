// Fortløpende lagring for redigeringssidene.
// Tekst lagres litt etter at man har sluttet å skrive (later). Alt annet
// lagres med en gang (save). Statusen viser om noe ikke er lagret ennå.

const timers = new Map();   // nøkkel -> { timer, run }
const inFlight = new Set();
let failed = false;
let changed = false;
let statusEl = null;

export function showStatusIn(element) {
  statusEl = element;
  showStatus();
}

export function save(promise) {
  changed = true;
  const tracked = promise
    .catch((error) => { failed = true; console.error(error); })
    .finally(() => { inFlight.delete(tracked); showStatus(); });
  inFlight.add(tracked);
  showStatus();
  return tracked;
}

export function later(key, run, delay = 700) {
  clearTimeout(timers.get(key)?.timer);
  timers.set(key, { run, timer: setTimeout(() => { timers.delete(key); save(run()); }, delay) });
  showStatus();
}

export function flushAll() {
  for (const { timer, run } of timers.values()) {
    clearTimeout(timer);
    save(run());
  }
  timers.clear();
}

export async function settle() {
  flushAll();
  await Promise.all(inFlight);
}

function showStatus() {
  if (!statusEl) return;
  statusEl.classList.toggle('error', failed);
  if (failed) statusEl.textContent = 'Ikke lagret – last siden på nytt';
  else if (timers.size || inFlight.size) statusEl.textContent = 'Lagrer …';
  else statusEl.textContent = changed ? 'Lagret' : '';
}

// Lenker ut av siden venter til alt er lagret.
export function leaveVia(link) {
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    await settle();
    location.assign(link.href);
  });
}

window.addEventListener('beforeunload', (event) => {
  if (timers.size || inFlight.size) event.preventDefault();
});
window.addEventListener('pagehide', flushAll);
