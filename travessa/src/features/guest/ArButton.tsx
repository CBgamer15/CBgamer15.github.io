import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Dish } from '@/domain/types'
import { IconAr, IconClose } from '@/components/icons'
import { currentEnv, detectArMode, dishLink, iosNeedsSafari, quickLookHref, sceneViewerHref } from './ar'
import { useGuest } from './GuestContext'

// The QR library is only needed on a laptop, so it stays out of the phone's menu bundle.
const QrCode = lazy(() => import('@/components/QrCode').then((m) => ({ default: m.QrCode })))
// In-page camera view (Three.js): fetched only when a guest taps "Ver na minha mesa".
const loadCameraAr = () => import('@/features/three/CameraAr')
const CameraAr = lazy(loadCameraAr)

// Full-screen panels render on <body>: inside the dish sheet (which animates with a
// transform) "fixed" would be clipped to the sheet and the dish would show through.
function Overlay({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="anim-fade fixed inset-0 z-[70] grid place-items-center bg-paper p-6 text-center">
      <button onClick={onClose} className="absolute top-4 right-4 grid size-10 place-items-center rounded-full bg-surface text-ink shadow-sm" aria-label="Fechar">
        <IconClose width={18} height={18} />
      </button>
      {children}
    </div>,
    document.body,
  )
}

const pill = 'flex items-center gap-2 rounded-full bg-paper/95 py-2 pr-4 pl-3 text-sm font-medium whitespace-nowrap text-ink shadow-lg backdrop-blur'

/** "Ver na minha mesa" — opens the phone's native AR viewer at real size. */
export function ArButton({ dish }: { dish: Dish }) {
  const { t, menu, tableToken, track } = useGuest()
  const [handoff, setHandoff] = useState(false)
  const [safariHint, setSafariHint] = useState(false)
  const [copied, setCopied] = useState(false)
  const [camera, setCamera] = useState<{ gyro: boolean } | null>(null)
  const env = useMemo(currentEnv, [])
  const mode = detectArMode(env)
  const needsSafari = iosNeedsSafari(env)
  const model = dish.model

  // iPhone: once the guest opens a dish that has AR, load its USDZ into memory and
  // hand Quick Look a blob: URL. Quick Look ignores the browser cache, so a normal
  // link downloads the model again on every tap; a blob is handed over instantly.
  // Only on iOS Safari and only for the dish being looked at; the menu loads no 3D.
  const usdz = mode === 'quicklook' && !needsSafari ? model?.usdzUrl : undefined
  const [blobUrl, setBlobUrl] = useState<string>()
  useEffect(() => {
    if (!usdz) return
    const ctrl = new AbortController()
    let objectUrl: string | undefined
    void fetch(usdz, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        objectUrl = URL.createObjectURL(new Blob([blob], { type: 'model/vnd.usdz+zip' }))
        setBlobUrl(objectUrl)
      })
      .catch(() => undefined) // falls back to the network link
    return () => {
      ctrl.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setBlobUrl(undefined)
    }
  }, [usdz])

  if (!model) return null

  const onOpen = () => track('ar_view', dish.id)

  if (mode === 'quicklook') {
    const networkHref = quickLookHref(model)
    if (!networkHref) return null
    const href = blobUrl ? `${blobUrl}#allowsContentScaling=0` : networkHref
    // Safari only launches Quick Look for rel="ar" links that contain an image.
    const quickLook = (className: string, label: string) => (
      <a rel="ar" href={href} onClick={onOpen} className={className}>
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="" width={1} height={1} className="absolute size-px opacity-0" />
        <IconAr width={18} height={18} />
        {label}
      </a>
    )
    if (!needsSafari) return quickLook(pill, t.viewAr)

    // Chrome, Brave and in-app browsers on iOS can't reach Quick Look: open the
    // in-page camera view instead. Permissions must be requested inside the tap.
    const link = dishLink(menu.restaurant.slug, tableToken, dish.id)
    const openCamera = async () => {
      onOpen()
      let gyro: boolean
      const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission
      try {
        gyro = req ? (await req()) === 'granted' : 'DeviceOrientationEvent' in window
      } catch {
        gyro = false
      }
      setCamera({ gyro })
    }
    return (
      <>
        <button type="button" onPointerDown={() => void loadCameraAr()} onClick={openCamera} className={pill}>
          <IconAr width={18} height={18} />
          {t.viewAr}
        </button>
        {camera &&
          createPortal(
            <Suspense fallback={<div className="fixed inset-0 z-[80] grid place-items-center bg-black text-sm text-white">{t.camLoading}</div>}>
              <CameraAr
                model={model}
                gyro={camera.gyro}
                labels={{
                  aim: t.camAim,
                  place: t.camPlace,
                  placed: t.camPlaced,
                  lost: t.camLost,
                  flat: t.camFlat,
                  move: t.camMove,
                  noCamera: t.camNoCamera,
                  loading: t.camLoading,
                  close: 'Fechar',
                }}
                onClose={() => setCamera(null)}
                footer={
                  <button
                    type="button"
                    onClick={() => {
                      setCamera(null)
                      setSafariHint(true)
                    }}
                    className="rounded-full bg-black/55 px-4 py-2 text-xs text-white underline-offset-4 backdrop-blur"
                  >
                    {t.camFullAr}
                  </button>
                }
              />
            </Suspense>,
            document.body,
          )}
        {safariHint && (
          <Overlay label={t.arSafariTitle} onClose={() => setSafariHint(false)}>
            <div className="max-w-xs">
              <IconAr width={36} height={36} className="mx-auto text-ink-2" />
              <p className="mt-4 font-display text-xl">{t.arSafariTitle}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.arSafariBody}</p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link)
                    setCopied(true)
                  } catch {
                    window.prompt(t.arSafariCopy, link)
                  }
                }}
                className="mt-5 w-full rounded-lg bg-ink py-3 text-sm font-medium text-paper"
              >
                {copied ? t.arSafariCopied : t.arSafariCopy}
              </button>
              <div className="mt-3 flex justify-center">
                {quickLook('flex items-center gap-2 text-sm text-ink-2 underline underline-offset-4', t.arSafariTryAnyway)}
              </div>
            </div>
          </Overlay>
        )}
      </>
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
        <Overlay label={t.arHandoffTitle} onClose={() => setHandoff(false)}>
          <div>
            <Suspense fallback={<div className="mx-auto size-36" />}>
              <QrCode value={link} className="mx-auto size-36" label={t.arHandoffTitle} />
            </Suspense>
            <p className="mt-4 font-display text-lg">{t.arHandoffTitle}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">{t.arHandoffBody}</p>
          </div>
        </Overlay>
      )}
    </>
  )
}
