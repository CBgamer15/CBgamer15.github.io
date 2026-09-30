-- Travessa — Phase 1 core schema
-- Multi-tenant: every tenant-owned row carries restaurant_id and is guarded by RLS.
-- Guests (anon) never read or write tenant tables directly; they go through
-- SECURITY DEFINER functions that validate input and compute prices server-side.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type member_role as enum ('owner', 'manager', 'staff', 'kitchen');
create type order_status as enum ('received', 'preparing', 'ready', 'served', 'cancelled');
create type plan_tier as enum ('demo', 'essencial', 'crescimento', 'premium');

-- ---------------------------------------------------------------------------
-- Identity & tenancy
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- A group that owns one or more locations (multi-location ready).
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 48),
  name text not null check (length(name) between 2 and 80),
  tagline text,
  description text,
  cuisine text,
  address text,
  city text,
  phone text,
  locale text not null default 'pt-PT',
  currency char(3) not null default 'EUR',
  timezone text not null default 'Europe/Lisbon',
  -- { accent, logoUrl, coverUrl }
  brand jsonb not null default '{}'::jsonb,
  -- { orderingEnabled, serviceNote, googleReviewUrl, whatsappNumber }
  settings jsonb not null default '{"orderingEnabled": true}'::jsonb,
  plan plan_tier not null default 'demo',
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table restaurant_members (
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (restaurant_id, user_id)
);
create index on restaurant_members (user_id);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  name text not null,
  description text,
  position int not null default 0,
  is_visible boolean not null default true,
  translations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on menu_categories (restaurant_id, position);

create table dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  category_id uuid not null references menu_categories (id) on delete cascade,
  name text not null,
  description text,
  price_cents int not null check (price_cents >= 0),
  image_url text,
  video_url text,
  allergens text[] not null default '{}',   -- EU 14 allergen codes
  ingredients text[] not null default '{}',
  tags text[] not null default '{}',        -- vegetarian, vegan, spicy, signature, ...
  -- [{ id, name, min, max, choices: [{ id, name, priceDeltaCents }] }]
  options jsonb not null default '[]'::jsonb,
  pairing text,                             -- free-text pairing notes, used by the AI assistant
  prep_minutes int,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  is_archived boolean not null default false,
  position int not null default 0,
  translations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on dishes (restaurant_id, category_id, position);

-- ---------------------------------------------------------------------------
-- Tables & QR
-- ---------------------------------------------------------------------------
create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  label text not null,
  area text,
  seats int not null default 2 check (seats > 0),
  -- Unguessable token printed in the QR. Rotating it invalidates printed codes.
  qr_token text not null unique default encode(gen_random_bytes(9), 'base64'),
  is_active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on restaurant_tables (restaurant_id, position);

-- base64 can contain '/' and '+', which are awkward in URLs.
create or replace function url_token() returns text language sql volatile as $$
  select translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_')
$$;
alter table restaurant_tables alter column qr_token set default url_token();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table restaurant_counters (
  restaurant_id uuid primary key references restaurants (id) on delete cascade,
  last_order_number int not null default 0
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  table_id uuid references restaurant_tables (id) on delete set null,
  table_label text,
  number int not null,
  status order_status not null default 'received',
  note text,
  subtotal_cents int not null,
  total_cents int not null,
  currency char(3) not null,
  guest_session text,
  access_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  preparing_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  cancelled_at timestamptz
);
create index on orders (restaurant_id, created_at desc);
create index on orders (restaurant_id, status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  dish_id uuid references dishes (id) on delete set null,
  name text not null,
  unit_price_cents int not null,
  quantity int not null check (quantity between 1 and 50),
  options jsonb not null default '[]'::jsonb,  -- snapshot: [{ group, choice, priceDeltaCents }]
  note text,
  line_total_cents int not null
);
create index on order_items (order_id);

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

create or replace function has_restaurant_role(rid uuid, roles member_role[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin() or exists (
    select 1 from restaurant_members m
    where m.restaurant_id = rid and m.user_id = auth.uid()
      and (roles is null or m.role = any (roles))
  )
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table platform_admins enable row level security;
alter table organizations enable row level security;
alter table restaurants enable row level security;
alter table restaurant_members enable row level security;
alter table menu_categories enable row level security;
alter table dishes enable row level security;
alter table restaurant_tables enable row level security;
alter table restaurant_counters enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "admins read admins" on platform_admins for select using (is_platform_admin());

create policy "members read org" on organizations for select using (
  is_platform_admin() or exists (
    select 1 from restaurants r join restaurant_members m on m.restaurant_id = r.id
    where r.organization_id = organizations.id and m.user_id = auth.uid()
  )
);

-- Published restaurants are public (the guest menu); everything else is member-only.
create policy "public read published" on restaurants for select using (is_published or has_restaurant_role(id));
create policy "managers update" on restaurants for update
  using (has_restaurant_role(id, array['owner', 'manager']::member_role[]))
  with check (has_restaurant_role(id, array['owner', 'manager']::member_role[]));
create policy "admins delete" on restaurants for delete using (is_platform_admin());
-- Inserts go through create_restaurant().

create policy "members read team" on restaurant_members for select using (has_restaurant_role(restaurant_id));
create policy "owners manage team" on restaurant_members for all
  using (has_restaurant_role(restaurant_id, array['owner']::member_role[]))
  with check (has_restaurant_role(restaurant_id, array['owner']::member_role[]));

create policy "public read categories" on menu_categories for select using (
  (is_visible and exists (select 1 from restaurants r where r.id = restaurant_id and r.is_published))
  or has_restaurant_role(restaurant_id)
);
create policy "managers write categories" on menu_categories for all
  using (has_restaurant_role(restaurant_id, array['owner', 'manager']::member_role[]))
  with check (has_restaurant_role(restaurant_id, array['owner', 'manager']::member_role[]));

create policy "public read dishes" on dishes for select using (
  (not is_archived and exists (select 1 from restaurants r where r.id = restaurant_id and r.is_published))
  or has_restaurant_role(restaurant_id)
);
create policy "managers write dishes" on dishes for all
  using (has_restaurant_role(restaurant_id, array['owner', 'manager']::member_role[]))
  with check (has_restaurant_role(restaurant_id, array['owner', 'manager']::member_role[]));
-- Staff can toggle availability ("esgotado") without full menu rights.
create policy "staff toggle availability" on dishes for update
  using (has_restaurant_role(restaurant_id, array['staff', 'kitchen']::member_role[]))
  with check (has_restaurant_role(restaurant_id, array['staff', 'kitchen']::member_role[]));

-- Tables are never publicly readable: that would leak QR tokens. Guests use resolve_table().
create policy "members read tables" on restaurant_tables for select using (has_restaurant_role(restaurant_id));
create policy "managers write tables" on restaurant_tables for all
  using (has_restaurant_role(restaurant_id, array['owner', 'manager']::member_role[]))
  with check (has_restaurant_role(restaurant_id, array['owner', 'manager']::member_role[]));

create policy "members read orders" on orders for select using (has_restaurant_role(restaurant_id));
create policy "members update orders" on orders for update
  using (has_restaurant_role(restaurant_id)) with check (has_restaurant_role(restaurant_id));
create policy "members read order items" on order_items for select using (has_restaurant_role(restaurant_id));
-- Order inserts only through place_order().

-- Guard staff edits: only availability may change for staff/kitchen roles.
create or replace function guard_dish_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if not has_restaurant_role(new.restaurant_id, array['owner', 'manager']::member_role[]) then
    if (to_jsonb(new) - 'is_available' - 'updated_at') <> (to_jsonb(old) - 'is_available' - 'updated_at') then
      raise exception 'Sem permissão para editar este prato';
    end if;
  end if;
  return new;
end $$;
create trigger dishes_guard before update on dishes for each row execute function guard_dish_update();

-- Status transitions + timestamps.
create or replace function stamp_order_status() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'received' and new.status in ('preparing', 'ready', 'cancelled')) or
      (old.status = 'preparing' and new.status in ('ready', 'cancelled')) or
      (old.status = 'ready' and new.status in ('served', 'preparing'))
    ) then
      raise exception 'Transição de estado inválida: % → %', old.status, new.status;
    end if;
    case new.status
      when 'preparing' then new.preparing_at := coalesce(new.preparing_at, now());
      when 'ready' then new.ready_at := now();
      when 'served' then new.served_at := now();
      when 'cancelled' then new.cancelled_at := now();
      else null;
    end case;
  end if;
  -- Money and identity are immutable after placement.
  new.total_cents := old.total_cents;
  new.subtotal_cents := old.subtotal_cents;
  new.restaurant_id := old.restaurant_id;
  new.access_token := old.access_token;
  new.updated_at := now();
  return new;
end $$;
create trigger orders_status before update on orders for each row execute function stamp_order_status();

-- ---------------------------------------------------------------------------
-- RPC: onboarding
-- ---------------------------------------------------------------------------
create or replace function create_restaurant(p_name text, p_slug text, p_city text default null)
returns restaurants
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_restaurant restaurants;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária'; end if;
  insert into organizations (name) values (p_name) returning id into v_org;
  insert into restaurants (organization_id, name, slug, city)
    values (v_org, p_name, p_slug, p_city) returning * into v_restaurant;
  insert into restaurant_members (restaurant_id, user_id, role) values (v_restaurant.id, auth.uid(), 'owner');
  insert into restaurant_counters (restaurant_id) values (v_restaurant.id);
  return v_restaurant;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: guest flow (anon)
-- ---------------------------------------------------------------------------
create or replace function resolve_table(p_slug text, p_token text)
returns table (table_id uuid, label text, area text)
language sql stable security definer set search_path = public as $$
  select t.id, t.label, t.area
  from restaurant_tables t join restaurants r on r.id = t.restaurant_id
  where r.slug = p_slug and r.is_published and t.qr_token = p_token and t.is_active
$$;

-- Prices are computed here from the database, never trusted from the client.
-- p_items: [{ dishId, quantity, note, options: [{ groupId, choiceIds: [] }] }]
create or replace function place_order(p_slug text, p_token text, p_items jsonb, p_note text default null, p_session text default null)
returns table (order_id uuid, access_token uuid, number int)
language plpgsql security definer set search_path = public as $$
declare
  v_restaurant restaurants;
  v_table restaurant_tables;
  v_item jsonb;
  v_dish dishes;
  v_group jsonb;
  v_sel jsonb;
  v_choice jsonb;
  v_qty int;
  v_unit int;
  v_snapshot jsonb;
  v_count int;
  v_subtotal int := 0;
  v_number int;
  v_order orders;
  v_lines jsonb := '[]'::jsonb;
begin
  select * into v_restaurant from restaurants where slug = p_slug and is_published;
  if not found then raise exception 'Restaurante indisponível'; end if;
  if coalesce((v_restaurant.settings ->> 'orderingEnabled')::boolean, true) = false then
    raise exception 'Pedidos à mesa desativados';
  end if;
  select * into v_table from restaurant_tables
    where restaurant_id = v_restaurant.id and qr_token = p_token and is_active;
  if not found then raise exception 'Mesa inválida'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 40 then
    raise exception 'Pedido vazio ou demasiado grande';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_dish from dishes
      where id = (v_item ->> 'dishId')::uuid and restaurant_id = v_restaurant.id
        and is_available and not is_archived;
    if not found then raise exception 'Prato indisponível'; end if;
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'Quantidade inválida'; end if;

    v_unit := v_dish.price_cents;
    v_snapshot := '[]'::jsonb;
    for v_group in select * from jsonb_array_elements(v_dish.options) loop
      select s into v_sel from jsonb_array_elements(coalesce(v_item -> 'options', '[]')) s
        where s ->> 'groupId' = v_group ->> 'id';
      v_count := coalesce(jsonb_array_length(v_sel -> 'choiceIds'), 0);
      if v_count < coalesce((v_group ->> 'min')::int, 0) or v_count > coalesce((v_group ->> 'max')::int, 1) then
        raise exception 'Opções inválidas para %', v_dish.name;
      end if;
      for v_choice in
        select c from jsonb_array_elements(v_group -> 'choices') c
        where c ->> 'id' in (select jsonb_array_elements_text(coalesce(v_sel -> 'choiceIds', '[]')))
      loop
        v_unit := v_unit + coalesce((v_choice ->> 'priceDeltaCents')::int, 0);
        v_snapshot := v_snapshot || jsonb_build_object(
          'group', v_group ->> 'name', 'choice', v_choice ->> 'name',
          'priceDeltaCents', coalesce((v_choice ->> 'priceDeltaCents')::int, 0));
      end loop;
    end loop;

    v_subtotal := v_subtotal + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'dishId', v_dish.id, 'name', v_dish.name, 'unit', v_unit, 'qty', v_qty,
      'options', v_snapshot, 'note', left(v_item ->> 'note', 200));
  end loop;

  insert into restaurant_counters (restaurant_id) values (v_restaurant.id) on conflict do nothing;
  update restaurant_counters set last_order_number = last_order_number + 1
    where restaurant_id = v_restaurant.id returning last_order_number into v_number;

  insert into orders (restaurant_id, table_id, table_label, number, note, subtotal_cents, total_cents, currency, guest_session)
    values (v_restaurant.id, v_table.id, v_table.label, v_number, left(p_note, 300), v_subtotal, v_subtotal, v_restaurant.currency, left(p_session, 64))
    returning * into v_order;

  insert into order_items (order_id, restaurant_id, dish_id, name, unit_price_cents, quantity, options, note, line_total_cents)
  select v_order.id, v_restaurant.id, (l ->> 'dishId')::uuid, l ->> 'name', (l ->> 'unit')::int, (l ->> 'qty')::int,
         l -> 'options', l ->> 'note', (l ->> 'unit')::int * (l ->> 'qty')::int
  from jsonb_array_elements(v_lines) l;

  return query select v_order.id, v_order.access_token, v_order.number;
end $$;

create or replace function get_guest_order(p_order_id uuid, p_access_token uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'tableLabel', o.table_label,
    'totalCents', o.total_cents, 'currency', o.currency, 'note', o.note,
    'createdAt', o.created_at, 'updatedAt', o.updated_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'name', i.name, 'quantity', i.quantity, 'unitPriceCents', i.unit_price_cents,
      'options', i.options, 'note', i.note, 'lineTotalCents', i.line_total_cents))
      from order_items i where i.order_id = o.id), '[]'::jsonb))
  from orders o where o.id = p_order_id and o.access_token = p_access_token
$$;

revoke all on function place_order(text, text, jsonb, text, text) from public;
grant execute on function place_order(text, text, jsonb, text, text) to anon, authenticated;
grant execute on function resolve_table(text, text) to anon, authenticated;
grant execute on function get_guest_order(uuid, uuid) to anon, authenticated;
revoke all on function create_restaurant(text, text, text) from public, anon;
grant execute on function create_restaurant(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: staff dashboards subscribe to orders (RLS applies to realtime).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
-- Guests receive live availability changes (RLS limits them to published menus).
alter publication supabase_realtime add table dishes;

-- ---------------------------------------------------------------------------
-- Storage: public-read media, writes scoped to "<restaurant_id>/..." by managers.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('restaurant-media', 'restaurant-media', true)
  on conflict (id) do nothing;

create policy "media public read" on storage.objects for select using (bucket_id = 'restaurant-media');
create policy "media managers write" on storage.objects for insert with check (
  bucket_id = 'restaurant-media'
  and has_restaurant_role(((storage.foldername(name))[1])::uuid, array['owner', 'manager']::member_role[])
);
create policy "media managers delete" on storage.objects for delete using (
  bucket_id = 'restaurant-media'
  and has_restaurant_role(((storage.foldername(name))[1])::uuid, array['owner', 'manager']::member_role[])
);
