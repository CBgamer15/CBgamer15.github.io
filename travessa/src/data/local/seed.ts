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

/** A handful of lunch orders already served today, so the dashboard is never empty. */
function lunchService(): LocalDb['orders'] {
  const rand = rng(1987)
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const orderable = dishes.filter((d) => d.isAvailable)
  const today = new Date()
  const orders: LocalDb['orders'] = []
  const minutesOfDay = [12 * 60 + 14, 12 * 60 + 31, 12 * 60 + 48, 13 * 60 + 5, 13 * 60 + 22, 13 * 60 + 40, 14 * 60 + 2]
  const nowMinutes = today.getHours() * 60 + today.getMinutes()

  minutesOfDay
    .filter((m) => m < nowMinutes - 45)
    .forEach((m, i) => {
      const created = new Date(today)
      created.setHours(Math.floor(m / 60), m % 60, 0, 0)
      const table = pick(tables)
      const lines = 2 + Math.floor(rand() * 3)
      const items: OrderItem[] = Array.from({ length: lines }, (_, j) => {
        const dish = pick(orderable)
        const { unitCents, snapshot } = priceLine(dish, defaultSelection(dish))
        const quantity = 1 + Math.floor(rand() * 2)
        return {
          id: `seed-${i}-${j}`,
          dishId: dish.id,
          name: dish.name,
          unitPriceCents: unitCents,
          quantity,
          options: snapshot,
          lineTotalCents: unitCents * quantity,
        }
      })
      const total = items.reduce((s, it) => s + it.lineTotalCents, 0)
      const at = (mins: number) => new Date(created.getTime() + mins * 60000).toISOString()
      orders.push({
        id: `00000000-0000-4000-8000-00000000${(0xe000 + i).toString(16)}`,
        restaurantId: DEMO_RESTAURANT_ID,
        tableId: table.id,
        tableLabel: table.label,
        number: i + 1,
        status: 'served',
        subtotalCents: total,
        totalCents: total,
        currency: 'EUR',
        createdAt: created.toISOString(),
        updatedAt: at(24),
        preparingAt: at(2),
        readyAt: at(17),
        servedAt: at(19),
        items,
        accessToken: `seed-token-${i}`,
      })
    })
  return orders
}

export function buildSeed(): LocalDb {
  const orders = lunchService()
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
  }
}
