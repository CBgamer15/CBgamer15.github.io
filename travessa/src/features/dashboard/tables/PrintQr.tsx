import { Navigate, useParams } from 'react-router-dom'
import { useAuth, useRepo } from '@/app/providers'
import { useAsync } from '@/data/hooks'
import { QrCode } from '@/components/QrCode'
import { Button } from '@/components/ui'
import { tableUrl } from './tableUrl'

/** A4 sheet of table cards, 2×3 per page, ready for acrylic stands. */
export default function PrintQr() {
  const { slug = '' } = useParams()
  const repo = useRepo()
  const { user, ready } = useAuth()
  const { data } = useAsync(async () => {
    const restaurant = (await repo.listMyRestaurants()).find((r) => r.slug === slug)
    if (!restaurant) return null
    return { restaurant, tables: (await repo.listTables(restaurant.id)).filter((t) => t.isActive) }
  }, [slug, user?.id])

  if (ready && !user) return <Navigate to="/entrar" replace />
  if (!data) return null

  return (
    <div className="min-h-dvh bg-paper-2 print:bg-white">
      <div className="no-print flex items-center justify-between border-b border-line bg-paper px-6 py-3">
        <p className="text-sm text-ink-2">{data.tables.length} códigos · formato A4, 6 por página</p>
        <Button variant="primary" onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div className="mx-auto grid max-w-[210mm] grid-cols-2 gap-0 bg-white print:max-w-none">
        {data.tables.map((t) => (
          <div key={t.id} className="flex h-[99mm] flex-col items-center justify-center border border-dashed border-line p-6 text-center break-inside-avoid">
            <p className="font-display text-xl">{data.restaurant.name}</p>
            <QrCode value={tableUrl(data.restaurant.slug, t.qrToken)} className="my-4 size-[46mm]" />
            <p className="font-display text-3xl">{t.label}</p>
            <p className="mt-2 text-xs tracking-wide text-ink-2">Aponte a câmara · Veja o menu · Peça à mesa</p>
            <p className="text-[10px] tracking-wide text-mute">Point your camera · Browse the menu · Order</p>
          </div>
        ))}
      </div>
    </div>
  )
}
