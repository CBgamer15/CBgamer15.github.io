import { useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import type { MemberRole } from '@/domain/types'
import { Badge, PageHeader } from '@/components/ui'
import { useDashboard } from '../DashboardContext'

const ROLES: Record<MemberRole, { label: string; can: string }> = {
  owner: { label: 'Proprietário', can: 'Tudo, incluindo equipa e faturação.' },
  manager: { label: 'Gerente', can: 'Menu, mesas, pedidos e definições.' },
  staff: { label: 'Sala', can: 'Pedidos e disponibilidade dos pratos.' },
  kitchen: { label: 'Cozinha', can: 'Ecrã da cozinha e disponibilidade.' },
}

export function TeamPage() {
  const repo = useRepo()
  const { restaurant } = useDashboard()
  const { data: members = [] } = useAsync(() => repo.listMembers(restaurant.id), [restaurant.id])

  return (
    <div className="space-y-8">
      <PageHeader title="Equipa" description="Quem tem acesso a este restaurante e o que pode fazer." />
      <ul className="divide-y divide-line border border-line bg-surface">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-4 px-5 py-3.5">
            <span className="grid size-9 place-items-center rounded-full bg-paper-2 text-sm font-medium">
              {(m.name ?? m.email ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium">{m.name ?? m.email ?? m.userId.slice(0, 8)}</p>
              {m.email && <p className="text-xs text-mute">{m.email}</p>}
            </div>
            <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{ROLES[m.role].label}</Badge>
          </li>
        ))}
      </ul>
      <section>
        <h2 className="font-display text-xl">Perfis de acesso</h2>
        <dl className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-2">
          {Object.values(ROLES).map((r) => (
            <div key={r.label} className="bg-surface px-5 py-4">
              <dt className="text-sm font-medium">{r.label}</dt>
              <dd className="mt-0.5 text-sm text-ink-2">{r.can}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-mute">Convites por email chegam com a ligação ao Supabase Auth em produção. Permissões aplicadas na base de dados (Row Level Security).</p>
      </section>
    </div>
  )
}
