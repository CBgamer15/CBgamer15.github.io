-- Run after supabase_stub.sql + migrations. Fails loudly on any violation.
\set ON_ERROR_STOP on
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

insert into auth.users values
  ('11111111-1111-1111-1111-111111111111', 'owner@a.pt'),
  ('22222222-2222-2222-2222-222222222222', 'owner@b.pt');

-- Owner A creates a restaurant and its menu.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select id as rid from create_restaurant('Casa A', 'casa-a', 'Lisboa') \gset
insert into menu_categories (restaurant_id, name) values (:'rid', 'Mar') returning id as cid \gset
insert into dishes (restaurant_id, category_id, name, price_cents, options) values
  (:'rid', :'cid', 'Bife', 2400, '[{"id":"ponto","name":"Ponto","min":1,"max":1,"choices":[{"id":"mal","name":"Mal","priceDeltaCents":0}]},{"id":"extra","name":"Extra","min":0,"max":2,"choices":[{"id":"bf","name":"Batata","priceDeltaCents":350}]}]')
  returning id as did \gset
insert into restaurant_tables (restaurant_id, label) values (:'rid', 'Mesa 1') returning qr_token as tok \gset
update restaurants set is_published = true where id = :'rid';

-- Owner B sees nothing of A's private data.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from restaurant_tables) <> 0 then raise exception 'B can see A tables'; end if;
  if (select count(*) from restaurant_members) <> 0 then raise exception 'B can see A team'; end if;
end $$;
update dishes set price_cents = 1 where name = 'Bife';
do $$ begin
  if (select price_cents from dishes where name = 'Bife') <> 2400 then raise exception 'B changed A price'; end if;
end $$;

-- Guest (anon).
reset request.jwt.claim.sub;
set role anon;
do $$ begin
  if (select count(*) from restaurant_tables) <> 0 then raise exception 'anon can read QR tokens'; end if;
  if (select count(*) from dishes) <> 1 then raise exception 'anon cannot read published menu'; end if;
end $$;
select count(*) = 1 as table_resolves from resolve_table('casa-a', :'tok');

-- Client-side price is ignored; server computes 2 × (2400 + 350).
select order_id, access_token from place_order('casa-a', :'tok',
  jsonb_build_array(jsonb_build_object('dishId', :'did', 'quantity', 2, 'priceCents', 1,
    'options', '[{"groupId":"ponto","choiceIds":["mal"]},{"groupId":"extra","choiceIds":["bf"]}]'::jsonb)),
  'sem pressa', 'sess') \gset
do $$ begin
  if (select count(*) from orders) <> 0 then raise exception 'anon can read orders'; end if;
end $$;
select (get_guest_order(:'order_id', :'access_token') ->> 'totalCents')::int = 5500 as server_priced;
select get_guest_order(:'order_id', gen_random_uuid()) is null as wrong_token_hidden;

-- Invalid orders must fail: empty, missing required option, bad table.
select set_config('t.tok', :'tok', false), set_config('t.did', :'did', false) \gset
do $$
declare
  bad jsonb[] := array[
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('dishId', current_setting('t.did'), 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('dishId', current_setting('t.did'), 'quantity', 0,
      'options', '[{"groupId":"ponto","choiceIds":["mal"]}]'::jsonb))
  ];
  b jsonb;
begin
  foreach b in array bad loop
    begin
      perform place_order('casa-a', current_setting('t.tok'), b);
      raise exception 'invalid order accepted: %', b;
    exception when others then
      if sqlerrm like 'invalid order accepted%' then raise; end if;
    end;
  end loop;
  begin
    perform place_order('casa-a', 'not-a-token', jsonb_build_array(jsonb_build_object('dishId', current_setting('t.did'), 'quantity', 1,
      'options', '[{"groupId":"ponto","choiceIds":["mal"]}]'::jsonb)));
    raise exception 'invalid order accepted: bad table';
  exception when others then
    if sqlerrm like 'invalid order accepted%' then raise; end if;
  end;
end $$;

-- Direct insert by anon is blocked.
do $$ begin
  begin
    insert into orders (restaurant_id, number, subtotal_cents, total_cents, currency)
      select id, 99, 0, 0, 'EUR' from restaurants limit 1;
    raise exception 'anon inserted order';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Staff flow: A moves the order through the kitchen; illegal jumps fail.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update orders set status = 'preparing' where id = :'order_id';
update orders set status = 'ready', total_cents = 1 where id = :'order_id';
do $$ begin
  if (select total_cents from orders limit 1) <> 5500 then raise exception 'total was mutable'; end if;
  if (select ready_at from orders limit 1) is null then raise exception 'ready_at not stamped'; end if;
end $$;
update orders set status = 'served' where id = :'order_id';
do $$ begin
  begin
    update orders set status = 'received';
    raise exception 'served → received allowed';
  exception when others then
    if sqlerrm = 'served → received allowed' then raise; end if;
  end;
end $$;
select number, status from orders;

-- Phase 2: dish models are tenant-scoped.
insert into dish_models (restaurant_id, dish_id, glb_url) values (:'rid', :'did', '/models/x.glb');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update dish_models set glb_url = '/evil.glb';
reset request.jwt.claim.sub;
reset role;
do $$ begin
  if exists (select 1 from dish_models where glb_url = '/evil.glb') then raise exception 'B edited A model'; end if;
end $$;
set role anon;
do $$ begin
  if (select count(*) from dish_models) <> 1 then raise exception 'anon cannot read published model'; end if;
end $$;
reset role;
do $$ begin
  begin
    insert into dish_models (restaurant_id, dish_id, glb_url)
      select gen_random_uuid(), id, '/x.glb' from dishes limit 1;
    raise exception 'cross-tenant model accepted';
  exception when others then
    if sqlerrm = 'cross-tenant model accepted' then raise; end if;
  end;
end $$;
\echo ALL RLS CHECKS PASSED
