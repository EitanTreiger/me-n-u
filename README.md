# me-n-u — Thresholds ComuniHacks

A mobile app for Thresholds group homes to share recipes, plan weekly menus and shop together.

- **Groups.** Each home (or community) is a group. Whoever creates a group is its admin, and people join with a 6‑letter invite code. Admins can promote other members.
- **Recipes with photos and video.** Type a recipe, **snap a photo** of a recipe card or cookbook page, or **paste a YouTube link**. Gemini converts the photo or video (it watches the video itself, so captions aren't needed) into an editable, structured recipe.
- **Pantry and "what's missing".** Each person keeps a pantry list. Every recipe shows what you have and what you still need to buy.
- **Ratings and consensus ranking.** Everyone rates recipes 1–5 stars. The **Top rated** list uses a Bayesian average, so one 5‑star vote can't outrank twenty 4.6s.
- **Cook for any number of people.** Set "Cooking for" on a recipe (say 10 people for a recipe that serves 2) and every ingredient scales ×5. Amounts are rounded to kitchen-friendly sizes: whole eggs, quarter cups, teaspoons instead of tiny tablespoons.
- **Weekly menu (admins).** Admins plan breakfast, lunch and dinner for each day of any week, and set how many people each meal is for.
- **Grocery list.** Built automatically from the week's menu. Quantities are combined across recipes, items already in your pantry are split out, and admins can add extras. Ticking items off is shared live, and the list can be sent through the share sheet.
- **Dietary tags.** Vegetarian, vegan, gluten‑free, halal and more, used both for filtering and when converting recipes.

Design: minimal and flat, with `#B9D1BD` sage as the primary colour and no gradients.

## Stack

| Part | Tech |
| --- | --- |
| App | Expo SDK 58 + Expo Router (TypeScript), in [`mobile/`](mobile) |
| Backend | Supabase (Postgres + RLS, Auth, Storage, Edge Functions), in [`supabase/`](supabase) |
| AI conversion | Google Gemini (Flash) via the `convert-recipe` Edge Function |

## Setup

### 1. Supabase project

1. Create a free project at <https://supabase.com>.
2. In **SQL Editor**, paste and run each file in [`supabase/migrations/`](supabase/migrations) in order, oldest first:
   - [`20261107000000_init.sql`](supabase/migrations/20261107000000_init.sql) creates the tables, row‑level security, the `recipe-photos` storage bucket and realtime.
   - [`20261107020000_menu_servings.sql`](supabase/migrations/20261107020000_menu_servings.sql) lets each planned meal store how many people it's for.
   - …and the rest in date order. [`20261107070000_profile_avatars.sql`](supabase/migrations/20261107070000_profile_avatars.sql) adds uploaded profile pictures (the `avatars` bucket).
3. For quick testing, go to **Authentication → Providers → Email** and turn off **Confirm email** so new accounts can sign in right away.

### 2. Recipe converter (photo / YouTube → text)

You need a Gemini API key from <https://aistudio.google.com>.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set GEMINI_API_KEY=your-gemini-key
npx supabase functions deploy convert-recipe
```

### 3. Run the app

```bash
cd mobile
cp .env.example .env.local   # then fill in the URL and anon key from Project Settings → API
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone, or press `w` to open it in a browser.

## Project layout

```
mobile/src/app/            screens (Expo Router)
  (tabs)/index.tsx         recipes feed: search, sort, dietary filters
  (tabs)/menu.tsx          weekly menu planner
  (tabs)/groceries.tsx     weekly grocery list
  (tabs)/pantry.tsx        my pantry
  (tabs)/groups.tsx        groups, invite codes, members and roles
  recipe/[id].tsx          recipe detail, rating, have/need ingredients
  recipe/new.tsx           add recipe: type, photo or YouTube
  menu-pick.tsx            admin: put a recipe on the menu
mobile/src/lib/            Supabase client, API calls, ingredient matching, ranking
supabase/migrations/       database schema and security policies
supabase/functions/        convert-recipe Edge Function (Claude)
```
