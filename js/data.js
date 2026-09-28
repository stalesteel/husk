import { supabase } from './supabase.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lenker med noe annet enn en gyldig id behandles som «finnes ikke».
export const isId = (value) => UUID.test(value ?? '');

// Gruppen med knappene til listene, eller null om den ikke finnes.
export async function getGroup(id) {
  if (!isId(id)) return null;
  const { data, error } = await supabase.rpc('get_group', { p_group_id: id });
  if (error) throw error;
  return data;
}

// Hele listen med steg og bilder, eller null om den ikke finnes.
export async function getList(id) {
  if (!isId(id)) return null;
  const { data, error } = await supabase.rpc('get_list', { p_list_id: id });
  if (error) throw error;
  return data;
}

// Gruppene den innloggede eier eller er redaktør i. Filtreres her fordi en
// administrator får se alle grupper fra databasen.
export async function getMyGroups(userId) {
  const { data, error } = await supabase.from('groups')
    .select('id, name, owner_id, group_editors(user_id)')
    .order('name');
  if (error) throw error;
  return data.filter((group) => group.owner_id === userId
    || group.group_editors.some((editor) => editor.user_id === userId));
}

export async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

// Alle grupper med eierens e-post og antall lister. Bare for administratorer.
export const adminListGroups = () => run(supabase.rpc('admin_list_groups'));

export function imageUrl(path) {
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------------------
// Redigering. Det er tilgangsreglene i databasen som avgjør hva som tillates.
// ---------------------------------------------------------------------------

async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// En endring som ikke traff noen rad, betyr som regel at tilgangen mangler.
async function change(query) {
  const rows = await run(query.select('id'));
  if (!rows.length) throw new Error('Ingen rader ble endret');
  return rows;
}

// Eieren av gruppen, for å vise det bare eieren kan gjøre (slette gruppen).
export async function getGroupOwner(id) {
  const row = await run(supabase.from('groups').select('owner_id').eq('id', id).maybeSingle());
  return row?.owner_id ?? null;
}

export const createGroup = (name) => run(supabase.from('groups')
  .insert({ name })
  .select('id')
  .single());

export const createList = (groupId, title, sortOrder) => run(supabase.from('lists')
  .insert({ group_id: groupId, title, sort_order: sortOrder })
  .select('id')
  .single());

export const updateGroup = (id, fields) => change(supabase.from('groups').update(fields).eq('id', id));
export const deleteGroup = (id) => change(supabase.from('groups').delete().eq('id', id));
export const deleteList = (id) => change(supabase.from('lists').delete().eq('id', id));

// Redaktørene i en gruppe, med e-post og om de ennå ikke har tatt imot
// invitasjonen (invited). Tom for andre enn eieren.
export const getGroupEditors = (groupId) => run(supabase.rpc('get_group_editors', { p_group_id: groupId }));

// Inviterer via Edge Function-en «inviter» (supabase/functions/inviter), som
// legger til en eksisterende bruker, eller sender invitasjon til en ny.
//   invite(email, 'editor', groupId) – redaktør i en gruppe
//   invite(email, 'full')            – full bruker (bare administratorer)
// Gir { invited } (true når det ble sendt e-post), eller kaster en feil med
// en melding som kan vises.
export async function invite(email, role, groupId) {
  const { data, error } = await supabase.functions.invoke('inviter', {
    body: { email, role, group_id: groupId },
  });
  if (!error) return data;
  let message = 'Kunne ikke invitere. Sjekk nettet og prøv igjen.';
  try {
    const body = await error.context.json();
    if (body?.message) message = body.message;
  } catch { /* ingen melding fra funksjonen */ }
  throw new Error(message);
}

// Om den innloggede kan lage grupper (full bruker eller administrator).
export async function canCreateGroups() {
  const { data, error } = await supabase.rpc('can_create_groups');
  return !error && data === true;
}

// Admin-siden
export const adminListUsers = () => run(supabase.rpc('admin_list_users'));
export const adminSetFull = (userId, on) => run(supabase.rpc('admin_set_full', { p_user_id: userId, p_full: on }));
export const adminSetAdmin = (userId, on) => run(supabase.rpc('admin_set_admin', { p_user_id: userId, p_admin: on }));

export const removeGroupEditor = (groupId, userId) => change(supabase.from('group_editors')
  .delete()
  .eq('group_id', groupId)
  .eq('user_id', userId));

// Alle bildefilene i en liste, for å slette dem når listen slettes.
export async function listImagePaths(listId) {
  const list = await getList(listId);
  return list ? list.steps.flatMap((step) => step.images.map((image) => image.path)) : [];
}

export const updateList = (id, fields) => change(supabase.from('lists').update(fields).eq('id', id));
export const updateStep = (id, fields) => change(supabase.from('steps').update(fields).eq('id', id));
export const deleteStep = (id) => change(supabase.from('steps').delete().eq('id', id));
export const updateImage = (id, fields) => change(supabase.from('step_images').update(fields).eq('id', id));
export const deleteImage = (id) => change(supabase.from('step_images').delete().eq('id', id));

export const insertStep = (listId, sortOrder) => run(supabase.from('steps')
  .insert({ list_id: listId, sort_order: sortOrder })
  .select('id, title, description')
  .single());

export const insertImage = (stepId, path, sortOrder) => run(supabase.from('step_images')
  .insert({ step_id: stepId, storage_path: path, sort_order: sortOrder })
  .select('id')
  .single());

// Setter sort_order etter rekkefølgen id-ene står i.
export async function saveOrder(table, ids) {
  await Promise.all(ids.map((id, i) => change(supabase.from(table).update({ sort_order: i + 1 }).eq('id', id))));
}

// Bildene legges i mappen til gruppen, det er slik lagringen vet hvem som har lov.
export async function uploadImage(groupId, blob) {
  const path = `${groupId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('images')
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

// Kalles etter at radene er slettet. Feiler det, blir det bare liggende en
// ubrukt fil igjen, så feilen ignoreres.
export async function removeFiles(paths) {
  if (paths.length) await supabase.storage.from('images').remove(paths);
}
