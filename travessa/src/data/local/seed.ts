import type { OrderItem } from '@/domain/types'
import { priceLine, defaultSelection } from '@/domain/pricing'
import { casaDoMar, categories, dishes, tables, DEMO_RESTAURANT_ID } from '../seed/casaDoMar'
import type { LocalDb } from './localRepository'

export const DEMO_USER = {
  id: '00000000-0000-4000-8000-0000000005e1',
  email: 'demo@travessa.pt',
  name: 'Rita Almeida',
  password: 'casadomar',
  // sha256('casadomar')
  passwordHash: 'c978a18f9d3392029fedb8dc2521e11ecc0d7047c03cc4c56538cd8325b306cc',
}

// Deterministic PRNG so every reset produces the same service history.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/**
 * Thirty days of plausible service at Casa do Mar (closed on Mondays): guest
 * visits, dish views, 3D views, carts and served orders, so the dashboard and
 * analytics tell a story on first open. Deterministic for a given day.
 */
function serviceHistory(): { orders: LocalDb['orders']; events: LocalDb['events'] } {
  const rand = rng(1987)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const orderable = dishes.filter((d) => d.isAvailable)
  const weight = (d: (typeof dishes)[number]) =>
    1 + (d.isFeatured ? 2.5 : 0) + (d.tags.includes('popular') ? 2 : 0) + (d.tags.includes('signature') ? 1 : 0) + (d.model ? 1 : 0)
  const totalWeight = orderable.reduce((s, d) => s + weight(d), 0)
  const weightedDish = () => {
    let r = rand() * totalWeight
    for (const d of orderable) if ((r -= weight(d)) <= 0) return d
    return orderable[0]
  }
  const drinks = orderable.filter((d) => d.categoryId === categories[5].id)
  const perWeekday = [0, 24, 27, 30, 42, 50, 38] // Mon closed … Sun (index = Mon-based weekday)

  const now = new Date()
  const orders: LocalDb['orders'] = []
  const events: LocalDb['events'] = []
  const ev = (type: LocalDb['events'][number]['type'], at: Date, session: string, dishId?: string, valueCents?: number) =>
    events.push({ restaurantId: DEMO_RESTAURANT_ID, type, at: at.toISOString(), session, dishId, valueCents })

  for (let back = 29; back >= 0; back--) {
    const day = new Date(now)
    day.setDate(day.getDate() - back)
    day.setHours(0, 0, 0, 0)
    const weekday = (day.getDay() + 6) % 7
    const visits = Math.round(perWeekday[weekday] * (0.85 + rand() * 0.3))
    for (let v = 0; v < visits; v++) {
      const dinner = rand() < 0.56
      const startMin = dinner ? 19 * 60 + 10 + rand() * 200 : 12 * 60 + 10 + rand() * 150
      const start = new Date(day.getTime() + startMin * 60000)
      if (start.getTime() > now.getTime() - 40 * 60000) continue
      const session = `seed-${back}-${v}`
      const at = (min: number) => new Date(start.getTime() + min * 60000)
      ev('menu_view', at(0), session)

      const viewedCount = 2 + Math.floor(rand() * 5)
      const cart: { dish: (typeof dishes)[number]; qty: number }[] = []
      let t = 0.5
      for (let i = 0; i < viewedCount; i++) {
        const dish = weightedDish()
        t += 0.3 + rand() * 1.2
        ev('dish_view', at(t), session, dish.id)
        let saw3d = false
        if (dish.model && rand() < 0.46) {
          saw3d = true
          ev('model_view', at(t + 0.2), session, dish.id)
        }
        // Guests who spin the dish in 3D add it far more often: the lift the analytics surfaces.
        if (rand() < (saw3d ? 0.62 : 0.31) && !cart.some((c) => c.dish.id === dish.id)) {
          cart.push({ dish, qty: dish.tags.includes('to_share') ? 1 : 1 + Math.floor(rand() * 2) })
          ev('add_to_cart', at(t + 0.4), session, dish.id)
        }
      }
      if (cart.length && rand() < 0.4) {
        const drink = pick(drinks)
        cart.push({ dish: drink, qty: 1 + Math.floor(rand() * 3) })
        ev('dish_view', at(t + 0.6), session, drink.id)
        ev('add_to_cart', at(t + 0.7), session, drink.id)
      }
      if (!cart.length || rand() > 0.8) continue

      const created = at(t + 1.5 + rand() * 3)
      const items: OrderItem[] = cart.map(({ dish, qty }, j) => {
        const { unitCents, snapshot } = priceLine(dish, defaultSelection(dish))
        return { id: `${session}-${j}`, dishId: dish.id, name: dish.name, unitPriceCents: unitCents, quantity: qty, options: snapshot, lineTotalCents: unitCents * qty }
      })
      const total = items.reduce((s, it) => s + it.lineTotalCents, 0)
      const table = pick(tables)
      const plus = (min: number) => new Date(created.getTime() + min * 60000).toISOString()
      const prep = 10 + Math.round(rand() * 12)
      orders.push({
        id: `00000000-0000-4000-9000-${(orders.length + 1).toString(16).padStart(12, '0')}`,
        restaurantId: DEMO_RESTAURANT_ID,
        tableId: table.id,
        tableLabel: table.label,
        number: 0,
        status: 'served',
        subtotalCents: total,
        totalCents: total,
        currency: 'EUR',
        createdAt: created.toISOString(),
        updatedAt: plus(prep + 3),
        preparingAt: plus(1 + Math.round(rand() * 2)),
        readyAt: plus(prep),
        servedAt: plus(prep + 2),
        guestSession: session,
        items,
        accessToken: `seed-token-${orders.length}`,
      })
      ev('order_placed', created, session, undefined, total)
    }
  }
  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((o, i) => (o.number = i + 1))
  events.sort((a, b) => a.at.localeCompare(b.at))
  return { orders, events }
}

export function buildSeed(): LocalDb {
  const { orders, events } = serviceHistory()
  return {
    version: 1,
    users: [{ id: DEMO_USER.id, email: DEMO_USER.email, name: DEMO_USER.name, passwordHash: DEMO_USER.passwordHash }],
    restaurants: [structuredClone(casaDoMar)],
    members: [{ restaurantId: DEMO_RESTAURANT_ID, userId: DEMO_USER.id, role: 'owner' }],
    categories: structuredClone(categories),
    dishes: structuredClone(dishes),
    tables: structuredClone(tables),
    orders,
    counters: { [DEMO_RESTAURANT_ID]: orders.length },
    events,
  }
}
