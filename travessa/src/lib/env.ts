const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const env = {
  supabaseUrl: url?.trim() || undefined,
  supabaseAnonKey: anonKey?.trim() || undefined,
  publicAppUrl: (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() || undefined,
}

/** Demo mode runs entirely in the browser; no backend required. */
export const isDemoMode = !(env.supabaseUrl && env.supabaseAnonKey)

export function publicOrigin(): string {
  return (env.publicAppUrl ?? window.location.origin).replace(/\/$/, '')
}
