import { Link, Navigate } from 'react-router-dom'
import { useAuth, useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import { IconArrowRight } from '@/components/icons'
import { Badge, Button } from '@/components/ui'
import { AuthLayout } from '../auth/AuthLayout'

export default function RestaurantPicker() {
  const repo = useRepo()
  const { user, ready } = useAuth()
  const { data, loading } = useAsync(() => (user ? repo.listMyRestaurants() : Promise.resolve([])), [user?.id])

  if (ready && !user) return <Navigate to="/entrar" replace />
  if (!ready || loading) return <div className="min-h-dvh bg-paper" />
  if (data?.length === 1) return <Navigate to={`/app/${data[0].slug}`} replace />
  if (data?.length === 0) return <Navigate to="/app/novo" replace />

  return (
    <AuthLayout title="Os seus restaurantes" subtitle={user?.email}>
      <ul className="divide-y divide-line border border-line bg-surface">
        {data?.map((r) => (
          <li key={r.id}>
            <Link to={`/app/${r.slug}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-paper">
              <div className="flex-1">
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-mute">{r.city ?? r.slug}</p>
              </div>
              {!r.isPublished && <Badge>Rascunho</Badge>}
              <IconArrowRight width={16} height={16} className="text-mute" />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/app/novo" className="mt-4 block"><Button className="w-full">Adicionar restaurante</Button></Link>
    </AuthLayout>
  )
}
