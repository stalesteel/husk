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

// Gruppene den innloggede eier eller kan redigere.
export async function getMyGroups() {
  const { data, error } = await supabase.from('groups').select('id, name').order('name');
  if (error) throw error;
  return data;
}

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
