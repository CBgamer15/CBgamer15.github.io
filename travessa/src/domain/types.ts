// Domain model shared by the UI and every data source.
// Mirrors supabase/migrations — camelCase here, snake_case in SQL.

export type MemberRole = 'owner' | 'manager' | 'staff' | 'kitchen'
export type OrderStatus = 'received' | 'preparing' | 'ready' | 'served' | 'cancelled'
export type PlanTier = 'demo' | 'essencial' | 'crescimento' | 'premium'

export interface RestaurantBrand {
  accent?: string
  logoUrl?: string
  coverUrl?: string
}

export interface RestaurantSettings {
  orderingEnabled: boolean
  serviceNote?: string
  googleReviewUrl?: string
  whatsappNumber?: string
}

export interface Restaurant {
  id: string
  slug: string
  name: string
  tagline?: string
  description?: string
  cuisine?: string
  address?: string
  city?: string
  phone?: string
  locale: string
  currency: string
  timezone: string
  brand: RestaurantBrand
  settings: RestaurantSettings
  plan: PlanTier
  isPublished: boolean
  createdAt: string
}

export interface Category {
  id: string
  restaurantId: string
  name: string
  description?: string
  position: number
  isVisible: boolean
}

export interface OptionChoice {
  id: string
  name: string
  priceDeltaCents: number
}

export interface OptionGroup {
  id: string
  name: string
  min: number
  max: number
  choices: OptionChoice[]
}

export interface Dish {
  id: string
  restaurantId: string
  categoryId: string
  name: string
  description?: string
  priceCents: number
  imageUrl?: string
  videoUrl?: string
  allergens: AllergenCode[]
  ingredients: string[]
  tags: DishTag[]
  options: OptionGroup[]
  pairing?: string
  prepMinutes?: number
  isAvailable: boolean
  isFeatured: boolean
  isArchived: boolean
  position: number
}

export interface RestaurantTable {
  id: string
  restaurantId: string
  label: string
  area?: string
  seats: number
  qrToken: string
  isActive: boolean
  position: number
}

export interface SelectedOption {
  groupId: string
  choiceIds: string[]
}

export interface OrderItemSnapshotOption {
  group: string
  choice: string
  priceDeltaCents: number
}

export interface OrderItem {
  id: string
  dishId?: string
  name: string
  unitPriceCents: number
  quantity: number
  options: OrderItemSnapshotOption[]
  note?: string
  lineTotalCents: number
}

export interface Order {
  id: string
  restaurantId: string
  tableId?: string
  tableLabel?: string
  number: number
  status: OrderStatus
  note?: string
  subtotalCents: number
  totalCents: number
  currency: string
  createdAt: string
  updatedAt: string
  preparingAt?: string
  readyAt?: string
  servedAt?: string
  cancelledAt?: string
  items: OrderItem[]
}

/** What a guest may see about their own order. */
export type GuestOrder = Pick<
  Order,
  'id' | 'number' | 'status' | 'tableLabel' | 'totalCents' | 'currency' | 'note' | 'createdAt' | 'updatedAt'
> & { items: Omit<OrderItem, 'id' | 'dishId'>[] }

export interface CartLine {
  key: string
  dishId: string
  quantity: number
  options: SelectedOption[]
  note?: string
}

export interface PlaceOrderInput {
  slug: string
  tableToken: string
  items: { dishId: string; quantity: number; options: SelectedOption[]; note?: string }[]
  note?: string
  session?: string
}

export interface PlacedOrder {
  orderId: string
  accessToken: string
  number: number
}

export interface Member {
  userId: string
  email?: string
  name?: string
  role: MemberRole
}

export interface SessionUser {
  id: string
  email: string
  name?: string
}

// EU Regulation 1169/2011 — the 14 mandatory allergens.
export const ALLERGENS = [
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk',
  'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
] as const
export type AllergenCode = (typeof ALLERGENS)[number]

export const DISH_TAGS = ['signature', 'popular', 'new', 'vegetarian', 'vegan', 'spicy', 'gluten_free', 'light', 'to_share'] as const
export type DishTag = (typeof DISH_TAGS)[number]
