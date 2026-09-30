import type { OrderStatus } from '@/domain/types'
import { Badge } from '@/components/ui'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: 'Novo',
  preparing: 'Em preparação',
  ready: 'Pronto',
  served: 'Servido',
  cancelled: 'Cancelado',
}

const TONE = { received: 'brand', preparing: 'warn', ready: 'ok', served: 'neutral', cancelled: 'alert' } as const

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
}

export const NEXT_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  received: 'Começar',
  preparing: 'Marcar pronto',
  ready: 'Marcar servido',
}
