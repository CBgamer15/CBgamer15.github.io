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

## Phase 2 — 3D food ✅

- [x] `dish_models` table with tenant check trigger, RLS and realtime (`0002_dish_models.sql`)
- [x] "Ver em 3D" on dishes that have a model. The viewer and Three.js are a separate chunk.
      The GLB and the viewer code are requested **only on tap**, which is verified in the
      browser: zero 3D requests while browsing the menu.
- [x] Viewer: orbit, pinch zoom and auto-rotate; studio light formers (no HDR download);
      contact shadows; auto-fit; load progress; error fallback
- [x] 3D badges on menu rows and featured cards
- [x] Dashboard "Modelos 3D": coverage, list, GLB/USDZ/poster/scale editor with live preview,
      file-size check (5 MB mobile budget), direct upload to Supabase Storage
- [x] Three demo models (pastel de nata, pudim Abade de Priscos, pastéis de bacalhau), built
      procedurally as real GLBs by `scripts/models/generate-models.ts`. Production models come
      from photogrammetry and go through the same pipeline.

## Phase 3 — Analytics ✅

- [x] `menu_events` table and a rate-limited `track_events` RPC (`0003_analytics.sql`). The
      guest session ID is anonymous, per visit, and kept in sessionStorage.
- [x] `order_placed` events are written by an orders trigger on the server, so clients cannot
      fake conversions or revenue
- [x] `restaurant_analytics()` aggregates in the restaurant's time zone and is member-only. It
      mirrors `domain/analytics.ts`, which is unit-tested and used by demo mode.
- [x] Dashboard "Análises" shows:
  - KPIs: menu visits, dish views, 3D views, add-to-cart, orders, conversion, AOV, revenue
  - the menu funnel
  - **3D impact** (conversion with vs. without the 3D view)
  - daily visits and orders
  - a peak-hours heatmap
  - a per-dish table with "Muito visto, pouco pedido" flags
- [x] Demo mode seeds 30 days of simulated service, with Mondays closed

## Phase 4 — AI food assistant

- Edge Function with the tenant's menu as the only context
- Output validation against real dish IDs and allergen data
- Guest chat entry point in the menu; queries logged as analytics events

## Phase 5 — AR ✅ (built before Phase 4, on request)

- [x] "Ver na minha mesa" on every dish that has a model. No AR library ships to the guest;
      each platform's native viewer does the work:
  - iPhone/iPad → AR Quick Look (`<a rel="ar">` to the USDZ, `allowsContentScaling=0`)
  - Android → Google Scene Viewer intent (`ar_preferred`, `resizable=false`) with a
    browser fallback
  - laptop → QR hand-off that reopens the same dish (and table) on a phone via `?prato=`
- [x] The models are authored in metres and anchored to horizontal planes, so the dish appears
      at real size on the table
- [x] `generate-models.ts` also exports USDZ. Vertex colours are baked into PNG textures,
      because Quick Look ignores vertex colours. The baked textures were checked in the
      browser against the GLB.
- [x] `ar_view` analytics event; the dashboard shows AR coverage per dish
- [x] `vercel.json` serves `.usdz` as `model/vnd.usdz+zip`, which Quick Look requires
- Not verified here: on-device AR needs a real iPhone or Android phone and a public HTTPS
  URL. See "Try AR on your phone" in the README.

## Phase 6 — Reservations and reviews

- Reservations with capacity by area and turn
- Google Business Profile integration (read and reply)

## Phase 7 — WhatsApp automation and billing

- WhatsApp Business templates (confirmations, review follow-up)
- Stripe subscriptions per organization and plan
- Platform admin console (all tenants, plans, health)
