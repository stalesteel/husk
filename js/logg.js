// Loggen over bekreftelser for listene i en perm. Vises nederst i permen,
// bare for dem som kan redigere (tilgangsreglene i databasen gir heller ikke
// andre noe). Et trykk på en bekreftelse viser stegene og om de ble krysset
// av, som i e-posten. Egen fil, så en eldre data.js i hurtigminnet ikke
// stopper siden.

import { el } from './dom.js';
import { supabase } from './supabase.js';

const LIMIT = 50;

const when = new Intl.DateTimeFormat('nb-NO', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

// Lenken nederst; loggen hentes først når den åpnes.
export function setupLog(container, perm) {
  const list = el('div', { class: 'log-list', hidden: true });
  const toggle = el('button', { class: 'log-link', type: 'button', 'aria-expanded': 'false' }, 'Logg over bekreftelser');
  let loaded = false;

  toggle.addEventListener('click', async () => {
    const open = list.hidden;
    list.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Skjul loggen' : 'Logg over bekreftelser';
    if (open && !loaded) {
      loaded = true;
      list.replaceChildren(el('p', { class: 'log-empty' }, 'Et øyeblikk …'));
      render(list, perm);
    }
  });

  container.replaceChildren(toggle, list);
  container.hidden = false;
}

async function render(container, perm) {
  const titles = new Map(perm.lists.map((l) => [l.id, l.title]));
  if (!titles.size) {
    container.replaceChildren(el('p', { class: 'log-empty' }, 'Permen har ingen lister ennå.'));
    return;
  }
  const { data, error } = await supabase.from('confirmations')
    .select('id, list_id, created_at, name, comment, done, total, steps, photos')
    .in('list_id', [...titles.keys()])
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) {
    container.replaceChildren(el('p', { class: 'log-empty' }, 'Kunne ikke hente loggen. Sjekk nettet og prøv igjen.'));
    return;
  }
  if (!data.length) {
    container.replaceChildren(el('p', { class: 'log-empty' },
      'Ingen bekreftelser ennå. Bekreftelse på e-post slås på under «Listen» når du redigerer en liste.'));
    return;
  }

  // Bildene ligger i en lukket bucket; de vises med lenker som gjelder en time.
  const paths = data.flatMap((row) => row.photos ?? []);
  const urls = new Map();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('bekreftelser').createSignedUrls(paths, 3600);
    for (const item of signed ?? []) if (item.signedUrl) urls.set(item.path, item.signedUrl);
  }

  const rows = data.map((row) => {
    // Detaljene: stegene med ✓ og ✗, og kommentaren.
    const details = el('div', { class: 'log-details', hidden: true },
      row.steps?.length
        ? el('ol', { class: 'log-steps' }, row.steps.map((step, i) => el('li', { class: step.done ? 'done' : 'missing' },
            el('span', { class: 'log-mark', 'aria-label': step.done ? 'Krysset av' : 'Ikke krysset av' }, step.done ? '✓' : '✗'),
            `${i + 1}. ${step.title}`)))
        : el('p', { class: 'log-empty' }, 'Stegene ble ikke lagret for denne bekreftelsen (sendt før loggen fikk dem).'),
      row.photos?.length
        ? el('div', { class: 'log-photos' }, row.photos.map((path, i) => {
            const url = urls.get(path);
            return url
              ? el('a', { href: url, target: '_blank', rel: 'noopener', 'aria-label': `Bilde ${i + 1}` }, el('img', { src: url, alt: '', loading: 'lazy' }))
              : el('span', { class: 'log-empty' }, 'Bildet kunne ikke hentes.');
          }))
        : null);
    const head = el('button', { class: 'log-entry-head', type: 'button', 'aria-expanded': 'false' },
      el('span', { class: 'log-head' },
        el('strong', {}, titles.get(row.list_id) ?? 'Slettet liste'),
        el('span', { class: row.done === row.total ? 'log-count ok' : 'log-count' },
          row.done === row.total ? `✓ ${row.done} av ${row.total}` : `${row.done} av ${row.total}`)),
      el('span', { class: 'log-meta' }, `${row.name || 'En gjest'} · ${when.format(new Date(row.created_at))}${row.photos?.length ? ` · 📷 ${row.photos.length}` : ''}`,
        el('span', { class: 'log-chevron', 'aria-hidden': 'true' }, '›')));
    head.addEventListener('click', () => {
      details.hidden = !details.hidden;
      head.setAttribute('aria-expanded', String(!details.hidden));
    });
    return el('div', { class: 'log-entry' }, head,
      row.comment ? el('p', { class: 'log-comment' }, row.comment) : null,
      details);
  });
  if (data.length === LIMIT) rows.push(el('p', { class: 'log-empty' }, `Viser de ${LIMIT} siste.`));
  container.replaceChildren(...rows);
}
