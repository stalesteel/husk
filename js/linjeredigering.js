// Rask redigering av en avkrysningsliste: alle punktene som linjer man skriver
// rett i, som et notat. Enter gir et nytt punkt, og limer man inn en liste med
// mange linjer, blir hver linje et punkt. Verktøyene (flytt, bilde og
// beskrivelse, slett) vises under linjen som har markøren.
//
// Bilde og beskrivelse redigeres i kortredigeringen (rediger.js) for det ene
// punktet; openStep sender dit. Egen fil, så en nettleser med eldre filer i
// hurtigminnet ikke stopper siden.

import { deleteStep, insertStep, removeFiles, saveOrder, updateStep } from './data.js';
import { el } from './dom.js';
import { later, save } from './saving.js';

// Fjerner punkttegn og nummer foran limte linjer («- », «• », «1. », «[ ] »).
const cleanLine = (line) => line.replace(/^\s*(?:[-*•–·]|\d+[.)]|\[[ xX]?\])\s*/, '').trim();

export function lineEditor(container, list, { openStep }) {
  const listEl = el('ol', { class: 'lines-list' });
  const tools = el('div', { class: 'line-tools', hidden: true });
  let focused = null;   // steget som har markøren

  // Hvert steg får en ready-promise for id-en, så nye linjer kan skrives i
  // med en gang mens de lagres.
  for (const step of list.steps) step.ready ??= Promise.resolve();
  let keys = 0;
  for (const step of list.steps) step.key ??= ++keys;

  const saveTitle = (step) => later(`line-title:${step.key}`,
    async () => { await step.ready; return updateStep(step.id, { title: step.title.trim() }); });

  const saveAllOrder = () => save(Promise.all(list.steps.map((s) => s.ready))
    .then(() => saveOrder('steps', list.steps.map((s) => s.id))));

  function render(focusIndex = null, caret = null) {
    listEl.replaceChildren(...list.steps.map((step, i) => row(step, i)));
    if (focusIndex !== null) {
      const input = listEl.children[focusIndex]?.querySelector('input');
      if (input) {
        input.focus();
        const pos = caret ?? input.value.length;
        input.setSelectionRange(pos, pos);
      }
    }
  }

  function row(step, index) {
    const input = el('input', {
      class: 'line-input', type: 'text', value: step.title, placeholder: 'Nytt punkt',
      enterkeyhint: 'next', 'aria-label': `Punkt ${index + 1}`,
    });
    const extras = [];
    if (step.images.length) extras.push(`📷 ${step.images.length}`);
    if (step.description?.trim()) extras.push('beskrivelse');
    const li = el('li', { class: 'line' },
      el('span', { class: 'line-no' }, `${index + 1}.`),
      el('span', { class: 'line-field' }, input,
        extras.length ? el('span', { class: 'line-extra' }, extras.join(' · ')) : null));

    input.addEventListener('input', () => { step.title = input.value; saveTitle(step); });
    input.addEventListener('focus', () => { focused = step; showTools(li); });
    input.addEventListener('blur', () => setTimeout(() => {
      if (!container.contains(document.activeElement) || !document.activeElement.matches('.line-input')) {
        focused = null;
        tools.hidden = true;
      }
    }, 150));
    input.addEventListener('keydown', (event) => {
      const i = list.steps.indexOf(step);
      if (event.key === 'Enter') {
        event.preventDefault();
        // Enter midt i teksten deler linjen, som i et notat.
        const pos = input.selectionStart ?? input.value.length;
        const rest = input.value.slice(pos);
        if (rest) { step.title = input.value.slice(0, pos); saveTitle(step); }
        addAfter(i, [rest.trim()]);
      } else if (event.key === 'Backspace' && !input.value && list.steps.length > 1
        && !step.images.length && !step.description?.trim()) {
        event.preventDefault();
        remove(step, { ask: false, focus: Math.max(0, i - 1) });
      } else if (event.key === 'ArrowUp' && i > 0) {
        event.preventDefault();
        listEl.children[i - 1].querySelector('input').focus();
      } else if (event.key === 'ArrowDown' && i < list.steps.length - 1) {
        event.preventDefault();
        listEl.children[i + 1].querySelector('input').focus();
      }
    });
    // Limer man inn flere linjer, blir hver linje et punkt.
    input.addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text') ?? '';
      if (!/\r?\n/.test(text.trim())) return;
      event.preventDefault();
      const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
      if (!lines.length) return;
      const i = list.steps.indexOf(step);
      const first = lines.shift();
      step.title = input.value.trim() ? `${input.value.trim()} ${first}` : first;
      saveTitle(step);
      if (lines.length) addAfter(i, lines, { focusLast: true });
      else render(i);
    });
    return li;
  }

  // Nye punkter etter punkt i. Lagres i bakgrunnen; linjene kan brukes med en gang.
  function addAfter(i, titles, { focusLast = false } = {}) {
    const created = titles.map((title) => {
      const step = { id: null, title, description: '', images: [], key: ++keys };
      step.ready = insertStep(list.id, list.steps.length + 1).then((r) => { step.id = r.id; });
      save(step.ready.then(() => (title ? updateStep(step.id, { title }) : null)));
      return step;
    });
    list.steps.splice(i + 1, 0, ...created);
    saveAllOrder();
    render(focusLast ? i + created.length : i + 1, focusLast ? null : 0);
  }

  async function remove(step, { ask = true, focus = null } = {}) {
    const i = list.steps.indexOf(step);
    const count = step.images.length;
    if (ask) {
      const name = step.title.trim() ? `«${step.title.trim()}»` : `punkt ${i + 1}`;
      const withImages = count ? ` og ${count === 1 ? 'bildet' : `de ${count} bildene`}` : '';
      if (!confirm(`Slette ${name}${withImages}?`)) return;
    }
    list.steps.splice(i, 1);
    render(focus ?? Math.min(i, list.steps.length - 1));
    const paths = step.images.map((image) => image.path).filter(Boolean);
    save(step.ready.then(() => deleteStep(step.id)).then(() => removeFiles(paths)));
    saveAllOrder();
  }

  function move(step, direction) {
    const i = list.steps.indexOf(step);
    const target = i + direction;
    if (target < 0 || target >= list.steps.length) return;
    list.steps.splice(i, 1);
    list.steps.splice(target, 0, step);
    render(target);
    saveAllOrder();
  }

  // Verktøyene under linjen med markøren. Knappene tar ikke fokus, så
  // markøren blir stående i linjen.
  const tool = (text, onclick, extra = {}) => {
    const button = el('button', { type: 'button', ...extra }, text);
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => focused && onclick(focused));
    return button;
  };
  tools.append(
    tool('↑', (step) => move(step, -1), { 'aria-label': 'Flytt opp' }),
    tool('↓', (step) => move(step, 1), { 'aria-label': 'Flytt ned' }),
    tool('📷 Bilde og beskrivelse', async (step) => { await step.ready; openStep(step); }),
    tool('Slett', (step) => remove(step), { class: 'danger' }));

  function showTools(li) {
    const i = list.steps.indexOf(focused);
    const [up, down] = tools.children;
    up.disabled = i === 0;
    down.disabled = i === list.steps.length - 1;
    li.after(tools);
    tools.hidden = false;
  }

  const add = el('button', { class: 'line-add', type: 'button' }, '+ Nytt punkt');
  add.addEventListener('click', () => addAfter(list.steps.length - 1, ['']));

  container.replaceChildren(
    el('h2', { class: 'lines-head' }, 'Punktene'),
    el('p', { class: 'lines-hint' }, 'Enter gir et nytt punkt. Lim inn en hel liste, så blir hver linje et punkt.'),
    listEl, add);
  render();

  // Ny liste: markøren i det første punktet.
  return { focusFirst: () => render(0) };
}
