import { describe, expect, it } from 'vitest'
import { buildReport, peakOf, type MenuEvent } from './analytics'
import type { Order } from './types'

const day = (h: number, m = 0) => new Date(2026, 8, 25, h, m).toISOString() // Fri 25 Sep 2026

function order(session: string, dishId: string, qty: number, cents: number, at: string, status: Order['status'] = 'served'): Order {
  return {
    id: `o-${session}`, restaurantId: 'r', number: 1, status, subtotalCents: cents, totalCents: cents, currency: 'EUR',
    createdAt: at, updatedAt: at, guestSession: session,
    items: [{ id: 'i', dishId, name: dishId, unitPriceCents: cents / qty, quantity: qty, options: [], lineTotalCents: cents }],
  }
}

describe('buildReport', () => {
  const events: MenuEvent[] = [
    // s1: views nata in 3D, adds, orders
    { type: 'menu_view', at: day(13), session: 's1' },
    { type: 'dish_view', at: day(13, 1), session: 's1', dishId: 'nata' },
    { type: 'model_view', at: day(13, 2), session: 's1', dishId: 'nata' },
    { type: 'add_to_cart', at: day(13, 3), session: 's1', dishId: 'nata' },
    { type: 'order_placed', at: day(13, 5), session: 's1', valueCents: 440 },
    // s2: views nata without 3D, leaves
    { type: 'menu_view', at: day(20), session: 's2' },
    { type: 'dish_view', at: day(20, 1), session: 's2', dishId: 'nata' },
    // s3: out of range
    { type: 'menu_view', at: new Date(2026, 7, 1).toISOString(), session: 's3' },
  ]
  const orders = [order('s1', 'nata', 2, 440, day(13, 5)), order('sx', 'polvo', 1, 2450, day(20, 30), 'cancelled')]
  const r = buildReport(events, orders, new Map([['nata', 'Pastel de nata']]), new Set(['nata']), new Date(2026, 8, 25), new Date(2026, 8, 26))

  it('counts sessions, funnel and conversion within range', () => {
    expect(r.sessions).toBe(2)
    expect(r.funnel.map((f) => f.sessions)).toEqual([2, 2, 1, 1])
    expect(r.conversion).toBe(0.5)
  })

  it('excludes cancelled orders from revenue', () => {
    expect(r.orders).toBe(1)
    expect(r.revenueCents).toBe(440)
    expect(r.avgOrderCents).toBe(440)
  })

  it('computes per-dish conversion and the 3D lift', () => {
    const nata = r.dishes.find((d) => d.dishId === 'nata')!
    expect(nata).toMatchObject({ name: 'Pastel de nata', views: 2, modelViews: 1, adds: 1, orderedQty: 2, conversion: 0.5 })
    expect(r.model3d).toEqual({ with: 1, without: 0, sessionsWith: 1, sessionsWithout: 1 })
  })

  it('buckets orders by weekday and hour and finds the peak', () => {
    expect(r.heat[4][13]).toBe(1) // Friday 13h
    expect(peakOf(r.heat)).toEqual({ weekday: 4, hour: 13, orders: 1 })
    expect(r.daily).toHaveLength(1)
  })
})
