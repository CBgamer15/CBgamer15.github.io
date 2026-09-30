import { describe, expect, it } from 'vitest'
import { dishLink, quickLookHref, sceneViewerHref } from './ar'

const model = { glbUrl: '/models/pastel-de-nata.glb', usdzUrl: '/models/pastel-de-nata.usdz', scale: 1 }

describe('AR links', () => {
  it('opens Quick Look at real size with an absolute USDZ URL', () => {
    expect(quickLookHref(model)).toBe(`${window.location.origin}/models/pastel-de-nata.usdz#allowsContentScaling=0`)
    expect(quickLookHref({ glbUrl: '/x.glb', scale: 1 })).toBeNull()
  })

  it('builds a Scene Viewer intent with the absolute GLB, fixed scale and a fallback', () => {
    const href = sceneViewerHref(model, 'Pastel de nata', 'https://example.pt/m/casa-do-mar')
    expect(href.startsWith('intent://arvr.google.com/scene-viewer/1.0?')).toBe(true)
    const query = new URLSearchParams(href.slice(href.indexOf('?') + 1, href.indexOf('#')))
    expect(query.get('file')).toBe(`${window.location.origin}/models/pastel-de-nata.glb`)
    expect(query.get('mode')).toBe('ar_preferred')
    expect(query.get('resizable')).toBe('false')
    expect(query.get('title')).toBe('Pastel de nata')
    expect(href).toContain('package=com.google.android.googlequicksearchbox')
    expect(href.endsWith(`S.browser_fallback_url=${encodeURIComponent('https://example.pt/m/casa-do-mar')};end;`)).toBe(true)
  })

  it('deep-links a dish, keeping the table when there is one', () => {
    expect(dishLink('casa-do-mar', 'Hd2vP9qMx4Ls', 'd1')).toBe(`${window.location.origin}/m/casa-do-mar/t/Hd2vP9qMx4Ls?prato=d1`)
    expect(dishLink('casa-do-mar', null, 'd1')).toBe(`${window.location.origin}/m/casa-do-mar?prato=d1`)
  })
})
