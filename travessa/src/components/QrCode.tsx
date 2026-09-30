import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Renders a crisp SVG QR code (prints sharply at any size). */
export function QrCode({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    void QRCode.toString(value, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1c1b19', light: '#ffffff00' } }).then(
      (s) => alive && setSvg(s),
    )
    return () => {
      alive = false
    }
  }, [value])
  return <div role="img" aria-label={label ?? value} className={className} dangerouslySetInnerHTML={{ __html: svg }} />
}
