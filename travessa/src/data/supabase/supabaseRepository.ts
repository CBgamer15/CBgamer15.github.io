import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  Category,
  Dish,
  DishModel,
  GuestOrder,
  Member,
  Order,
  OrderStatus,
  PlacedOrder,
  PlaceOrderInput,
  Restaurant,
  RestaurantTable,
  SessionUser,
} from '@/domain/types'
import type { PublicMenu, Repository, ResolvedTable, Unsubscribe } from '../repository'

/* eslint-disable @typescript-eslint/no-explicit-any -- row mappers translate untyped PostgREST rows */

const toRestaurant = (r: any): Restaurant => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  tagline: r.tagline ?? undefined,
  description: r.description ?? undefined,
  cuisine: r.cuisine ?? undefined,
  address: r.address ?? undefined,
  city: r.city ?? undefined,
  phone: r.phone ?? undefined,
  locale: r.locale,
  currency: r.currency,
  timezone: r.timezone,
  brand: r.brand ?? {},
  settings: { orderingEnabled: true, ...(r.settings ?? {}) },
  plan: r.plan,
  isPublished: r.is_published,
  createdAt: r.created_at,
})

const fromRestaurant = (p: Partial<Restaurant>) => {
  const row: Record<string, unknown> = {}
  const map: Record<string, string> = {
    slug: 'slug', name: 'name', tagline: 'tagline', description: 'description', cuisine: 'cuisine',
    address: 'address', city: 'city', phone: 'phone', locale: 'locale', currency: 'currency',
    timezone: 'timezone', brand: 'brand', settings: 'settings', isPublished: 'is_published',
  }
  for (const [k, col] of Object.entries(map)) if (k in p) row[col] = (p as any)[k] ?? null
  return row
}

const toCategory = (r: any): Category => ({
  id: r.id,
  restaurantId: r.restaurant_id,
  name: r.name,
  description: r.description ?? undefined,
  position: r.position,
  isVisible: r.is_visible,
})

const toDish = (r: any): Dish => ({
  id: r.id,
  restaurantId: r.restaurant_id,
  categoryId: r.category_id,
  name: r.name,
  description: r.description ?? undefined,
  priceCents: r.price_cents,
  imageUrl: r.image_url ?? undefined,
  videoUrl: r.video_url ?? undefined,
  allergens: r.allergens ?? [],
  ingredients: r.ingredients ?? [],
  tags: r.tags ?? [],
  options: r.options ?? [],
  pairing: r.pairing ?? undefined,
  prepMinutes: r.prep_minutes ?? undefined,
  model: toModel(Array.isArray(r.dish_models) ? r.dish_models[0] : r.dish_models),
  isAvailable: r.is_available,
  isFeatured: r.is_featured,
  isArchived: r.is_archived,
  position: r.position,
})

const toModel = (m: any): DishModel | undefined =>
  m && m.is_published !== false
    ? { glbUrl: m.glb_url, usdzUrl: m.usdz_url ?? undefined, posterUrl: m.poster_url ?? undefined, scale: m.scale ?? 1, sizeBytes: m.size_bytes ?? undefined }
    : undefined

const fromDish = (d: Omit<Dish, 'id'> & { id?: string }) => ({
  ...(d.id ? { id: d.id } : {}),
  restaurant_id: d.restaurantId,
  category_id: d.categoryId,
  name: d.name,
  description: d.description ?? null,
  price_cents: d.priceCents,
  image_url: d.imageUrl ?? null,
  video_url: d.videoUrl ?? null,
  allergens: d.allergens,
  ingredients: d.ingredients,
  tags: d.tags,
  options: d.options,
  pairing: d.pairing ?? null,
  prep_minutes: d.prepMinutes ?? null,
  is_available: d.isAvailable,
  is_featured: d.isFeatured,
  is_archived: d.isArchived,
  position: d.position,
})

const toTable = (r: any): RestaurantTable => ({
  id: r.id,
  restaurantId: r.restaurant_id,
  label: r.label,
  area: r.area ?? undefined,
  seats: r.seats,
  qrToken: r.qr_token,
  isActive: r.is_active,
  position: r.position,
})

const toOrder = (r: any): Order => ({
  id: r.id,
  restaurantId: r.restaurant_id,
  tableId: r.table_id ?? undefined,
  tableLabel: r.table_label ?? undefined,
  number: r.number,
  status: r.status,
  note: r.note ?? undefined,
  subtotalCents: r.subtotal_cents,
  totalCents: r.total_cents,
  currency: r.currency,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  preparingAt: r.preparing_at ?? undefined,
  readyAt: r.ready_at ?? undefined,
  servedAt: r.served_at ?? undefined,
  cancelledAt: r.cancelled_at ?? undefined,
  items: (r.order_items ?? []).map((i: any) => ({
    id: i.id,
    dishId: i.dish_id ?? undefined,
    name: i.name,
    unitPriceCents: i.unit_price_cents,
    quantity: i.quantity,
    options: i.options ?? [],
    note: i.note ?? undefined,
    lineTotalCents: i.line_total_cents,
  })),
})

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

function ok(res: { error: { message: string } | null }): void {
  if (res.error) throw new Error(res.error.message)
}

const GUEST_POLL_MS = 4000

export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const
  private sb: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey)
  }

  async getSessionUser(): Promise<SessionUser | null> {
    const { data } = await this.sb.auth.getUser()
    const u = data.user
    return u ? { id: u.id, email: u.email ?? '', name: u.user_metadata?.full_name } : null
  }

  onAuthChange(cb: (user: SessionUser | null) => void): Unsubscribe {
    const { data } = this.sb.auth.onAuthStateChange((_e, session) => {
      const u = session?.user
      cb(u ? { id: u.id, email: u.email ?? '', name: u.user_metadata?.full_name } : null)
    })
    return () => data.subscription.unsubscribe()
  }

  async signInWithPassword(email: string, password: string) {
    ok(await this.sb.auth.signInWithPassword({ email, password }))
  }

  async signUp(email: string, password: string, name?: string) {
    ok(await this.sb.auth.signUp({ email, password, options: { data: { full_name: name } } }))
  }

  async signOut() {
    ok(await this.sb.auth.signOut())
  }

  async listMyRestaurants() {
    const user = await this.getSessionUser()
    if (!user) return []
    const rows = check(
      await this.sb.from('restaurant_members').select('restaurants(*)').eq('user_id', user.id),
    ) as any[]
    return rows.map((r) => toRestaurant(r.restaurants))
  }

  async createRestaurant(input: { name: string; slug: string; city?: string }) {
    return toRestaurant(
      check(await this.sb.rpc('create_restaurant', { p_name: input.name, p_slug: input.slug, p_city: input.city ?? null })),
    )
  }

  async updateRestaurant(id: string, patch: Partial<Omit<Restaurant, 'id' | 'createdAt'>>) {
    return toRestaurant(check(await this.sb.from('restaurants').update(fromRestaurant(patch)).eq('id', id).select().single()))
  }

  async listMembers(restaurantId: string): Promise<Member[]> {
    const rows = check(await this.sb.from('restaurant_members').select('user_id, role').eq('restaurant_id', restaurantId)) as any[]
    return rows.map((r) => ({ userId: r.user_id, role: r.role }))
  }

  async getRestaurantBySlug(slug: string) {
    const row = check(await this.sb.from('restaurants').select().eq('slug', slug).maybeSingle())
    return row ? toRestaurant(row) : null
  }

  async listCategories(restaurantId: string) {
    return (check(await this.sb.from('menu_categories').select().eq('restaurant_id', restaurantId).order('position')) as any[]).map(toCategory)
  }

  async saveCategory(c: Omit<Category, 'id'> & { id?: string }) {
    const row = {
      ...(c.id ? { id: c.id } : {}),
      restaurant_id: c.restaurantId,
      name: c.name,
      description: c.description ?? null,
      position: c.position,
      is_visible: c.isVisible,
    }
    return toCategory(check(await this.sb.from('menu_categories').upsert(row).select().single()))
  }

  async deleteCategory(id: string) {
    check(await this.sb.from('menu_categories').delete().eq('id', id))
  }

  async listDishes(restaurantId: string) {
    return (check(await this.sb.from('dishes').select('*, dish_models(*)').eq('restaurant_id', restaurantId).order('position')) as any[]).map(toDish)
  }

  async saveDish(d: Omit<Dish, 'id'> & { id?: string }) {
    return toDish(check(await this.sb.from('dishes').upsert(fromDish(d)).select('*, dish_models(*)').single()))
  }

  async saveDishModel(dish: Pick<Dish, 'id' | 'restaurantId'>, model: DishModel | null) {
    if (!model) {
      check(await this.sb.from('dish_models').delete().eq('dish_id', dish.id))
      return
    }
    check(
      await this.sb.from('dish_models').upsert(
        {
          restaurant_id: dish.restaurantId,
          dish_id: dish.id,
          glb_url: model.glbUrl,
          usdz_url: model.usdzUrl ?? null,
          poster_url: model.posterUrl ?? null,
          scale: model.scale,
          size_bytes: model.sizeBytes ?? null,
        },
        { onConflict: 'dish_id' },
      ),
    )
  }

  async uploadMedia(restaurantId: string, file: File, folder: 'photos' | 'models' | 'brand') {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const path = `${restaurantId}/${folder}/${crypto.randomUUID()}.${ext}`
    check(await this.sb.storage.from('restaurant-media').upload(path, file, { cacheControl: '31536000', upsert: false }))
    return this.sb.storage.from('restaurant-media').getPublicUrl(path).data.publicUrl
  }

  async deleteDish(id: string) {
    check(await this.sb.from('dishes').delete().eq('id', id))
  }

  async listTables(restaurantId: string) {
    return (check(await this.sb.from('restaurant_tables').select().eq('restaurant_id', restaurantId).order('position')) as any[]).map(toTable)
  }

  async saveTable(t: Omit<RestaurantTable, 'id' | 'qrToken'> & { id?: string }) {
    const row = {
      ...(t.id ? { id: t.id } : {}),
      restaurant_id: t.restaurantId,
      label: t.label,
      area: t.area ?? null,
      seats: t.seats,
      is_active: t.isActive,
      position: t.position,
    }
    return toTable(check(await this.sb.from('restaurant_tables').upsert(row).select().single()))
  }

  async rotateTableToken(id: string) {
    const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(9)))).replace(/\+/g, '-').replace(/\//g, '_')
    return toTable(check(await this.sb.from('restaurant_tables').update({ qr_token: token }).eq('id', id).select().single()))
  }

  async deleteTable(id: string) {
    check(await this.sb.from('restaurant_tables').delete().eq('id', id))
  }

  async listOrders(restaurantId: string, opts?: { since?: string; limit?: number }) {
    let q = this.sb.from('orders').select('*, order_items(*)').eq('restaurant_id', restaurantId).order('created_at', { ascending: false })
    if (opts?.since) q = q.gte('created_at', opts.since)
    q = q.limit(opts?.limit ?? 500)
    return (check(await q) as any[]).map(toOrder)
  }

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    check(await this.sb.from('orders').update({ status }).eq('id', orderId))
  }

  subscribeOrders(restaurantId: string, onChange: () => void): Unsubscribe {
    const channel = this.sb
      .channel(`orders:${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, onChange)
      .subscribe()
    return () => void this.sb.removeChannel(channel)
  }

  async getPublicMenu(slug: string): Promise<PublicMenu | null> {
    const restaurant = await this.getRestaurantBySlug(slug)
    if (!restaurant) return null
    const [categories, dishes] = await Promise.all([this.listCategories(restaurant.id), this.listDishes(restaurant.id)])
    return { restaurant, categories, dishes: dishes.filter((d) => !d.isArchived) }
  }

  subscribeMenu(restaurantId: string, onChange: () => void): Unsubscribe {
    const filter = `restaurant_id=eq.${restaurantId}`
    const channel = this.sb
      .channel(`menu:${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes', filter }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dish_models', filter }, onChange)
      .subscribe()
    return () => void this.sb.removeChannel(channel)
  }

  async resolveTable(slug: string, token: string): Promise<ResolvedTable | null> {
    const rows = check(await this.sb.rpc('resolve_table', { p_slug: slug, p_token: token })) as any[]
    const r = rows?.[0]
    return r ? { tableId: r.table_id, label: r.label, area: r.area ?? undefined } : null
  }

  async placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
    const rows = check(
      await this.sb.rpc('place_order', {
        p_slug: input.slug,
        p_token: input.tableToken,
        p_items: input.items,
        p_note: input.note ?? null,
        p_session: input.session ?? null,
      }),
    ) as any[]
    const r = rows[0]
    return { orderId: r.order_id, accessToken: r.access_token, number: r.number }
  }

  async getGuestOrder(orderId: string, accessToken: string): Promise<GuestOrder | null> {
    return (check(await this.sb.rpc('get_guest_order', { p_order_id: orderId, p_access_token: accessToken })) as GuestOrder) ?? null
  }

  // Guests cannot subscribe to the orders table (RLS), so status is polled
  // through the token-checked RPC. Cheap: one small row every few seconds.
  subscribeGuestOrder(orderId: string, accessToken: string, onChange: (o: GuestOrder) => void): Unsubscribe {
    let last = ''
    const tick = async () => {
      const o = await this.getGuestOrder(orderId, accessToken).catch(() => null)
      if (o && o.updatedAt !== last) {
        last = o.updatedAt
        onChange(o)
      }
    }
    const id = window.setInterval(tick, GUEST_POLL_MS)
    return () => window.clearInterval(id)
  }
}
