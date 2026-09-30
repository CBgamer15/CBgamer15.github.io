import { describe, expect, it } from 'vitest'
import { addLine, priceCart, setQuantity } from './cart'
import { canTransition, nextStatus } from './orderFlow'
import { defaultSelection, priceLine, selectionIsValid } from './pricing'
import { dishes } from '@/data/seed/casaDoMar'
import { parseMoneyInput, slugify, formatMoney } from '@/lib/format'

const bife = dishes.find((d) => d.name.startsWith('Bife'))!
const vinho = dishes.find((d) => d.name === 'Soalheiro Alvarinho')!
const polvo = dishes.find((d) => d.name === 'Polvo à lagareiro')!

describe('pricing', () => {
  it('prices a plain dish', () => {
    expect(priceLine(polvo, []).unitCents).toBe(2450)
  })

  it('adds option deltas and snapshots choices', () => {
    const r = priceLine(bife, [
      { groupId: 'ponto', choiceIds: ['medio'] },
      { groupId: 'extra', choiceIds: ['batata-frita', 'salada'] },
    ])
    expect(r.unitCents).toBe(2400 + 350 + 300)
    expect(r.snapshot.map((s) => s.choice)).toEqual(['Médio', 'Batata frita da casa', 'Salada mista'])
  })

  it('rejects missing required choices and too many choices', () => {
    expect(selectionIsValid(bife, [])).toBe(false)
    expect(
      selectionIsValid(bife, [
        { groupId: 'ponto', choiceIds: ['medio'] },
        { groupId: 'extra', choiceIds: ['batata-frita', 'salada', 'arroz'] },
      ]),
    ).toBe(false)
  })

  it('default selection satisfies required groups', () => {
    expect(selectionIsValid(bife, defaultSelection(bife))).toBe(true)
    expect(priceLine(vinho, defaultSelection(vinho)).unitCents).toBe(650)
  })
})

describe('cart', () => {
  it('merges identical lines and splits different options', () => {
    let cart = addLine([], polvo.id, 1, [])
    cart = addLine(cart, polvo.id, 2, [])
    expect(cart).toHaveLength(1)
    expect(cart[0].quantity).toBe(3)
    cart = addLine(cart, vinho.id, 1, [{ groupId: 'formato', choiceIds: ['copo'] }])
    cart = addLine(cart, vinho.id, 1, [{ groupId: 'formato', choiceIds: ['garrafa'] }])
    expect(cart).toHaveLength(3)
  })

  it('totals and drops unavailable dishes', () => {
    let cart = addLine([], polvo.id, 2, [])
    cart = addLine(cart, vinho.id, 1, [{ groupId: 'formato', choiceIds: ['garrafa'] }])
    const priced = priceCart(cart, dishes)
    expect(priced.totalCents).toBe(2 * 2450 + 2800)
    expect(priced.count).toBe(3)
    const soldOut = dishes.map((d) => (d.id === polvo.id ? { ...d, isAvailable: false } : d))
    expect(priceCart(cart, soldOut).dropped).toBe(1)
  })

  it('removes a line at zero quantity', () => {
    const cart = addLine([], polvo.id, 1, [])
    expect(setQuantity(cart, cart[0].key, 0)).toEqual([])
  })
})

describe('order flow', () => {
  it('allows the kitchen path and blocks going backwards from served', () => {
    expect(canTransition('received', 'preparing')).toBe(true)
    expect(canTransition('preparing', 'ready')).toBe(true)
    expect(canTransition('ready', 'served')).toBe(true)
    expect(canTransition('served', 'preparing')).toBe(false)
    expect(canTransition('cancelled', 'received')).toBe(false)
    expect(nextStatus('ready')).toBe('served')
    expect(nextStatus('served')).toBeNull()
  })
})

describe('format', () => {
  it('slugifies Portuguese names', () => {
    expect(slugify('Tasca do Zé — Alfama')).toBe('tasca-do-ze-alfama')
  })
  it('parses euro input', () => {
    expect(parseMoneyInput('12,50')).toBe(1250)
    expect(parseMoneyInput('12.5 €')).toBe(1250)
    expect(parseMoneyInput('abc')).toBeNull()
  })
  it('formats EUR in pt-PT', () => {
    expect(formatMoney(2450).replace(/\s/g, ' ')).toBe('24,50 €')
  })
})
