import type { DishModel } from '@/domain/types'

// "Ver na minha mesa": hand the dish to the phone's native AR viewer.
// No AR library ships to the guest; each platform's own viewer does the work.
//  - iPhone/iPad: AR Quick Look, opened by an <a rel="ar"> link to the USDZ.
//  - Android: Google Scene Viewer, opened by an intent with the GLB URL.
//  - Anything else (laptop): no AR, so we offer a QR code to continue on a phone.

export type ArMode = 'quicklook' | 'scene-viewer' | 'handoff'

export function detectArMode(): ArMode {
  if (typeof document === 'undefined') return 'handoff'
  const a = document.createElement('a')
  if (a.relList?.supports?.('ar')) return 'quicklook'
  if (/android/i.test(navigator.userAgent)) return 'scene-viewer'
  return 'handoff'
}

const absolute = (url: string) => new URL(url, window.location.href).href

/** USDZ link for Quick Look. Content scaling off: the dish stays at real size on the table. */
export function quickLookHref(model: DishModel): string | null {
  return model.usdzUrl ? `${absolute(model.usdzUrl)}#allowsContentScaling=0` : null
}

/**
 * Scene Viewer intent. `resizable=false` keeps real-world size; if the phone
 * cannot do AR, Scene Viewer falls back to its 3D view, and without the app
 * installed the browser returns to `fallbackUrl`.
 */
export function sceneViewerHref(model: DishModel, title: string, fallbackUrl: string): string {
  const params = new URLSearchParams({
    file: absolute(model.glbUrl),
    mode: 'ar_preferred',
    resizable: 'false',
    title,
  })
  return (
    `intent://arvr.google.com/scene-viewer/1.0?${params.toString()}` +
    '#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;' +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end;`
  )
}

/** Deep link that reopens this dish (and table) on another device. */
export function dishLink(slug: string, tableToken: string | null, dishId: string): string {
  const path = tableToken ? `/m/${slug}/t/${tableToken}` : `/m/${slug}`
  return `${window.location.origin}${path}?prato=${encodeURIComponent(dishId)}`
}
