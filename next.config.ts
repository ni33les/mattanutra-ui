import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";

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
        : "connect-src 'self'",
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob:",
      "manifest-src 'self'",
      "object-src 'none'",
      isDevelopment
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
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
      "payment=()",
      "serial=()",
      "usb=()"
    ].join(", ")
  }
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [
      {
        headers: securityHeaders,
        source: "/(.*)"
      },
      {
        headers: noStoreHeaders,
        source: "/:locale(en|th)"
      },
      {
        headers: noStoreHeaders,
        source: "/:locale(en|th)/:path*"
      },
      {
        headers: noStoreHeaders,
        source: "/api/:path*"
      }
    ];
  }
};

export default nextConfig;
