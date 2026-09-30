import type { Order } from './types'

// Guest behaviour events. Mirrors the menu_event_type enum in SQL.
export const EVENT_TYPES = ['menu_view', 'dish_view', 'model_view', 'ar_view', 'add_to_cart', 'order_placed', 'ai_query'] as const
export type MenuEventType = (typeof EVENT_TYPES)[number]

export interface MenuEvent {
  type: MenuEventType
  at: string // ISO
  session: string
  dishId?: string
  valueCents?: number
}

export interface DishStats {
  dishId: string
  name: string
  views: number
  modelViews: number
  adds: number
  orderedQty: number
  /** Sessions that viewed the dish and then ordered it / sessions that viewed it. */
  conversion: number
}

export interface AnalyticsReport {
  from: string
  to: string
  sessions: number
  menuViews: number
  dishViews: number
  modelViews: number
  arViews: number
  addToCart: number
  orders: number
  revenueCents: number
  avgOrderCents: number
  /** Orders / sessions. */
  conversion: number
  funnel: { label: string; sessions: number }[]
  daily: { day: string; sessions: number; orders: number; revenueCents: number }[]
  /** [weekday 0=Mon..6][hour 0..23] → orders. */
  heat: number[][]
  dishes: DishStats[]
  /** Conversion of 3D-capable dishes when the guest opened the 3D model vs. when they didn't. */
  model3d: { with: number; without: number; sessionsWith: number; sessionsWithout: number } | null
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Build the analytics report from raw events and orders. Local time is the
 * restaurant's (the dashboard runs in the restaurant). The SQL function
 * restaurant_analytics() computes the same shape server-side.
 */
export function buildReport(
  events: MenuEvent[],
  orders: Order[],
  dishNames: Map<string, string>,
  modelDishIds: Set<string>,
  from: Date,
  to: Date,
): AnalyticsReport {
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= from.getTime() && t < to.getTime()
  }
  const ev = events.filter((e) => inRange(e.at))
  const ord = orders.filter((o) => o.status !== 'cancelled' && inRange(o.createdAt))

  const sessionsBy = (type: MenuEventType) => new Set(ev.filter((e) => e.type === type).map((e) => e.session))
  const count = (type: MenuEventType) => ev.filter((e) => e.type === type).length
  const allSessions = new Set(ev.map((e) => e.session))
  const orderSessions = sessionsBy('order_placed')
  const revenue = ord.reduce((s, o) => s + o.totalCents, 0)

  // Daily series, including empty days.
  const daily = new Map<string, { sessions: Set<string>; orders: number; revenueCents: number }>()
  for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) daily.set(dayKey(d), { sessions: new Set(), orders: 0, revenueCents: 0 })
  for (const e of ev) daily.get(dayKey(new Date(e.at)))?.sessions.add(e.session)
  for (const o of ord) {
    const d = daily.get(dayKey(new Date(o.createdAt)))
    if (d) {
      d.orders++
      d.revenueCents += o.totalCents
    }
  }

  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  for (const o of ord) {
    const d = new Date(o.createdAt)
    heat[(d.getDay() + 6) % 7][d.getHours()]++
  }

  // Per-dish: which sessions viewed / opened 3D / ordered each dish.
  const viewed = new Map<string, Set<string>>()
  const viewed3d = new Map<string, Set<string>>()
  const ordered = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, k: string, s: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(s)
  const stats = new Map<string, DishStats>()
  const stat = (id: string) => {
    let s = stats.get(id)
    if (!s) {
      s = { dishId: id, name: dishNames.get(id) ?? 'Prato removido', views: 0, modelViews: 0, adds: 0, orderedQty: 0, conversion: 0 }
      stats.set(id, s)
    }
    return s
  }
  for (const e of ev) {
    if (!e.dishId) continue
    if (e.type === 'dish_view') {
      stat(e.dishId).views++
      add(viewed, e.dishId, e.session)
    } else if (e.type === 'model_view') {
      stat(e.dishId).modelViews++
      add(viewed3d, e.dishId, e.session)
    } else if (e.type === 'add_to_cart') stat(e.dishId).adds++
  }
  // Order lines carry the dish; the order's guest session links it to what that guest viewed.
  for (const o of ord) {
    for (const it of o.items) {
      if (!it.dishId) continue
      stat(it.dishId).orderedQty += it.quantity
      if (o.guestSession) add(ordered, it.dishId, o.guestSession)
    }
  }
  for (const s of stats.values()) {
    const v = viewed.get(s.dishId)
    const o = ordered.get(s.dishId)
    s.conversion = v && v.size ? [...v].filter((x) => o?.has(x)).length / v.size : 0
  }

  // 3D impact: among sessions that viewed a 3D-capable dish, did opening the model change ordering?
  let w = 0, wn = 0, wo = 0, won = 0
  for (const id of modelDishIds) {
    const v = viewed.get(id)
    if (!v) continue
    const m = viewed3d.get(id) ?? new Set()
    const o = ordered.get(id) ?? new Set()
    for (const s of v) {
      if (m.has(s)) {
        wn++
        if (o.has(s)) w++
      } else {
        won++
        if (o.has(s)) wo++
      }
    }
  }

  const funnelStages: [string, Set<string>][] = [
    ['Abriram o menu', sessionsBy('menu_view')],
    ['Viram um prato', sessionsBy('dish_view')],
    ['Adicionaram ao pedido', sessionsBy('add_to_cart')],
    ['Fizeram o pedido', orderSessions],
  ]

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    sessions: allSessions.size,
    menuViews: count('menu_view'),
    dishViews: count('dish_view'),
    modelViews: count('model_view'),
    arViews: count('ar_view'),
    addToCart: count('add_to_cart'),
    orders: ord.length,
    revenueCents: revenue,
    avgOrderCents: ord.length ? Math.round(revenue / ord.length) : 0,
    conversion: allSessions.size ? orderSessions.size / allSessions.size : 0,
    funnel: funnelStages.map(([label, s]) => ({ label, sessions: s.size })),
    daily: [...daily.entries()].map(([day, d]) => ({ day, sessions: d.sessions.size, orders: d.orders, revenueCents: d.revenueCents })),
    heat,
    dishes: [...stats.values()].sort((a, b) => b.orderedQty - a.orderedQty || b.views - a.views),
    model3d: wn + won > 0 ? { with: wn ? w / wn : 0, without: won ? wo / won : 0, sessionsWith: wn, sessionsWithout: won } : null,
  }
}

export function peakOf(heat: number[][]): { weekday: number; hour: number; orders: number } | null {
  let peak: { weekday: number; hour: number; orders: number } | null = null
  heat.forEach((row, weekday) =>
    row.forEach((orders, hour) => {
      if (orders > 0 && (!peak || orders > peak.orders)) peak = { weekday, hour, orders }
    }),
  )
  return peak
}
