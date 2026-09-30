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

export type Unsubscribe = () => void

export interface PublicMenu {
  restaurant: Restaurant
  categories: Category[]
  dishes: Dish[]
}

export interface ResolvedTable {
  tableId: string
  label: string
  area?: string
}

/**
 * The single seam between UI and persistence. Two implementations:
 *  - SupabaseRepository: production (Postgres + RLS + Realtime)
 *  - LocalRepository: self-contained demo (browser storage + cross-tab events)
 * Future integrations (AI, WhatsApp, Stripe, Google) live in their own services
 * and never reach into the UI directly.
 */
export interface Repository {
  readonly kind: 'supabase' | 'local'

  // Auth
  getSessionUser(): Promise<SessionUser | null>
  onAuthChange(cb: (user: SessionUser | null) => void): Unsubscribe
  signInWithPassword(email: string, password: string): Promise<void>
  signUp(email: string, password: string, name?: string): Promise<void>
  signOut(): Promise<void>

  // Tenancy
  listMyRestaurants(): Promise<Restaurant[]>
  createRestaurant(input: { name: string; slug: string; city?: string }): Promise<Restaurant>
  updateRestaurant(id: string, patch: Partial<Omit<Restaurant, 'id' | 'createdAt'>>): Promise<Restaurant>
  listMembers(restaurantId: string): Promise<Member[]>

  // Menu (staff)
  getRestaurantBySlug(slug: string): Promise<Restaurant | null>
  listCategories(restaurantId: string): Promise<Category[]>
  saveCategory(category: Omit<Category, 'id'> & { id?: string }): Promise<Category>
  deleteCategory(id: string): Promise<void>
  listDishes(restaurantId: string): Promise<Dish[]>
  saveDish(dish: Omit<Dish, 'id'> & { id?: string }): Promise<Dish>
  deleteDish(id: string): Promise<void>
  /** Attach, replace (model) or remove (null) a dish's 3D model. */
  saveDishModel(dish: Pick<Dish, 'id' | 'restaurantId'>, model: DishModel | null): Promise<void>
  /** Upload a media file to tenant storage; returns its public URL. Not available in demo mode. */
  uploadMedia(restaurantId: string, file: File, folder: 'photos' | 'models' | 'brand'): Promise<string>

  // Tables
  listTables(restaurantId: string): Promise<RestaurantTable[]>
  saveTable(table: Omit<RestaurantTable, 'id' | 'qrToken'> & { id?: string }): Promise<RestaurantTable>
  rotateTableToken(id: string): Promise<RestaurantTable>
  deleteTable(id: string): Promise<void>

  // Orders (staff)
  listOrders(restaurantId: string, opts?: { since?: string; limit?: number }): Promise<Order[]>
  updateOrderStatus(orderId: string, status: OrderStatus): Promise<void>
  subscribeOrders(restaurantId: string, onChange: () => void): Unsubscribe

  // Guest (anonymous)
  getPublicMenu(slug: string): Promise<PublicMenu | null>
  /** Fires when the menu changes (e.g. a dish is marked sold out). */
  subscribeMenu(restaurantId: string, onChange: () => void): Unsubscribe
  resolveTable(slug: string, token: string): Promise<ResolvedTable | null>
  placeOrder(input: PlaceOrderInput): Promise<PlacedOrder>
  getGuestOrder(orderId: string, accessToken: string): Promise<GuestOrder | null>
  subscribeGuestOrder(orderId: string, accessToken: string, onChange: (o: GuestOrder) => void): Unsubscribe
}
