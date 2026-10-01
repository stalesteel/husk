// Adminmodus: en administrator (se supabase/migrations/…_admin.sql) kan slå
// den på fra forsiden, og ser da alle permer og kan redigere og slette alt.
// Det er tilgangsreglene i databasen som gir tilgangen; bryteren avgjør bare
// om appen viser den, så vanlig bruk ser ut som for alle andre. Valget huskes
// i denne nettleseren.

const KEY = 'husk-adminmodus';

export function adminModeOn() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setAdminMode(on) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* uten lagring gjelder valget bare denne siden */ }
}

// Perm eller liste fra get_group/get_list: redigerer som administrator?
export const actsAsAdmin = (item) => Boolean(item?.is_admin) && adminModeOn();

// Kan redigere, enten som eier/redaktør eller i adminmodus.
export const canEdit = (item) => Boolean(item?.can_edit) || actsAsAdmin(item);
