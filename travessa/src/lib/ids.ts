export function uid(): string {
  return crypto.randomUUID()
}

/** URL-safe random token, same alphabet as url_token() in SQL. */
export function urlToken(bytes = 9): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_')
}
