-- Phase 2 — 3D dishes.
-- One model per dish. GLB serves web/Android (and Scene Viewer AR); USDZ serves iOS Quick Look (Phase 5).
-- Files live in the restaurant-media bucket under "<restaurant_id>/models/…".

create table dish_models (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  dish_id uuid not null unique references dishes (id) on delete cascade,
  glb_url text not null,
  usdz_url text,
  poster_url text,
  -- Multiplier on the model's native units (metres) so AR shows the dish at real size.
  scale real not null default 1 check (scale > 0 and scale <= 10),
  size_bytes int,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on dish_models (restaurant_id);

-- A model must belong to the same restaurant as its dish.
create or replace function check_dish_model_tenant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dishes d where d.id = new.dish_id and d.restaurant_id = new.restaurant_id) then
    raise exception 'O prato não pertence a este restaurante';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger dish_models_tenant before insert or update on dish_models
  for each row execute function check_dish_model_tenant();

alter table dish_models enable row level security;

create policy "public read published models" on dish_models for select using (
  (is_published and exists (select 1 from restaurants r where r.id = restaurant_id and r.is_published))
  or has_restaurant_role(restaurant_id)
);
create policy "managers write models" on dish_models for all
  using (has_restaurant_role(restaurant_id, array['owner', 'manager']::member_role[]))
  with check (has_restaurant_role(restaurant_id, array['owner', 'manager']::member_role[]));

alter publication supabase_realtime add table dish_models;
