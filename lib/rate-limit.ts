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
 *
 * Memory safety: expired buckets are purged lazily, and the store is capped so
 * spoofed / high-cardinality client keys cannot grow unbounded.
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
  /** Last touch time for eviction when the store is under pressure. */
  touchedAtMs: number;
};

/** Soft cap on distinct `{bucket}:{ip}` keys held in this process. */
const DEFAULT_MAX_STORE_ENTRIES = 10_000;
/** How often to walk the map for expired keys under normal load. */
const DEFAULT_PURGE_INTERVAL_MS = 30_000;
/** When over max, drop down to this fraction of capacity. */
const PRUNE_TARGET_RATIO = 0.9;

const store = new Map<string, WindowEntry>();

let nowOverrideMs: number | null = null;
let maxStoreEntries = DEFAULT_MAX_STORE_ENTRIES;
let purgeIntervalMs = DEFAULT_PURGE_INTERVAL_MS;
let lastPurgeAtMs = 0;

function nowMs() {
  return nowOverrideMs ?? Date.now();
}

function purgeExpired(now: number) {
  for (const [key, entry] of store) {
    if (entry.resetAtMs <= now) {
      store.delete(key);
    }
  }
}

/**
 * Drop the least-recently-touched keys until size is strictly below max.
 * Prefer expired first, then oldest touch time.
 */
function pruneToCapacity(now: number) {
  purgeExpired(now);

  if (store.size < maxStoreEntries) {
    return;
  }

  const target = Math.max(
    0,
    Math.min(
      store.size - 1,
      Math.floor(maxStoreEntries * PRUNE_TARGET_RATIO)
    )
  );
  const ranked = [...store.entries()].sort((a, b) => {
    const aExpired = a[1].resetAtMs <= now ? 0 : 1;
    const bExpired = b[1].resetAtMs <= now ? 0 : 1;
    if (aExpired !== bExpired) {
      return aExpired - bExpired;
    }

    return a[1].touchedAtMs - b[1].touchedAtMs;
  });

  let removeCount = store.size - target;
  for (const [key] of ranked) {
    if (removeCount <= 0) {
      break;
    }
    store.delete(key);
    removeCount -= 1;
  }
}

function maybeMaintainStore(now: number) {
  const dueForSweep =
    lastPurgeAtMs === 0 || now - lastPurgeAtMs >= purgeIntervalMs;

  if (dueForSweep) {
    lastPurgeAtMs = now;
    purgeExpired(now);
  }

  // Only hard-prune here if we somehow exceeded the cap; normal inserts
  // prune just-in-time before adding a new key.
  if (store.size > maxStoreEntries) {
    lastPurgeAtMs = now;
    pruneToCapacity(now);
  }
}

/** Test helper: clear all in-memory buckets. */
export function resetRateLimitStoreForTests() {
  store.clear();
  lastPurgeAtMs = 0;
  maxStoreEntries = DEFAULT_MAX_STORE_ENTRIES;
  purgeIntervalMs = DEFAULT_PURGE_INTERVAL_MS;
}

/** Test helper: freeze/unfreeze the limiter clock (`null` restores Date.now). */
export function setRateLimitNowForTests(timestampMs: number | null) {
  nowOverrideMs = timestampMs;
}

/** Test helper: lower the max store size to exercise pruning. */
export function setRateLimitMaxStoreEntriesForTests(maxEntries: number) {
  maxStoreEntries = Math.max(1, Math.floor(maxEntries));
}

/** Test helper: force more frequent expiry sweeps. */
export function setRateLimitPurgeIntervalForTests(intervalMs: number) {
  purgeIntervalMs = Math.max(0, Math.floor(intervalMs));
}

/** Test helper: current number of live buckets. */
export function getRateLimitStoreSizeForTests() {
  return store.size;
}

export function rateLimitClientKey(
  request: Request,
  name: string
): string {
  // Untrusted / missing IP collapses onto a single bucket so spoofed headers
  // cannot create unbounded distinct keys.
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
  maybeMaintainStore(now);

  const limit = Math.max(1, Math.floor(config.limit));
  const windowMs = Math.max(1, Math.floor(config.windowMs));
  const existing = store.get(key);

  if (!existing || existing.resetAtMs <= now) {
    // Ensure capacity before inserting a brand-new key (expired keys reuse the slot).
    if (!existing && store.size >= maxStoreEntries) {
      pruneToCapacity(now);
    }

    const resetAtMs = now + windowMs;
    store.set(key, { count: 1, resetAtMs, touchedAtMs: now });

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAtMs,
      retryAfterSeconds: 0
    };
  }

  existing.touchedAtMs = now;

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
