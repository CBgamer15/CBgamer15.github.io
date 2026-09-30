import { describe, expect, it } from 'vitest'
import { detectArMode, dishLink, iosNeedsSafari, quickLookHref, safariHandoffUrl, sceneViewerHref } from './ar'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1',
  iphoneInApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
  laptop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
}

describe('AR mode detection', () => {
  it('never shows the "scan with your phone" QR on an iPhone, whatever the browser', () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.iphoneInApp, UA.iphoneInstagram]) {
      expect(detectArMode({ userAgent: ua, supportsRelAr: false })).toBe('quicklook')
    }
    expect(detectArMode({ userAgent: UA.ipadOs, platform: 'MacIntel', maxTouchPoints: 5 })).toBe('quicklook')
  })

  it('asks for Safari only outside Safari', () => {
    expect(iosNeedsSafari({ userAgent: UA.iphoneSafari })).toBe(false)
    expect(iosNeedsSafari({ userAgent: UA.iphoneChrome })).toBe(true)
    expect(iosNeedsSafari({ userAgent: UA.iphoneInApp })).toBe(true)
    expect(iosNeedsSafari({ userAgent: UA.iphoneInstagram })).toBe(true)
    // Brave on iOS looks like Safari (and claims rel="ar") but re-downloads the model every time.
    expect(iosNeedsSafari({ userAgent: UA.iphoneSafari, supportsRelAr: true, isBrave: true })).toBe(true)
    // If the browser itself says it can do Quick Look, trust it.
    expect(iosNeedsSafari({ userAgent: UA.iphoneInApp, supportsRelAr: true })).toBe(false)
  })

  it('uses Scene Viewer on Android and the QR hand-off only on a computer', () => {
    expect(detectArMode({ userAgent: UA.android })).toBe('scene-viewer')
    expect(detectArMode({ userAgent: UA.laptop, platform: 'Win32', maxTouchPoints: 0 })).toBe('handoff')
    expect(detectArMode({ userAgent: UA.ipadOs, platform: 'MacIntel', maxTouchPoints: 0 })).toBe('handoff') // real Mac
  })
})

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

  it('builds the iOS "open in Safari" link', () => {
    expect(safariHandoffUrl('https://travessa-ebon.vercel.app/m/casa-do-mar?prato=d1')).toBe('x-safari-https://travessa-ebon.vercel.app/m/casa-do-mar?prato=d1')
  })

  it('deep-links a dish, keeping the table when there is one', () => {
    expect(dishLink('casa-do-mar', 'Hd2vP9qMx4Ls', 'd1')).toBe(`${window.location.origin}/m/casa-do-mar/t/Hd2vP9qMx4Ls?prato=d1`)
    expect(dishLink('casa-do-mar', null, 'd1')).toBe(`${window.location.origin}/m/casa-do-mar?prato=d1`)
  })
})
