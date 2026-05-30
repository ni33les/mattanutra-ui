import type { NextConfig } from "next";
import { localeRoutePattern } from "./lib/i18n";

const isDevelopment = process.env.NODE_ENV !== "production";
const skipBuildTypecheck = process.env.NEXT_BUILD_SKIP_TYPECHECK === "1";
// Registry-derived public locales currently include zh-CN.
const publicLocaleRoutePattern = localeRoutePattern();

const noStoreHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-store, no-cache, max-age=0, must-revalidate"
  },
  {
    key: "CDN-Cache-Control",
    value: "no-store"
  },
  {
    key: "Surrogate-Control",
    value: "no-store"
  }
];

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      isDevelopment
        ? "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:*"
        : "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://r.stripe.com",
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'self' https://checkout.stripe.com https://hooks.stripe.com https://js.stripe.com",
      "img-src 'self' data: blob: https:",
      "manifest-src 'self'",
      "object-src 'none'",
      isDevelopment
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests"
    ].join("; ")
  },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "bluetooth=()",
      "camera=()",
      "geolocation=()",
      "gyroscope=()",
      "hid=()",
      "local-fonts=()",
      "magnetometer=()",
      "microphone=()",
      'payment=(self "https://checkout.stripe.com" "https://js.stripe.com")',
      "serial=()",
      "usb=()"
    ].join(", ")
  },
  ...(isDevelopment
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload"
        }
      ])
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  devIndicators: false,
  images: {
    unoptimized: true
  },
  typescript: {
    ignoreBuildErrors: skipBuildTypecheck
  },
  async headers() {
    return [
      {
        headers: securityHeaders,
        source: "/(.*)"
      },
      {
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ],
        source: "/uploads/:path*"
      },
      {
        headers: noStoreHeaders,
        source: `/:locale(${publicLocaleRoutePattern})`
      },
      {
        headers: noStoreHeaders,
        source: `/:locale(${publicLocaleRoutePattern})/:path*`
      },
      {
        headers: noStoreHeaders,
        source: "/api/:path*"
      }
    ];
  }
};

export default nextConfig;
