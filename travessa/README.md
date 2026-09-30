# Travessa

**A digital growth platform for restaurants.** It turns a traditional restaurant into a modern
digital dining experience: QR menu, ordering at the table, a live kitchen screen, 3D dishes,
an AI food assistant and growth automation. Travessa sets it up for the restaurant as a
managed service.

Demo tenant: **Casa do Mar**, a seafood and grill house in Cascais (pt-PT, EUR).

## Run it

```bash
cd travessa
npm install
npm run dev          # http://localhost:5173
```

With no environment variables, the app runs in **demo mode**. Everything lives in the browser,
and tabs stay in sync with each other. No account or backend is needed.

| URL | What it is |
|---|---|
| `/` | Product page |
| `/demo` | **Sales stage**: the guest phone and the kitchen side by side. Place an order on the phone and watch it arrive in the kitchen. |
| `/m/casa-do-mar/t/Hd2vP9qMx4Ls` | Guest menu at Mesa 3 (what the QR code opens) |
| `/entrar` | Staff login. Use "Entrar na demonstração" (`demo@travessa.pt` / `casadomar`) |
| `/app/casa-do-mar` | Restaurant dashboard |
| `/app/casa-do-mar/cozinha?quiosque=1` | Kitchen screen for a wall tablet |

In demo mode, "Repor demo" (the dashboard banner) restores the original Casa do Mar data.

### Showing it to a restaurant owner (about 3 minutes)

1. Open `/demo` on a laptop.
2. On the phone frame, open a dish and choose options, for example *Bife → Médio + batata frita*.
   Then send the order.
3. The kitchen chimes and the ticket appears. Tap **Começar → Marcar pronto → Marcar servido**.
   The phone updates live and ends with the Google review invitation.
4. Back on the phone, open **Sobremesas → Pastel de nata** and tap **Ver em 3D**. The 3D code
   and the model download only at that moment.
5. Open the dashboard. Under **Menu**, switch *Amêijoas* to "Esgotado", and the guest menu
   updates instantly. Under **Mesas e QR**, print the table cards.

## Connect Supabase

1. Create a Supabase project.
2. Apply the migrations in `supabase/migrations/` in order. You can use the Supabase CLI
   (`supabase db push`) or paste them into the SQL editor.
3. Optionally load the demo data with `supabase/seed.sql`, then add yourself as owner (the
   exact statement is at the top of that file).
4. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Use
   the **anon** key only.
5. Run `npm run dev`. The app detects the variables and switches to Supabase.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test                       # domain unit tests (pricing, cart, order flow, formatting)
npm run build
supabase/tests/run.sh          # migrations + RLS/security checks on a local Postgres
node scripts/gen-seed.ts       # regenerate supabase/seed.sql from the demo seed
node scripts/models/generate-models.ts   # rebuild the demo GLB models in public/models
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md): stack, tenancy and RLS model, data seam, integration points
- [Roadmap](docs/ROADMAP.md): implementation phases and status
