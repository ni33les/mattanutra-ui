/**
 * Meta (Facebook) Pixel helpers — client-side only.
 * Enable with NEXT_PUBLIC_FACEBOOK_PIXEL_ID (digits). Optional second ID:
 * NEXT_PUBLIC_FACEBOOK_PIXEL_IDS=comma,separated
 */

declare global {
  interface Window {
    fbq?: FacebookPixelFn;
    _fbq?: FacebookPixelFn;
  }
}

type FacebookPixelFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  push?: FacebookPixelFn;
  loaded?: boolean;
  version?: string;
};

const SCRIPT_ID = "facebook-fbevents";
const SCRIPT_SRC = "https://connect.facebook.net/en_US/fbevents.js";

/**
 * MattaNutra Meta Pixel (public client ID). Env overrides when set on App Platform.
 * NEXT_PUBLIC_FACEBOOK_PIXEL_ID / NEXT_PUBLIC_META_PIXEL_ID / NEXT_PUBLIC_FACEBOOK_PIXEL_IDS
 */
export const DEFAULT_FACEBOOK_PIXEL_ID = "27629903823308584";

function configuredPixelIds(): string[] {
  const primary =
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ||
    DEFAULT_FACEBOOK_PIXEL_ID;
  const extra = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_IDS?.trim() || "";
  const ids = [primary, ...extra.split(",")]
    .map((id) => id.trim())
    .filter((id) => /^\d{5,20}$/.test(id));

  return [...new Set(ids)];
}

export function facebookPixelEnabled() {
  return configuredPixelIds().length > 0;
}

export function getFacebookPixelIds() {
  return configuredPixelIds();
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
 */
export async function initFacebookPixel() {
  if (typeof window === "undefined" || !facebookPixelEnabled()) {
    return false;
  }

  const ids = configuredPixelIds();
  ensureFbqStub();

  try {
    await loadPixelScript();
  } catch {
    return false;
  }

  for (const id of ids) {
    if (initializedIds.has(id)) {
      continue;
    }

    window.fbq?.("init", id);
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

export async function trackFacebookEvent(
  event: FacebookStandardEvent | string,
  params?: Record<string, unknown>,
  options?: { custom?: boolean }
) {
  if (typeof window === "undefined" || !facebookPixelEnabled()) {
    return;
  }

  const ready = await initFacebookPixel();
  if (!ready || !window.fbq) {
    return;
  }

  if (options?.custom) {
    window.fbq("trackCustom", event, params || {});
    return;
  }

  window.fbq("track", event, params || {});
}

export async function trackFacebookPageView(params?: Record<string, unknown>) {
  await trackFacebookEvent("PageView", params);
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
      return { event: "ViewContent" };
    case "assessment_viewed":
    case "chat_view":
    case "assessment_started":
    case "chat_start":
      return { event: "InitiateCheckout" };
    case "assessment_submitted":
    case "chat_complete":
      return { event: "Lead" };
    case "healthscore_viewed":
    case "healthscore_ready":
      return { event: "CompleteRegistration" };
    case "formulation_page_viewed":
      return { event: "ViewContent" };
    case "retail_product_checkout_viewed":
      return { event: "InitiateCheckout" };
    case "payment_succeeded":
    case "purchase_completed":
      return { event: "Purchase" };
    default:
      return null;
  }
}
