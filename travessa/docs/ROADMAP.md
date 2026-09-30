# Implementation phases

Each phase ends with these checks green: `npm run build`, `npm run typecheck`, `npm run lint`,
`npm test` and `supabase/tests/run.sh`.

## Phase 1 — Core loop ✅

The goal is a demo that sells: QR → menu → dish → cart → order → kitchen.

- [x] Multi-tenant schema, RLS, guest RPCs, storage policies (`0001_core.sql`)
- [x] Restaurant creation (onboarding), restaurant switcher
- [x] Dashboard shell with role-aware modules
- [x] Menu management: categories (order, visibility), dishes (price, photo, video, allergens,
      ingredients, tags, pairing, prep time, option groups), live "Esgotado" toggle
- [x] Tables, per-table QR codes, token rotation, printable A4 sheet
- [x] Public mobile menu with table identification, featured carousel, scroll-spy categories and
      PT/EN UI
- [x] Cart with options and notes, server-priced order placement
- [x] Live guest order status and a post-meal Google review invitation
- [x] Kitchen display: realtime tickets, chime, late colouring, one-tap status, full-screen and
      kiosk (`?quiosque=1`)
- [x] Orders list with ranges, filters and detail/timeline
- [x] Overview: today's orders, revenue, AOV, prep time, orders per hour, top dishes
- [x] Demo mode (no backend) and the `/demo` sales stage (phone + kitchen side by side)

## Phase 2 — 3D food

- `dish_models` table + storage (`<restaurant_id>/models/…`)
- Dish sheet shows "Ver em 3D" only when a model exists; the viewer chunk loads on tap
- Orbit, pinch zoom and auto-rotate, with a poster image while loading and progress feedback
- Dashboard "Modelos 3D" page: attach GLB/USDZ, scale and preview
- 3D badges on menu rows

## Phase 3 — Analytics

- `menu_events` + `track_event` RPC (rate-limited, anonymous session ID)
- Menu views, dish views, 3D views, AR views, add-to-cart, orders
- Conversion funnel, AOV, popular dishes, peak hours, "viewed but not ordered"

## Phase 4 — AI food assistant

- Edge Function with the tenant's menu as the only context
- Output validation against real dish IDs and allergen data
- Guest chat entry point in the menu; queries logged as analytics events

## Phase 5 — AR

- "Ver na minha mesa": USDZ → iOS Quick Look, GLB → Android Scene Viewer / WebXR
- Real-world scale per model

## Phase 6 — Reservations and reviews

- Reservations with capacity by area and turn
- Google Business Profile integration (read and reply)

## Phase 7 — WhatsApp automation and billing

- WhatsApp Business templates (confirmations, review follow-up)
- Stripe subscriptions per organization and plan
- Platform admin console (all tenants, plans, health)
