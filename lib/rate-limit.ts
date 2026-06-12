import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Per-route limits: requests allowed per hour per caller
const LIMITS: Record<string, number> = {
  '/api/user/anonymize':  3,
  '/api/user/delete':     3,
  '/api/user/archive':    30,
  '/api/user/reactivate': 30,
  '/api/invite':          30,
  '/api/feedback':        10,
}

let redis: Redis | null = null
const limiters = new Map<string, Ratelimit>()

function getLimiter(route: string): Ratelimit | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN ||
    !(route in LIMITS)
  ) return null

  if (!redis) {
    redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }

  if (!limiters.has(route)) {
    limiters.set(route, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LIMITS[route], '1 h'),
      prefix:  'mc_rl',
    }))
  }

  return limiters.get(route)!
}

export async function checkRateLimit(
  route: string,
  callerId: string,
): Promise<{ limited: boolean; retryAfter?: number }> {
  const limiter = getLimiter(route)
  if (!limiter) return { limited: false }

  const { success, reset } = await limiter.limit(`${route}:${callerId}`)
  if (!success) {
    return { limited: true, retryAfter: Math.ceil((reset - Date.now()) / 1000) }
  }
  return { limited: false }
}
