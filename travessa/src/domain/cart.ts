import type { CartLine, Dish, SelectedOption } from './types'
import { lineKey, priceLine } from './pricing'

export function addLine(cart: CartLine[], dishId: string, quantity: number, options: SelectedOption[], note?: string): CartLine[] {
  const key = lineKey(dishId, options, note)
  const existing = cart.find((l) => l.key === key)
  if (existing) return cart.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l))
  return [...cart, { key, dishId, quantity, options, note: note?.trim() || undefined }]
}

export function setQuantity(cart: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return cart.filter((l) => l.key !== key)
  return cart.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l))
}

export interface PricedLine extends CartLine {
  dish: Dish
  unitCents: number
  totalCents: number
  optionLabels: string[]
}

/** Price the cart against the current menu. Lines whose dish vanished or sold out are dropped. */
export function priceCart(cart: CartLine[], dishes: Dish[]): { lines: PricedLine[]; totalCents: number; count: number; dropped: number } {
  const byId = new Map(dishes.map((d) => [d.id, d]))
  const lines: PricedLine[] = []
  let dropped = 0
  for (const l of cart) {
    const dish = byId.get(l.dishId)
    if (!dish || !dish.isAvailable || dish.isArchived) {
      dropped++
      continue
    }
    try {
      const { unitCents, snapshot } = priceLine(dish, l.options)
      lines.push({ ...l, dish, unitCents, totalCents: unitCents * l.quantity, optionLabels: snapshot.map((s) => s.choice) })
    } catch {
      dropped++
    }
  }
  return {
    lines,
    totalCents: lines.reduce((s, l) => s + l.totalCents, 0),
    count: lines.reduce((s, l) => s + l.quantity, 0),
    dropped,
  }
}
