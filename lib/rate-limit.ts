/**
 * Lightweight fixed-window rate limiter for public mutation surfaces.
 *
 * Storage is in-process memory. That is correct for single-instance / dev and
 * still useful under multi-instance as a first line of defence (each instance
 * enforces its own budget). For shared limits across instances, replace the
 * store with Redis / Upstash using the same key + window semantics:
 *
 *   INCR key; EXPIRE key windowSeconds (if first increment)
 *
 * Do not use this for authenticated admin routes that already have session
 * auth — apply it to unauthenticated public POSTs first.
 */

import { getRequestClientIp } from "@/lib/request-client-ip";

export type RateLimitConfig = Readonly<{
  /** Unique bucket name, e.g. "assessment-post". */
  name: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}>;

export type RateLimitResult = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}>;

type WindowEntry = {
  count: number;
  resetAtMs: number;
};

const store = new Map<string, WindowEntry>();

let nowOverrideMs: number | null = null;

function nowMs() {
  return nowOverrideMs ?? Date.now();
}

/** Test helper: clear all in-memory buckets. */
export function resetRateLimitStoreForTests() {
  store.clear();
}

/** Test helper: freeze/unfreeze the limiter clock (`null` restores Date.now). */
export function setRateLimitNowForTests(timestampMs: number | null) {
  nowOverrideMs = timestampMs;
}

export function rateLimitClientKey(
  request: Request,
  name: string
): string {
  const ip = getRequestClientIp(request) ?? "unknown";

  return `${name}:${ip}`;
}

/**
 * Consume one unit from the named bucket for `key`.
 * Safe to call multiple times; returns remaining budget after this call.
 */
export function consumeRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = nowMs();
  const limit = Math.max(1, Math.floor(config.limit));
  const windowMs = Math.max(1, Math.floor(config.windowMs));
  const existing = store.get(key);

  if (!existing || existing.resetAtMs <= now) {
    const resetAtMs = now + windowMs;
    store.set(key, { count: 1, resetAtMs });

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAtMs,
      retryAfterSeconds: 0
    };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAtMs - now) / 1000)
    );

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAtMs: existing.resetAtMs,
      retryAfterSeconds
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAtMs: existing.resetAtMs,
    retryAfterSeconds: 0
  };
}

export function rateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAtMs / 1000))
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

export function rateLimitExceededResponse(
  result: RateLimitResult,
  message = "Too many requests. Please try again shortly."
) {
  // Use the platform Response (not next/server) so unit tests and workers
  // can import this module without Next runtime resolution.
  return new Response(
    JSON.stringify({
      message,
      retryAfterSeconds: result.retryAfterSeconds
    }),
    {
      headers: {
        "Content-Type": "application/json",
        ...rateLimitHeaders(result)
      },
      status: 429
    }
  );
}

/**
 * Enforce a per-client rate limit for a request.
 * Returns a 429 Response when exceeded; otherwise null.
 */
export function enforceRateLimit(
  request: Request,
  config: RateLimitConfig
): Response | null {
  const result = consumeRateLimit(rateLimitClientKey(request, config.name), config);

  if (result.allowed) {
    return null;
  }

  return rateLimitExceededResponse(result);
}

/** Common public-mutation budgets (per IP, fixed window). */
export const publicRateLimits = {
  assessmentPost: {
    name: "assessment-post",
    limit: 20,
    windowMs: 60_000
  },
  assessmentResumeLink: {
    name: "assessment-resume-link",
    limit: 5,
    windowMs: 60_000
  },
  assessmentPlanMutation: {
    name: "assessment-plan-mutation",
    limit: 30,
    windowMs: 60_000
  },
  bpmPost: {
    name: "bpm-post",
    limit: 120,
    windowMs: 60_000
  },
  checkoutSession: {
    name: "checkout-session",
    limit: 10,
    windowMs: 60_000
  },
  mockPaymentComplete: {
    name: "mock-payment-complete",
    limit: 10,
    windowMs: 60_000
  },
  productClick: {
    name: "product-click",
    limit: 60,
    windowMs: 60_000
  },
  retailBasketAvailability: {
    name: "retail-basket-availability",
    limit: 30,
    windowMs: 60_000
  },
  retailCheckoutSession: {
    name: "retail-checkout-session",
    limit: 10,
    windowMs: 60_000
  }
} as const satisfies Record<string, RateLimitConfig>;
