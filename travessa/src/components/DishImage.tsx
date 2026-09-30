import { useState } from 'react'
import { cn } from '@/lib/cn'

// Warm tonal plates used when a dish has no photo (or it fails to load),
// so the menu still looks intentional rather than broken.
const TONES = ['#e9e1d3', '#e4e6dc', '#ece0d8', '#dfe5e6', '#ebe4d6', '#e6dfe3']

function toneFor(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

export function DishImage({ src, alt, className, eager }: { src?: string; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const tone = toneFor(alt)

  if (!src || failed) {
    return (
      <div className={cn('grid place-items-center', className)} style={{ background: tone }} role="img" aria-label={alt}>
        <svg viewBox="0 0 64 64" className="w-2/5 max-w-20 text-ink/25" fill="none" stroke="currentColor" strokeWidth="1.2">
          <ellipse cx="32" cy="36" rx="26" ry="10" />
          <ellipse cx="32" cy="35" rx="17" ry="6" />
          <path d="M22 30c2-6 18-6 20 0" strokeLinecap="round" />
        </svg>
      </div>
    )
  }

  return (
    <div className={cn('overflow-hidden', className)} style={{ background: tone }}>
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        className={cn('size-full object-cover transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  )
}
