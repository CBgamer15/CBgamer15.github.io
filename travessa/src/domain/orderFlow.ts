import type { OrderStatus } from './types'

// Mirrors stamp_order_status() in SQL.
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  received: ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'preparing'],
  served: [],
  cancelled: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** The single "next" action a kitchen/floor button should offer. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  switch (status) {
    case 'received': return 'preparing'
    case 'preparing': return 'ready'
    case 'ready': return 'served'
    default: return null
  }
}

export const ACTIVE_STATUSES: OrderStatus[] = ['received', 'preparing', 'ready']

export function isActive(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status)
}
