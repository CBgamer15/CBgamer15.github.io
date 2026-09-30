# Travessa — Technical architecture

Travessa is a multi-tenant platform that helps restaurants grow through digital tools. The guest
side is a fast mobile web menu, opened from a QR code on the table. The staff side is a
restaurant dashboard. A platform admin layer sits above all tenants.

## 1. Starting point

This repository started as a small static personal site (`index.html`, `about.html`,
`styles.css` and two images at the root). Nothing in it was reused. The product lives
entirely in `travessa/`, so the existing site is unchanged and still served by GitHub Pages.

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript (strict) + Vite | Fast builds and code splitting per surface |
| Styling | Tailwind CSS v4 (CSS-first tokens in `src/index.css`) | One token set for guest and staff UIs |
| Data | Supabase Postgres | Relational tenancy model with Row Level Security |
| Auth | Supabase Auth | Email/password now; magic link and SSO later |
| Files | Supabase Storage (`restaurant-media` bucket) | Photos, video, 3D models; path-scoped by restaurant |
| Realtime | Supabase Realtime (`postgres_changes`) | Kitchen and dashboard updates; live menu availability |
| 3D | Three.js / React Three Fiber (lazy chunk) | Loaded only when a guest taps "Ver em 3D" |
| Tests | Vitest (domain), SQL test suite (RLS), Playwright (E2E smoke) | |

## 3. Application structure

```
travessa/
  src/
    app/            App shell, router, providers (repository + auth)
    domain/         Pure business rules: types, pricing, cart, order state machine (unit-tested)
    data/
      repository.ts       The single interface between the UI and persistence
      supabase/           Production implementation (PostgREST + RPC + Realtime)
      local/              Demo implementation (browser storage + cross-tab events)
      seed/casaDoMar.ts   Demo tenant; also generates supabase/seed.sql
    features/
      guest/        QR menu, dish sheet, cart, live order status (separate bundle)
      dashboard/    Overview, orders, kitchen, tables & QR, menu, team, settings
      auth/, onboarding/, marketing/
    components/     Shared primitives (icons, sheet, drawer, form controls, QR)
    i18n/           Guest UI strings (pt-PT default, en)
  supabase/
    migrations/     Schema, RLS, RPCs (numbered, append-only)
    seed.sql        Generated demo data
    tests/          Plain-Postgres RLS test harness
  scripts/          gen-seed.ts
```

### Bundle boundaries

`App.tsx` lazy-loads each surface. A guest who scans a QR code downloads only the guest bundle
(about 25 kB gzip on top of React). The dashboard, the Supabase client (in demo mode) and
Three.js are separate chunks.

### The repository seam

The UI never calls Supabase directly. It talks to the `Repository` interface in
`src/data/repository.ts`, which has two implementations:

- **`SupabaseRepository`** is used whenever `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
  set. Prices and order placement are enforced by the database.
- **`LocalRepository`** is used when those variables are empty. It keeps state in
  `localStorage` and syncs across tabs with `BroadcastChannel`, so a phone view and a kitchen
  view open side by side stay in sync. It applies the same rules as the SQL functions, using
  the shared `domain/` code. This is what lets the product be demonstrated with no backend.

## 4. Multi-tenancy and security

- **Tenant key.** Every tenant-owned row carries `restaurant_id`.
- **Hierarchy.** An `organizations` row groups `restaurants` (locations), which makes the model
  ready for multi-location groups. Membership is per location through `restaurant_members` with
  one of four roles: `owner`, `manager`, `staff` or `kitchen`.
- **Platform admins** (`platform_admins`) pass every `has_restaurant_role()` check.
- **RLS is enabled on every table.** The two helpers are `is_platform_admin()` and
  `has_restaurant_role(rid, roles[])`.
- **Guests (anon) never touch tenant tables directly.** They read the published menu through
  RLS (`is_published`). They use four `SECURITY DEFINER` RPCs:
  - `resolve_table(slug, token)`: QR token → table label. Tables themselves are never readable,
    because that would leak every QR token.
  - `place_order(slug, token, items, note, session)`: validates the table, availability,
    quantities and option rules, then **computes every price from the database**. A client-sent
    price is ignored.
  - `get_guest_order(order_id, access_token)`: a guest sees only their own order. The random
    access token is held in their browser.
  - `create_restaurant(...)`: creates the organization, the restaurant and the owner membership
    in one step.
- **Triggers:**
  - `stamp_order_status` enforces the order state machine and makes totals and identity
    immutable.
  - `guard_dish_update` lets staff and kitchen roles toggle availability only.
- **Storage.** Writes are allowed only under `<restaurant_id>/…` and only for owners and
  managers. Reads are public, because menu media is public.
- **Secrets.** Only the anon key reaches the browser. Service-role keys and third-party API keys
  (AI, WhatsApp, Google, Stripe) live in Supabase Edge Function secrets. `.env` is gitignored,
  and `.env.example` documents the variables.

`supabase/tests/run.sh` applies every migration to a scratch Postgres and checks the rules above:

- one tenant cannot read or modify another tenant's data;
- anon cannot read QR tokens or orders;
- prices are computed on the server;
- invalid orders are rejected;
- order totals are immutable;
- illegal status jumps fail.

## 5. Order lifecycle

```
received ──► preparing ──► ready ──► served
    │            │           │
    └──► cancelled ◄─────────┘ (ready → preparing allowed: send back)
```

The same table exists in `domain/orderFlow.ts` (UI and demo) and in `stamp_order_status()` (SQL).
Timestamps (`preparing_at`, `ready_at`, `served_at`) feed average prep time now, and SLA analytics
later.

Realtime delivery works as follows:

- **Staff** subscribe to `orders` through `postgres_changes`. RLS filters the rows to their own
  restaurant.
- **Guests** poll `get_guest_order` every 4 seconds. They cannot subscribe to `orders` under RLS,
  and one small RPC per table every few seconds is negligible.
- **Menu availability** is pushed live to guests through `dishes` realtime, for example when a
  dish is marked "Esgotado".

## 6. Integration points (prepared, not yet built)

| Capability | Where it plugs in |
|---|---|
| **3D** (built, Phase 2) | `dish_models` (GLB, USDZ, poster, real-world scale). `features/three/ModelViewer` is a lazy R3F chunk mounted from `DishSheet` only on tap. |
| **AR** | Uses the same `dish_models` row: USDZ opens iOS Quick Look (`rel="ar"`), GLB opens an Android Scene Viewer intent, with WebXR as a fallback. `scale` keeps the dish true to size on the table. |
| **Analytics** | Append-only `menu_events` (menu_view, dish_view, model_view, ar_view, add_to_cart, order_placed, ai_query) written by a rate-limited `track_event` RPC. Rollups are SQL views per restaurant/day. |
| **AI assistant** | Supabase Edge Function `menu-assistant`. It builds context only from the tenant's published menu rows, uses a strict system prompt ("answer only from these dishes; never invent dishes, ingredients, allergens or prices") and validates the output: every dish ID it recommends must exist. The model key is a server secret. |
| **WhatsApp** | Edge Function + WhatsApp Business Cloud API; outbound templates (reservation confirm, review request) with consent flags on `guests`. |
| **Google reviews** | `settings.googleReviewUrl` is already used after "served". Next: Google Business Profile API to read and reply to reviews. No review gating. |
| **Reservations** | `reservations` table (party size, slot, status, guest contact), capacity by area from `restaurant_tables.area`. |
| **Stripe** | Subscription billing per organization (`plan_tier` already on `restaurants`). Later, optional pay-at-table via Payment Intents created by an Edge Function. |
| **Multi-location** | `organizations` → many `restaurants`. The restaurant switcher is already in the dashboard. Org-level roles come later. |
| **i18n** | Guest UI dictionaries in `src/i18n`. A `translations jsonb` column on categories and dishes holds restaurant content. |

## 7. Design system

- **Palette.** A single warm-paper palette with ink text; tokens are in `src/index.css`.
- **Guest UI.** Each restaurant supplies one accent colour and a cover photo. The display serif
  is Fraunces, the text is Inter, and dish photography carries the page. Sheets slide up from
  the bottom. Motion is limited to fades and rises and respects `prefers-reduced-motion`.
- **Dashboard.** Hairline borders, small radii, no gradients or cards-in-cards, and dense tables.
  The kitchen screen uses large type with one-tap actions, late-order colouring and an audio
  chime.
- **Missing photos** render as intentional tonal "plates" rather than broken images.
