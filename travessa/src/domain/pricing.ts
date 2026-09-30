import type { Dish, OrderItemSnapshotOption, SelectedOption } from './types'

export class OrderValidationError extends Error {}

/**
 * Resolve a dish + selected options into a unit price and an order snapshot.
 * Same rules as place_order() in SQL; the server is authoritative, this is used
 * for the cart preview and by the local demo data source.
 */
export function priceLine(dish: Dish, selected: SelectedOption[]): { unitCents: number; snapshot: OrderItemSnapshotOption[] } {
  let unitCents = dish.priceCents
  const snapshot: OrderItemSnapshotOption[] = []
  for (const group of dish.options) {
    const sel = selected.find((s) => s.groupId === group.id)
    const ids = sel?.choiceIds ?? []
    if (ids.length < group.min || ids.length > group.max) {
      throw new OrderValidationError(`Opções inválidas para ${dish.name}`)
    }
    for (const choice of group.choices) {
      if (!ids.includes(choice.id)) continue
      unitCents += choice.priceDeltaCents
      snapshot.push({ group: group.name, choice: choice.name, priceDeltaCents: choice.priceDeltaCents })
    }
  }
  return { unitCents, snapshot }
}

/** Default selection: first choice of every required single-choice group. */
export function defaultSelection(dish: Dish): SelectedOption[] {
  return dish.options
    .filter((g) => g.min > 0 && g.choices.length > 0)
    .map((g) => ({ groupId: g.id, choiceIds: g.choices.slice(0, g.min).map((c) => c.id) }))
}

export function selectionIsValid(dish: Dish, selected: SelectedOption[]): boolean {
  try {
    priceLine(dish, selected)
    return true
  } catch {
    return false
  }
}

export function lineKey(dishId: string, options: SelectedOption[], note?: string): string {
  const opts = [...options]
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .map((o) => `${o.groupId}:${[...o.choiceIds].sort().join(',')}`)
    .join('|')
  return `${dishId}#${opts}#${note?.trim() ?? ''}`
}
