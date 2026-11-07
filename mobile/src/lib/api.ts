import { FunctionsHttpError } from '@supabase/supabase-js';

import { PHOTO_BUCKET, supabase } from './supabase';
import { fetchVideoText } from './youtube';
import type { ConvertedRecipe, Ingredient, Meal, MenuItem, Recipe, RecipeSource, RecipeStats, RecipeWithStats } from './types';

const RECIPE_SELECT = '*, author:profiles!recipes_author_id_fkey(display_name)';

function withStats(recipes: Recipe[], stats: RecipeStats[]): RecipeWithStats[] {
  const byId = new Map(stats.map((s) => [s.recipe_id, s]));
  return recipes.map((r) => ({
    ...r,
    stats: byId.get(r.id) ?? { recipe_id: r.id, rating_count: 0, avg_score: 0 },
  }));
}

export async function listRecipes(groupId: string): Promise<RecipeWithStats[]> {
  const [recipes, stats] = await Promise.all([
    supabase.from('recipes').select(RECIPE_SELECT).eq('group_id', groupId).order('created_at', { ascending: false }),
    supabase.from('recipe_stats').select('recipe_id, rating_count, avg_score').eq('group_id', groupId),
  ]);
  if (recipes.error) throw recipes.error;
  if (stats.error) throw stats.error;
  return withStats(recipes.data as Recipe[], stats.data as RecipeStats[]);
}

export async function getRecipe(id: string): Promise<{ recipe: RecipeWithStats; myScore: number | null; timesOnMenu: number }> {
  const { data: userData } = await supabase.auth.getUser();
  const [recipe, stats, mine, menuCount] = await Promise.all([
    supabase.from('recipes').select(RECIPE_SELECT).eq('id', id).single(),
    supabase.from('recipe_stats').select('recipe_id, rating_count, avg_score').eq('recipe_id', id).maybeSingle(),
    supabase.from('recipe_ratings').select('score').eq('recipe_id', id).eq('user_id', userData.user?.id ?? '').maybeSingle(),
    supabase.from('menu_items').select('id', { count: 'exact', head: true }).eq('recipe_id', id),
  ]);
  if (recipe.error) throw recipe.error;
  const [withS] = withStats([recipe.data as Recipe], stats.data ? [stats.data as RecipeStats] : []);
  return { recipe: withS, myScore: mine.data?.score ?? null, timesOnMenu: menuCount.count ?? 0 };
}

export type RecipeInput = {
  group_id: string;
  title: string;
  description: string;
  servings: number | null;
  total_minutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  dietary_tags: string[];
  photo_path: string | null;
  image_url?: string | null;
  video_url: string | null;
  source: RecipeSource;
};

export async function createRecipe(input: RecipeInput): Promise<string> {
  const { data, error } = await supabase.from('recipes').insert(input).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteRecipe(id: string) {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

export async function rateRecipe(recipeId: string, score: number) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('recipe_ratings')
    .upsert({ recipe_id: recipeId, user_id: userData.user!.id, score, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function uploadPhoto(groupId: string, uri: string, mimeType = 'image/jpeg'): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${groupId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await fetch(uri).then((r) => r.arrayBuffer());
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, body, { contentType: mimeType });
  if (error) throw error;
  return path;
}

async function invokeConvert(body: object): Promise<ConvertedRecipe> {
  const { data, error } = await supabase.functions.invoke('convert-recipe', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'The converter had a problem. Try again.');
    }
    throw new Error("Couldn't reach the recipe converter. Check your connection.");
  }
  return data.recipe as ConvertedRecipe;
}

export function convertPhoto(base64: string, mediaType: string) {
  return invokeConvert({ imageBase64: base64, mediaType });
}

export function convertText(text: string) {
  return invokeConvert({ text });
}

export async function convertYoutube(url: string) {
  // Send the description too when this device can read it: the server can
  // then convert from text in seconds instead of watching the video.
  const text = await fetchVideoText(url);
  return invokeConvert({ youtubeUrl: url, title: text?.title, description: text?.description });
}

// --- Weekly menu -----------------------------------------------------------

export async function listMenu(groupId: string, week: string): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*, recipe:recipes(*)')
    .eq('group_id', groupId)
    .eq('week_start', week)
    .order('created_at');
  if (error) throw error;
  return data as MenuItem[];
}

export async function addMenuItem(groupId: string, week: string, day: number, meal: Meal, recipeId: string, servings: number) {
  const { error } = await supabase
    .from('menu_items')
    .insert({ group_id: groupId, week_start: week, day, meal, recipe_id: recipeId, servings });
  if (error) throw error;
}

export async function removeMenuItem(id: string) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}

// --- Groceries --------------------------------------------------------------

export type GroceryExtra = { id: string; name: string; quantity: number; unit: string };

export async function listGroceryState(groupId: string, week: string) {
  const [checks, extras] = await Promise.all([
    supabase.from('grocery_checks').select('item_key').eq('group_id', groupId).eq('week_start', week),
    supabase.from('grocery_extras').select('id, name, quantity, unit').eq('group_id', groupId).eq('week_start', week).order('created_at'),
  ]);
  if (checks.error) throw checks.error;
  if (extras.error) throw extras.error;
  return {
    checked: new Set((checks.data ?? []).map((c) => c.item_key)),
    extras: (extras.data ?? []) as GroceryExtra[],
  };
}

export async function setChecked(groupId: string, week: string, key: string, checked: boolean) {
  if (checked) {
    const { error } = await supabase.from('grocery_checks').upsert({ group_id: groupId, week_start: week, item_key: key });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('grocery_checks')
      .delete()
      .eq('group_id', groupId)
      .eq('week_start', week)
      .eq('item_key', key);
    if (error) throw error;
  }
}

export async function addGroceryExtra(groupId: string, week: string, name: string) {
  const { error } = await supabase.from('grocery_extras').insert({ group_id: groupId, week_start: week, name: name.trim() });
  if (error) throw error;
}

export async function removeGroceryExtra(id: string) {
  const { error } = await supabase.from('grocery_extras').delete().eq('id', id);
  if (error) throw error;
}

// --- Members ----------------------------------------------------------------

export type Member = { user_id: string; role: 'admin' | 'member'; display_name: string };

export async function listMembers(groupId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, profile:profiles(display_name)')
    .eq('group_id', groupId)
    .order('joined_at');
  if (error) throw error;
  return (data as unknown as { user_id: string; role: 'admin' | 'member'; profile: { display_name: string } | null }[]).map(
    (m) => ({ user_id: m.user_id, role: m.role, display_name: m.profile?.display_name || 'Member' }),
  );
}

export async function setMemberRole(groupId: string, userId: string, role: 'admin' | 'member') {
  const { error } = await supabase.from('group_members').update({ role }).eq('group_id', groupId).eq('user_id', userId);
  if (error) throw error;
}
