import type {
  Category,
  Dish,
  DishModel,
  GuestOrder,
  Member,
  MemberRole,
  Order,
  OrderItem,
  OrderStatus,
  PlacedOrder,
  PlaceOrderInput,
  Restaurant,
  RestaurantTable,
  SessionUser,
} from '@/domain/types'
import { canTransition } from '@/domain/orderFlow'
import { OrderValidationError, priceLine } from '@/domain/pricing'
import { uid, urlToken } from '@/lib/ids'
import type { PublicMenu, Repository, ResolvedTable, Unsubscribe } from '../repository'
import { buildSeed, DEMO_USER } from './seed'

/**
 * Demo data source. Runs the full product in one browser with no backend:
 * state lives in localStorage and changes are broadcast across tabs, so a phone
 * view (guest) and a laptop view (kitchen) opened side by side stay in sync.
 * It enforces the same rules as the SQL functions (pricing, transitions, tenancy).
 */

const DB_KEY = 'travessa:demo-db:v2'
const SESSION_KEY = 'travessa:demo-session:v1'
const CHANNEL = 'travessa-demo'

interface LocalUser extends SessionUser {
  passwordHash: string
}

interface StoredOrder extends Order {
  accessToken: string
}

export interface LocalDb {
  version: 1
  users: LocalUser[]
  restaurants: Restaurant[]
  members: { restaurantId: string; userId: string; role: MemberRole }[]
  categories: Category[]
  dishes: Dish[]
  tables: RestaurantTable[]
  orders: StoredOrder[]
  counters: Record<string, number>
}

type Topic = 'db' | 'auth'

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

const clone = <T,>(v: T): T => structuredClone(v)

export class LocalRepository implements Repository {
  readonly kind = 'local' as const
  private listeners = new Set<(topic: Topic) => void>()
  private channel: BroadcastChannel | null = null
  private cache: LocalDb | null = null

  constructor(private storage: Storage = window.localStorage) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL)
      this.channel.onmessage = (e: MessageEvent<Topic>) => {
        this.cache = null
        this.emit(e.data, false)
      }
    }
    window.addEventListener('storage', (e) => {
      if (e.key === DB_KEY) {
        this.cache = null
        this.emit('db', false)
      }
      if (e.key === SESSION_KEY) this.emit('auth', false)
    })
  }

  // --- storage plumbing ----------------------------------------------------

  private read(): LocalDb {
    if (this.cache) return this.cache
    const raw = this.storage.getItem(DB_KEY)
    if (raw) {
      try {
        this.cache = JSON.parse(raw) as LocalDb
        return this.cache
      } catch {
        // fall through and reseed
      }
    }
    this.cache = buildSeed()
    this.storage.setItem(DB_KEY, JSON.stringify(this.cache))
    return this.cache
  }

  private write(mutator: (db: LocalDb) => void): void {
    const db = clone(this.read())
    mutator(db)
    this.cache = db
    this.storage.setItem(DB_KEY, JSON.stringify(db))
    this.emit('db', true)
  }

  private emit(topic: Topic, broadcast: boolean) {
    for (const l of this.listeners) l(topic)
    if (broadcast) this.channel?.postMessage(topic)
  }

  private on(topic: Topic, cb: () => void): Unsubscribe {
    const l = (t: Topic) => t === topic && cb()
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  /** Restore the pristine Casa do Mar demo. */
  resetDemo(): void {
    this.cache = buildSeed()
    this.storage.setItem(DB_KEY, JSON.stringify(this.cache))
    this.emit('db', true)
  }

  private currentUserId(): string | null {
    return this.storage.getItem(SESSION_KEY)
  }

  private requireRole(restaurantId: string, roles?: MemberRole[]): void {
    const userId = this.currentUserId()
    const m = this.read().members.find((x) => x.restaurantId === restaurantId && x.userId === userId)
    if (!m || (roles && !roles.includes(m.role))) throw new Error('Sem permissão')
  }

  // --- auth ----------------------------------------------------------------

  async getSessionUser(): Promise<SessionUser | null> {
    const id = this.currentUserId()
    const u = this.read().users.find((x) => x.id === id)
    return u ? { id: u.id, email: u.email, name: u.name } : null
  }

  onAuthChange(cb: (user: SessionUser | null) => void): Unsubscribe {
    return this.on('auth', () => void this.getSessionUser().then(cb))
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const u = this.read().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || u.passwordHash !== (await sha256(password))) throw new Error('Email ou palavra-passe incorretos')
    this.storage.setItem(SESSION_KEY, u.id)
    this.emit('auth', false)
  }

  async signUp(email: string, password: string, name?: string): Promise<void> {
    const normalized = email.trim().toLowerCase()
    if (this.read().users.some((x) => x.email === normalized)) throw new Error('Já existe uma conta com este email')
    if (password.length < 8) throw new Error('A palavra-passe deve ter pelo menos 8 caracteres')
    const user: LocalUser = { id: uid(), email: normalized, name, passwordHash: await sha256(password) }
    this.write((db) => void db.users.push(user))
    this.storage.setItem(SESSION_KEY, user.id)
    this.emit('auth', false)
  }

  async signOut(): Promise<void> {
    this.storage.removeItem(SESSION_KEY)
    this.emit('auth', false)
  }

  // --- tenancy -------------------------------------------------------------

  async listMyRestaurants(): Promise<Restaurant[]> {
    const userId = this.currentUserId()
    const db = this.read()
    const ids = new Set(db.members.filter((m) => m.userId === userId).map((m) => m.restaurantId))
    return clone(db.restaurants.filter((r) => ids.has(r.id)))
  }

  async createRestaurant(input: { name: string; slug: string; city?: string }): Promise<Restaurant> {
    const userId = this.currentUserId()
    if (!userId) throw new Error('Autenticação necessária')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug) || input.slug.length < 3) throw new Error('Endereço inválido')
    if (this.read().restaurants.some((r) => r.slug === input.slug)) throw new Error('Este endereço já está a ser usado')
    const restaurant: Restaurant = {
      id: uid(),
      slug: input.slug,
      name: input.name.trim(),
      city: input.city,
      locale: 'pt-PT',
      currency: 'EUR',
      timezone: 'Europe/Lisbon',
      brand: {},
      settings: { orderingEnabled: true },
      plan: 'demo',
      isPublished: false,
      createdAt: new Date().toISOString(),
    }
    this.write((db) => {
      db.restaurants.push(restaurant)
      db.members.push({ restaurantId: restaurant.id, userId, role: 'owner' })
      db.counters[restaurant.id] = 0
    })
    return clone(restaurant)
  }

  async updateRestaurant(id: string, patch: Partial<Omit<Restaurant, 'id' | 'createdAt'>>): Promise<Restaurant> {
    this.requireRole(id, ['owner', 'manager'])
    if (patch.slug && this.read().restaurants.some((r) => r.slug === patch.slug && r.id !== id)) {
      throw new Error('Este endereço já está a ser usado')
    }
    let updated!: Restaurant
    this.write((db) => {
      const r = db.restaurants.find((x) => x.id === id)
      if (!r) throw new Error('Restaurante não encontrado')
      Object.assign(r, patch)
      updated = r
    })
    return clone(updated)
  }

  async listMembers(restaurantId: string): Promise<Member[]> {
    this.requireRole(restaurantId)
    const db = this.read()
    return db.members
      .filter((m) => m.restaurantId === restaurantId)
      .map((m) => {
        const u = db.users.find((x) => x.id === m.userId)
        return { userId: m.userId, email: u?.email, name: u?.name, role: m.role }
      })
  }

  // --- menu ----------------------------------------------------------------

  async getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
    const r = this.read().restaurants.find((x) => x.slug === slug)
    return r ? clone(r) : null
  }

  async listCategories(restaurantId: string): Promise<Category[]> {
    return clone(this.read().categories.filter((c) => c.restaurantId === restaurantId)).sort((a, b) => a.position - b.position)
  }

  async saveCategory(input: Omit<Category, 'id'> & { id?: string }): Promise<Category> {
    this.requireRole(input.restaurantId, ['owner', 'manager'])
    const category: Category = { ...input, id: input.id ?? uid() }
    this.write((db) => {
      const i = db.categories.findIndex((c) => c.id === category.id)
      if (i >= 0) db.categories[i] = category
      else db.categories.push(category)
    })
    return clone(category)
  }

  async deleteCategory(id: string): Promise<void> {
    const c = this.read().categories.find((x) => x.id === id)
    if (!c) return
    this.requireRole(c.restaurantId, ['owner', 'manager'])
    this.write((db) => {
      db.categories = db.categories.filter((x) => x.id !== id)
      db.dishes = db.dishes.filter((d) => d.categoryId !== id)
    })
  }

  async listDishes(restaurantId: string): Promise<Dish[]> {
    return clone(this.read().dishes.filter((d) => d.restaurantId === restaurantId)).sort((a, b) => a.position - b.position)
  }

  async saveDish(input: Omit<Dish, 'id'> & { id?: string }): Promise<Dish> {
    const existing = input.id ? this.read().dishes.find((d) => d.id === input.id) : undefined
    const onlyAvailability =
      existing && JSON.stringify({ ...existing, isAvailable: null }) === JSON.stringify({ ...input, id: existing.id, isAvailable: null })
    this.requireRole(input.restaurantId, onlyAvailability ? undefined : ['owner', 'manager'])
    if (input.priceCents < 0) throw new Error('Preço inválido')
    const d: Dish = { ...input, id: input.id ?? uid() }
    this.write((db) => {
      const i = db.dishes.findIndex((x) => x.id === d.id)
      if (i >= 0) db.dishes[i] = d
      else db.dishes.push(d)
    })
    return clone(d)
  }

  async deleteDish(id: string): Promise<void> {
    const d = this.read().dishes.find((x) => x.id === id)
    if (!d) return
    this.requireRole(d.restaurantId, ['owner', 'manager'])
    this.write((db) => void (db.dishes = db.dishes.filter((x) => x.id !== id)))
  }

  async saveDishModel(dish: Pick<Dish, 'id' | 'restaurantId'>, model: DishModel | null): Promise<void> {
    this.requireRole(dish.restaurantId, ['owner', 'manager'])
    this.write((db) => {
      const d = db.dishes.find((x) => x.id === dish.id && x.restaurantId === dish.restaurantId)
      if (!d) throw new Error('Prato não encontrado')
      if (model) d.model = model
      else delete d.model
    })
  }

  async uploadMedia(): Promise<string> {
    throw new Error('O carregamento de ficheiros precisa do Supabase. Em modo demonstração, use um URL.')
  }

  // --- tables --------------------------------------------------------------

  async listTables(restaurantId: string): Promise<RestaurantTable[]> {
    this.requireRole(restaurantId)
    return clone(this.read().tables.filter((t) => t.restaurantId === restaurantId)).sort((a, b) => a.position - b.position)
  }

  async saveTable(input: Omit<RestaurantTable, 'id' | 'qrToken'> & { id?: string }): Promise<RestaurantTable> {
    this.requireRole(input.restaurantId, ['owner', 'manager'])
    const existing = input.id ? this.read().tables.find((t) => t.id === input.id) : undefined
    const t: RestaurantTable = { ...input, id: input.id ?? uid(), qrToken: existing?.qrToken ?? urlToken() }
    this.write((db) => {
      const i = db.tables.findIndex((x) => x.id === t.id)
      if (i >= 0) db.tables[i] = t
      else db.tables.push(t)
    })
    return clone(t)
  }

  async rotateTableToken(id: string): Promise<RestaurantTable> {
    const t = this.read().tables.find((x) => x.id === id)
    if (!t) throw new Error('Mesa não encontrada')
    this.requireRole(t.restaurantId, ['owner', 'manager'])
    const next = { ...t, qrToken: urlToken() }
    this.write((db) => void (db.tables = db.tables.map((x) => (x.id === id ? next : x))))
    return clone(next)
  }

  async deleteTable(id: string): Promise<void> {
    const t = this.read().tables.find((x) => x.id === id)
    if (!t) return
    this.requireRole(t.restaurantId, ['owner', 'manager'])
    this.write((db) => void (db.tables = db.tables.filter((x) => x.id !== id)))
  }

  // --- orders (staff) ------------------------------------------------------

  async listOrders(restaurantId: string, opts?: { since?: string; limit?: number }): Promise<Order[]> {
    this.requireRole(restaurantId)
    let list = this.read().orders.filter((o) => o.restaurantId === restaurantId)
    if (opts?.since) list = list.filter((o) => o.createdAt >= opts.since!)
    list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    if (opts?.limit) list = list.slice(0, opts.limit)
    return list.map(({ accessToken: _t, ...o }) => clone(o))
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    const o = this.read().orders.find((x) => x.id === orderId)
    if (!o) throw new Error('Pedido não encontrado')
    this.requireRole(o.restaurantId)
    if (!canTransition(o.status, status)) throw new Error('Transição de estado inválida')
    const now = new Date().toISOString()
    this.write((db) => {
      const t = db.orders.find((x) => x.id === orderId)!
      t.status = status
      t.updatedAt = now
      if (status === 'preparing') t.preparingAt ??= now
      if (status === 'ready') t.readyAt = now
      if (status === 'served') t.servedAt = now
      if (status === 'cancelled') t.cancelledAt = now
    })
  }

  subscribeOrders(_restaurantId: string, onChange: () => void): Unsubscribe {
    return this.on('db', onChange)
  }

  // --- guest ---------------------------------------------------------------

  async getPublicMenu(slug: string): Promise<PublicMenu | null> {
    const db = this.read()
    const restaurant = db.restaurants.find((r) => r.slug === slug)
    if (!restaurant) return null
    // Unpublished menus are visible to their own team (preview), like RLS.
    const userId = this.currentUserId()
    const isMember = db.members.some((m) => m.restaurantId === restaurant.id && m.userId === userId)
    if (!restaurant.isPublished && !isMember) return null
    return clone({
      restaurant,
      categories: db.categories
        .filter((c) => c.restaurantId === restaurant.id && (c.isVisible || isMember))
        .sort((a, b) => a.position - b.position),
      dishes: db.dishes.filter((d) => d.restaurantId === restaurant.id && !d.isArchived).sort((a, b) => a.position - b.position),
    })
  }

  subscribeMenu(_restaurantId: string, onChange: () => void): Unsubscribe {
    return this.on('db', onChange)
  }

  async resolveTable(slug: string, token: string): Promise<ResolvedTable | null> {
    const db = this.read()
    const r = db.restaurants.find((x) => x.slug === slug)
    const t = r && db.tables.find((x) => x.restaurantId === r.id && x.qrToken === token && x.isActive)
    return t ? { tableId: t.id, label: t.label, area: t.area } : null
  }

  async placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
    const db = this.read()
    const restaurant = db.restaurants.find((r) => r.slug === input.slug)
    if (!restaurant) throw new OrderValidationError('Restaurante indisponível')
    if (!restaurant.settings.orderingEnabled) throw new OrderValidationError('Pedidos à mesa desativados')
    const table = db.tables.find((t) => t.restaurantId === restaurant.id && t.qrToken === input.tableToken && t.isActive)
    if (!table) throw new OrderValidationError('Mesa inválida')
    if (input.items.length === 0 || input.items.length > 40) throw new OrderValidationError('Pedido vazio ou demasiado grande')

    const items: OrderItem[] = input.items.map((line) => {
      const dish = db.dishes.find((d) => d.id === line.dishId && d.restaurantId === restaurant.id && d.isAvailable && !d.isArchived)
      if (!dish) throw new OrderValidationError('Um dos pratos já não está disponível')
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) throw new OrderValidationError('Quantidade inválida')
      const { unitCents, snapshot } = priceLine(dish, line.options)
      return {
        id: uid(),
        dishId: dish.id,
        name: dish.name,
        unitPriceCents: unitCents,
        quantity: line.quantity,
        options: snapshot,
        note: line.note?.slice(0, 200) || undefined,
        lineTotalCents: unitCents * line.quantity,
      }
    })
    const subtotal = items.reduce((s, i) => s + i.lineTotalCents, 0)
    const now = new Date().toISOString()
    const order: StoredOrder = {
      id: uid(),
      restaurantId: restaurant.id,
      tableId: table.id,
      tableLabel: table.label,
      number: 0,
      status: 'received',
      note: input.note?.slice(0, 300) || undefined,
      subtotalCents: subtotal,
      totalCents: subtotal,
      currency: restaurant.currency,
      createdAt: now,
      updatedAt: now,
      items,
      accessToken: uid(),
    }
    this.write((d) => {
      order.number = (d.counters[restaurant.id] ?? 0) + 1
      d.counters[restaurant.id] = order.number
      d.orders.push(order)
    })
    return { orderId: order.id, accessToken: order.accessToken, number: order.number }
  }

  async getGuestOrder(orderId: string, accessToken: string): Promise<GuestOrder | null> {
    const o = this.read().orders.find((x) => x.id === orderId && x.accessToken === accessToken)
    if (!o) return null
    return clone({
      id: o.id,
      number: o.number,
      status: o.status,
      tableLabel: o.tableLabel,
      totalCents: o.totalCents,
      currency: o.currency,
      note: o.note,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      items: o.items.map(({ id: _i, dishId: _d, ...rest }) => rest),
    })
  }

  subscribeGuestOrder(orderId: string, accessToken: string, onChange: (o: GuestOrder) => void): Unsubscribe {
    return this.on('db', () => {
      void this.getGuestOrder(orderId, accessToken).then((o) => o && onChange(o))
    })
  }
}

export { DEMO_USER }
