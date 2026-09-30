import { lazy, Suspense, useMemo, useState } from 'react'
import type { Dish } from '@/domain/types'
import { IconAr, IconClose } from '@/components/icons'
import { detectArMode, dishLink, quickLookHref, sceneViewerHref } from './ar'
import { useGuest } from './GuestContext'

// The QR library is only needed on a laptop, so it stays out of the phone's menu bundle.
const QrCode = lazy(() => import('@/components/QrCode').then((m) => ({ default: m.QrCode })))

const pill = 'flex items-center gap-2 rounded-full bg-paper/95 py-2 pr-4 pl-3 text-sm font-medium whitespace-nowrap text-ink shadow-lg backdrop-blur'

/** "Ver na minha mesa" — opens the phone's native AR viewer at real size. */
export function ArButton({ dish }: { dish: Dish }) {
  const { t, menu, tableToken, track } = useGuest()
  const [handoff, setHandoff] = useState(false)
  const mode = useMemo(detectArMode, [])
  const model = dish.model
  if (!model) return null

  const onOpen = () => track('ar_view', dish.id)

  if (mode === 'quicklook') {
    const href = quickLookHref(model)
    if (!href) return null
    return (
      // Safari only launches Quick Look for rel="ar" links that contain an image.
      <a rel="ar" href={href} onClick={onOpen} className={pill}>
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" width={1} height={1} className="absolute size-px opacity-0" />
        <IconAr width={18} height={18} />
        {t.viewAr}
      </a>
    )
  }

  if (mode === 'scene-viewer') {
    return (
      <a href={sceneViewerHref(model, dish.name, window.location.href)} onClick={onOpen} className={pill}>
        <IconAr width={18} height={18} />
        {t.viewAr}
      </a>
    )
  }

  // Laptop / desktop: continue on a phone.
  const link = dishLink(menu.restaurant.slug, tableToken, dish.id)
  return (
    <>
      <button type="button" onClick={() => setHandoff(true)} className={pill}>
        <IconAr width={18} height={18} />
        {t.viewAr}
      </button>
      {handoff && (
        <div role="dialog" aria-label={t.arHandoffTitle} className="anim-fade fixed inset-0 z-[60] grid place-items-center bg-paper/95 p-6 text-center backdrop-blur">
          <button onClick={() => setHandoff(false)} className="absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-surface text-ink shadow-sm" aria-label="Fechar">
            <IconClose width={18} height={18} />
          </button>
          <div>
            <Suspense fallback={<div className="mx-auto size-36" />}>
              <QrCode value={link} className="mx-auto size-36" label={t.arHandoffTitle} />
            </Suspense>
            <p className="mt-4 font-display text-lg">{t.arHandoffTitle}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">{t.arHandoffBody}</p>
          </div>
        </div>
      )}
    </>
  )
}
