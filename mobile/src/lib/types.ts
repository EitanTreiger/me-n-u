export type Role = 'admin' | 'member';

export type Group = {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_by: string;
  created_at: string;
};

export type Membership = Group & { role: Role };

/** A home the user belongs to: it has its own menu, groceries, pantry, invite code and admins. */
export type Home = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  /** The user's role in this home. */
  role: Role;
};

export type Ingredient = {
  name: string;
  quantity: number; // 0 when unspecified ("to taste")
  unit: string; // '' for countable items
};

export type RecipeSource = 'manual' | 'photo' | 'youtube';

export type Recipe = {
  id: string;
  group_id: string;
  author_id: string;
  title: string;
  description: string;
  servings: number | null;
  total_minutes: number | null;
  ingredients: Ingredient[];
  steps: string[];
  dietary_tags: string[];
  photo_path: string | null;
  image_url: string | null;
  video_url: string | null;
  step_timestamps: number[] | null; // seconds into the video for each step; -1 = unknown
  source: RecipeSource;
  created_at: string;
  author?: { display_name: string } | null;
};

export type RecipeStats = {
  recipe_id: string;
  rating_count: number;
  avg_score: number;
};

export type RecipeWithStats = Recipe & {
  stats: RecipeStats;
  votes: number; // members who want it on the menu
  myVote: boolean;
};

export type Meal = 'breakfast' | 'lunch' | 'dinner';

export type MenuItem = {
  id: string;
  group_id: string;
  week_start: string;
  day: number;
  meal: Meal;
  recipe_id: string;
  servings: number | null; // people this meal is for; null = as the recipe is written
  recipe?: Recipe | null;
};

export type PantryItem = {
  id: string;
  name: string;
  quantity: number; // 0 = amount not tracked
  unit: string;
  created_at: string;
};

export type ConvertedRecipe = {
  title: string;
  description: string;
  servings: number;
  total_minutes: number;
  ingredients: Ingredient[];
  steps: string[];
  step_times?: number[];
  dietary_tags: string[];
};

export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'dairy-free',
  'nut-free',
  'halal',
  'kosher',
  'low-sodium',
  'diabetic-friendly',
] as const;

export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];
