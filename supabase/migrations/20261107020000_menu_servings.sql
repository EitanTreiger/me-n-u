-- How many people a planned meal is for. The grocery list scales each
-- recipe's ingredients from the recipe's own servings to this number.
-- NULL means "use the recipe as written".
alter table public.menu_items
  add column if not exists servings int check (servings is null or servings between 1 and 500);
