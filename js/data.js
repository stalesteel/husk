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
