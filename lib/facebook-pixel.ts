/**
 * Meta (Facebook) Pixel helpers — client-side only.
 * Enable with NEXT_PUBLIC_FACEBOOK_PIXEL_ID (digits). Optional second ID:
 * NEXT_PUBLIC_FACEBOOK_PIXEL_IDS=comma,separated
 *
 * Funnel: Lead fires when HealthScore results are ready (healthscore_ready),
 * not when the quiz is opened. CAPI uses the same event_id for dedupe.
 *
 * Environment isolation: the production default pixel is only used on PRD.
 * UAT/dev must set their own Pixel ID (or intentionally opt into the shared
 * production pixel via FACEBOOK_ALLOW_SHARED_PIXEL=true).
 */

declare global {
  interface Window {
    fbq?: FacebookPixelFn;
    _fbq?: FacebookPixelFn;
  }
}

type FacebookPixelFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: FacebookPixelFn;
  loaded?: boolean;
  version?: string;
};

const SCRIPT_ID = "facebook-fbevents";
const SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";
const LEAD_ONCE_PREFIX = "mattanutra:fb:lead:";

export type MattanutraRuntimeEnv = "dev" | "uat" | "prd";

/**
 * Production Meta Pixel ID. Used as PRD fallback only — never auto-applied on UAT/dev.
 */
export const DEFAULT_FACEBOOK_PIXEL_ID = "27629903823308584";

function envAlias(value: string | undefined | null): MattanutraRuntimeEnv | null {
  const key = value?.trim().toLowerCase() || "";
  if (key === "uat" || key === "staging" || key === "stage") {
    return "uat";
  }
  if (key === "prd" || key === "prod" || key === "production") {
    return "prd";
  }
  if (key === "dev" || key === "development" || key === "local") {
    return "dev";
  }
  return null;
}

function envFromHostname(hostname: string): MattanutraRuntimeEnv | null {
  const host = hostname.trim().toLowerCase();
  if (!host) {
    return null;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "dev";
  }
  if (host === "mattanutra.com" || host === "www.mattanutra.com") {
    return "prd";
  }
  if (/(^|[.-])uat($|[.-])/.test(host)) {
    return "uat";
  }
  if (/(^|[.-])dev($|[.-])/.test(host)) {
    return "dev";
  }
  return null;
}

function envFromUrl(value: string | undefined | null): MattanutraRuntimeEnv | null {
  const first = value?.split(",")[0]?.trim();
  if (!first) {
    return null;
  }
  try {
    const host = new URL(first.includes("://") ? first : `https://${first}`)
      .hostname;
    return envFromHostname(host);
  } catch {
    return null;
  }
}

/**
 * Resolve MattaNutra runtime environment for Meta isolation.
 * Prefers MATTANUTRA_ENV / NEXT_PUBLIC_MATTANUTRA_ENV, then site URL / host.
 */
export function resolveMattanutraRuntimeEnv(): MattanutraRuntimeEnv {
  const explicit =
    envAlias(process.env.NEXT_PUBLIC_MATTANUTRA_ENV) ||
    envAlias(process.env.MATTANUTRA_ENV);

  if (explicit) {
    return explicit;
  }

  if (typeof window !== "undefined") {
    const fromHost = envFromHostname(window.location.hostname);
    if (fromHost) {
      return fromHost;
    }
  }

  for (const candidate of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APP_BASE_URL,
    process.env.MATTANUTRA_API_BASE_URL,
    process.env.VERCEL_URL,
    process.env.RENDER_EXTERNAL_URL
  ]) {
    const inferred = envFromUrl(candidate);
    if (inferred) {
      return inferred;
    }
  }

  // NODE_ENV=production on UAT is common — do not assume prd from NODE_ENV alone
  // when we could not infer host; default to dev for safety (no accidental PRD pixel).
  return "dev";
}

function allowSharedProductionPixel() {
  return (
    process.env.FACEBOOK_ALLOW_SHARED_PIXEL?.trim() === "true" ||
    process.env.NEXT_PUBLIC_FACEBOOK_ALLOW_SHARED_PIXEL?.trim() === "true"
  );
}

function isValidPixelId(id: string) {
  return /^\d{5,20}$/.test(id);
}

/**
 * Pixel IDs allowed for this environment.
 * - PRD: explicit env, else production default.
 * - UAT/dev: explicit env only; production default is blocked unless ALLOW_SHARED.
 */
function configuredPixelIds(): string[] {
  const runtimeEnv = resolveMattanutraRuntimeEnv();
  const primary =
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ||
    process.env.FACEBOOK_PIXEL_ID?.trim() ||
    "";
  const extra = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_IDS?.trim() || "";
  const candidates = [primary, ...extra.split(",")]
    .map((id) => id.trim())
    .filter((id) => isValidPixelId(id));

  let ids = [...new Set(candidates)];

  if (ids.length === 0 && runtimeEnv === "prd") {
    ids = [DEFAULT_FACEBOOK_PIXEL_ID];
  }

  // Never ship UAT/dev traffic into the production default pixel by accident.
  if (
    runtimeEnv !== "prd" &&
    !allowSharedProductionPixel() &&
    ids.includes(DEFAULT_FACEBOOK_PIXEL_ID)
  ) {
    ids = ids.filter((id) => id !== DEFAULT_FACEBOOK_PIXEL_ID);
  }

  return ids;
}

export function facebookPixelEnabled() {
  return configuredPixelIds().length > 0;
}

export function getFacebookPixelIds() {
  return configuredPixelIds();
}

/** Primary pixel for this environment, or empty string when disabled. */
export function getPrimaryFacebookPixelId() {
  return configuredPixelIds()[0] || "";
}

function ensureFbqStub() {
  if (typeof window === "undefined") {
    return null;
  }

  if (window.fbq) {
    return window.fbq;
  }

  const fbq: FacebookPixelFn = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      (fbq.queue = fbq.queue || []).push(args);
    }
  };

  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  return fbq;
}

let scriptLoadPromise: Promise<void> | null = null;
let initializedIds = new Set<string>();

function loadPixelScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (document.getElementById(SCRIPT_ID)) {
    return Promise.resolve();
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    ensureFbqStub();
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load Facebook Pixel script"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Init all configured pixels once (idempotent). Safe to call on every navigation.
 * Compatible with the official Meta base snippet (init + PageView) when already loaded.
 */
export async function initFacebookPixel() {
  if (typeof window === "undefined" || !facebookPixelEnabled()) {
    return false;
  }

  const ids = configuredPixelIds();

  // Official snippet may already have created window.fbq and loaded fbevents.js
  let fbq = window.fbq;

  if (!fbq) {
    ensureFbqStub();
    try {
      await loadPixelScript();
    } catch {
      return false;
    }
    fbq = window.fbq;
  }

  if (!fbq) {
    return false;
  }

  for (const id of ids) {
    if (initializedIds.has(id)) {
      continue;
    }

    // init is safe to call again; Meta ignores duplicate IDs in practice
    fbq("init", id);
    initializedIds.add(id);
  }

  return true;
}

export type FacebookStandardEvent =
  | "PageView"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "Lead"
  | "CompleteRegistration"
  | "Contact"
  | "Subscribe";

export type TrackFacebookEventOptions = Readonly<{
  custom?: boolean;
  /** Meta browser/server dedupe key (eventID). */
  eventID?: string;
}>;

export async function trackFacebookEvent(
  event: FacebookStandardEvent | string,
  params?: Record<string, unknown>,
  options?: TrackFacebookEventOptions
) {
  if (typeof window === "undefined" || !facebookPixelEnabled()) {
    return;
  }

  const ready = await initFacebookPixel();
  const fbq = window.fbq;
  if (!ready || !fbq) {
    return;
  }

  const payload = params || {};
  const eventOptions = options?.eventID
    ? { eventID: options.eventID }
    : undefined;

  if (options?.custom) {
    if (eventOptions) {
      fbq("trackCustom", event, payload, eventOptions);
    } else {
      fbq("trackCustom", event, payload);
    }
    return;
  }

  if (eventOptions) {
    fbq("track", event, payload, eventOptions);
  } else {
    fbq("track", event, payload);
  }
}

export async function trackFacebookPageView(params?: Record<string, unknown>) {
  await trackFacebookEvent("PageView", params);
}

/**
 * Prevent double Lead for the same plan in one browser session (refresh / back).
 * Returns true if this is the first Lead claim for the plan (or no planId).
 */
export function claimFacebookLeadOnce(planId: string | null | undefined) {
  if (typeof window === "undefined") {
    return true;
  }

  const key = planId?.trim()
    ? `${LEAD_ONCE_PREFIX}${planId.trim()}`
    : `${LEAD_ONCE_PREFIX}anonymous`;

  try {
    if (window.sessionStorage.getItem(key)) {
      return false;
    }
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

/** Map internal BPM / funnel events → Meta standard or custom events. */
export function facebookEventForInternal(
  eventName: string
): { event: string; custom?: boolean } | null {
  switch (eventName) {
    case "home_viewed":
    case "page_viewed":
      return { event: "PageView" };
    case "library_article_viewed":
    case "legal_page_viewed":
    case "formulation_page_viewed":
      return { event: "ViewContent" };
    case "assessment_viewed":
    case "chat_view":
    case "assessment_started":
    case "chat_start":
      return { event: "QuizStart", custom: true };
    case "email_capture":
      return { event: "EmailCapture", custom: true };
    case "assessment_submitted":
    case "chat_complete":
      return { event: "QuizSubmitted", custom: true };
    // Primary ad optimisation goal: results ready (not quiz open).
    case "healthscore_ready":
      return { event: "Lead" };
    case "healthscore_viewed":
      return { event: "ViewContent" };
    case "line_connected":
    case "customer_line_connected":
      return { event: "Subscribe" };
    case "retail_product_checkout_viewed":
      return { event: "InitiateCheckout" };
    case "payment_succeeded":
    case "purchase_completed":
      return { event: "Purchase" };
    default:
      return null;
  }
}
