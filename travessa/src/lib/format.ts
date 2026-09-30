const moneyFormatters = new Map<string, Intl.NumberFormat>()

export function formatMoney(cents: number, currency = 'EUR', locale = 'pt-PT'): string {
  const key = `${locale}:${currency}`
  let f = moneyFormatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency })
    moneyFormatters.set(key, f)
  }
  return f.format(cents / 100)
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function formatTime(iso: string, locale = 'pt-PT'): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

export function minutesSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))
}

/** Parse "12,50" or "12.50" into cents. Returns null if not a valid amount. */
export function parseMoneyInput(input: string): number | null {
  const normalized = input.trim().replace(/\s|€/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  return Math.round(parseFloat(normalized) * 100)
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}
