import { publicOrigin } from '@/lib/env'

export function tableUrl(slug: string, token: string): string {
  return `${publicOrigin()}/m/${slug}/t/${token}`
}
