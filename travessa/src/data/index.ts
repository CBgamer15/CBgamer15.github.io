import { env, isDemoMode } from '@/lib/env'
import type { Repository } from './repository'
import { LocalRepository } from './local/localRepository'

let instance: Repository | null = null

/** Resolve the data source once. Supabase is loaded lazily so demo mode never downloads it. */
export async function initRepository(): Promise<Repository> {
  if (instance) return instance
  if (isDemoMode) {
    instance = new LocalRepository()
  } else {
    const { SupabaseRepository } = await import('./supabase/supabaseRepository')
    instance = new SupabaseRepository(env.supabaseUrl!, env.supabaseAnonKey!)
  }
  return instance
}

export function repo(): Repository {
  if (!instance) throw new Error('Repository not initialised')
  return instance
}

export type { Repository } from './repository'
