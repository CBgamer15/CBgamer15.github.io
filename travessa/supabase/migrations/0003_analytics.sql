-- Phase 3 — Menu analytics.
-- Guests emit anonymous events (per-visit session id, no personal data) through a
-- rate-limited RPC. Orders are recorded server-side by trigger, so revenue and
-- conversion cannot be inflated from the client.

create type menu_event_type as enum ('menu_view', 'dish_view', 'model_view', 'ar_view', 'add_to_cart', 'order_placed', 'ai_query');

create table menu_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references restaurants (id) on delete cascade,
  session_id text not null,
  table_id uuid references restaurant_tables (id) on delete set null,
  type menu_event_type not null,
  dish_id uuid references dishes (id) on delete set null,
  value_cents int,
  created_at timestamptz not null default now()
);
create index on menu_events (restaurant_id, created_at);
create index on menu_events (restaurant_id, type, created_at);
create index on menu_events (session_id, created_at);

alter table menu_events enable row level security;
create policy "members read events" on menu_events for select using (has_restaurant_role(restaurant_id));
-- No insert policy: writes go through track_events() and the orders trigger.

-- p_events: [{ type, dishId? }] (max 25 per call)
create or replace function track_events(p_slug text, p_session text, p_table_token text, p_events jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_restaurant uuid;
  v_table uuid;
begin
  if p_session is null or length(p_session) not between 8 and 64 then return; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) = 0 then return; end if;
  select id into v_restaurant from restaurants where slug = p_slug and is_published;
  if v_restaurant is null then return; end if;
  -- Rate limit per visit: drop silently beyond 300 events / 10 minutes.
  if (select count(*) from menu_events where session_id = p_session and created_at > now() - interval '10 minutes') > 300 then
    return;
  end if;
  if p_table_token is not null then
    select id into v_table from restaurant_tables where restaurant_id = v_restaurant and qr_token = p_table_token;
  end if;

  insert into menu_events (restaurant_id, session_id, table_id, type, dish_id)
  select v_restaurant, p_session, v_table, (e ->> 'type')::menu_event_type,
         (select d.id from dishes d where d.id = (e ->> 'dishId')::uuid and d.restaurant_id = v_restaurant)
  from (select e from jsonb_array_elements(p_events) e limit 25) x
  -- order_placed is written by the server only.
  where e ->> 'type' in ('menu_view', 'dish_view', 'model_view', 'ar_view', 'add_to_cart', 'ai_query');
end $$;
grant execute on function track_events(text, text, text, jsonb) to anon, authenticated;

create or replace function record_order_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into menu_events (restaurant_id, session_id, table_id, type, value_cents, created_at)
  values (new.restaurant_id, coalesce(new.guest_session, 'order:' || new.id), new.table_id, 'order_placed', new.total_cents, new.created_at);
  return new;
end $$;
create trigger orders_event after insert on orders for each row execute function record_order_event();

-- Aggregated report for the dashboard. Same shape as buildReport() in src/domain/analytics.ts.
-- Buckets (day, weekday, hour) use the restaurant's own time zone.
create or replace function restaurant_analytics(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz text;
  result jsonb;
begin
  if not has_restaurant_role(p_restaurant_id) then raise exception 'Sem permissão'; end if;
  select timezone into tz from restaurants where id = p_restaurant_id;

  with ev as (
    select * from menu_events where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to
  ), ord as (
    select * from orders where restaurant_id = p_restaurant_id and status <> 'cancelled' and created_at >= p_from and created_at < p_to
  ), items as (
    select i.dish_id, i.quantity, o.guest_session from order_items i join ord o on o.id = i.order_id
  ), viewed as (
    select distinct dish_id, session_id from ev where type = 'dish_view' and dish_id is not null
  ), viewed3d as (
    select distinct dish_id, session_id from ev where type = 'model_view' and dish_id is not null
  ), ordered as (
    select distinct dish_id, guest_session as session_id from items where dish_id is not null and guest_session is not null
  ), vo as (
    select v.dish_id, v.session_id,
           exists (select 1 from viewed3d m where m.dish_id = v.dish_id and m.session_id = v.session_id) as saw3d,
           exists (select 1 from ordered o where o.dish_id = v.dish_id and o.session_id = v.session_id) as did_order
    from viewed v
  ), dish_ids as (
    select dish_id from ev where dish_id is not null union select dish_id from items where dish_id is not null
  ), dish_stats as (
    select d.id, d.name,
      (select count(*) from ev where ev.type = 'dish_view' and ev.dish_id = d.id) as views,
      (select count(*) from ev where ev.type = 'model_view' and ev.dish_id = d.id) as model_views,
      (select count(*) from ev where ev.type = 'add_to_cart' and ev.dish_id = d.id) as adds,
      coalesce((select sum(quantity) from items where items.dish_id = d.id), 0) as ordered_qty,
      coalesce((select avg(case when did_order then 1.0 else 0.0 end) from vo where vo.dish_id = d.id), 0) as conversion
    from dishes d where d.id in (select dish_id from dish_ids)
  ), m3 as (
    select vo.* from vo join dish_models dm on dm.dish_id = vo.dish_id
  ), days as (
    select generate_series((p_from at time zone tz)::date, ((p_to at time zone tz) - interval '1 second')::date, interval '1 day')::date as day
  ), daily as (
    select days.day,
      (select count(distinct session_id) from ev where (ev.created_at at time zone tz)::date = days.day) as sessions,
      (select count(*) from ord where (ord.created_at at time zone tz)::date = days.day) as orders,
      coalesce((select sum(total_cents) from ord where (ord.created_at at time zone tz)::date = days.day), 0) as revenue
    from days
  ), heat as (
    select w, jsonb_agg(
      (select count(*) from ord where extract(isodow from ord.created_at at time zone tz) - 1 = w
                                  and extract(hour from ord.created_at at time zone tz) = h) order by h) as row
    from generate_series(0, 6) w cross join generate_series(0, 23) h
    group by w
  ), totals as (
    select
      (select count(distinct session_id) from ev) as sessions,
      (select count(distinct session_id) from ev where type = 'order_placed') as order_sessions,
      (select count(*) from ord) as orders,
      (select coalesce(sum(total_cents), 0) from ord) as revenue
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sessions', t.sessions,
    'menuViews', (select count(*) from ev where type = 'menu_view'),
    'dishViews', (select count(*) from ev where type = 'dish_view'),
    'modelViews', (select count(*) from ev where type = 'model_view'),
    'arViews', (select count(*) from ev where type = 'ar_view'),
    'addToCart', (select count(*) from ev where type = 'add_to_cart'),
    'orders', t.orders,
    'revenueCents', t.revenue,
    'avgOrderCents', case when t.orders > 0 then round(t.revenue::numeric / t.orders) else 0 end,
    'conversion', case when t.sessions > 0 then t.order_sessions::float / t.sessions else 0 end,
    'funnel', jsonb_build_array(
      jsonb_build_object('label', 'Abriram o menu', 'sessions', (select count(distinct session_id) from ev where type = 'menu_view')),
      jsonb_build_object('label', 'Viram um prato', 'sessions', (select count(distinct session_id) from ev where type = 'dish_view')),
      jsonb_build_object('label', 'Adicionaram ao pedido', 'sessions', (select count(distinct session_id) from ev where type = 'add_to_cart')),
      jsonb_build_object('label', 'Fizeram o pedido', 'sessions', t.order_sessions)),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(day, 'YYYY-MM-DD'), 'sessions', sessions, 'orders', orders, 'revenueCents', revenue) order by day), '[]') from daily),
    'heat', (select jsonb_agg(row order by w) from heat),
    'dishes', (select coalesce(jsonb_agg(jsonb_build_object(
        'dishId', id, 'name', name, 'views', views, 'modelViews', model_views, 'adds', adds,
        'orderedQty', ordered_qty, 'conversion', conversion) order by ordered_qty desc, views desc), '[]') from dish_stats),
    'model3d', (select case when count(*) = 0 then null else jsonb_build_object(
        'with', coalesce(avg(case when did_order then 1.0 else 0.0 end) filter (where saw3d), 0),
        'without', coalesce(avg(case when did_order then 1.0 else 0.0 end) filter (where not saw3d), 0),
        'sessionsWith', count(*) filter (where saw3d),
        'sessionsWithout', count(*) filter (where not saw3d)) end from m3)
  ) into result
  from totals t;
  return result;
end $$;
revoke all on function restaurant_analytics(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function restaurant_analytics(uuid, timestamptz, timestamptz) to authenticated;
