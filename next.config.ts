import type { NextConfig } from "next";

// CORS moved to src/middleware.ts (dynamic origin allowlist) — a static
// single-origin header here cannot support a domain migration where the old
// and new frontend domains must both be accepted during the transition.

const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'self' https://*.supabase.co",
  "frame-ancestors 'none'",
].join("; ")

const SECURITY_HEADERS = [
  { key: "X-Frame-Options",                     value: "DENY" },
  { key: "X-Content-Type-Options",              value: "nosniff" },
  { key: "Referrer-Policy",                     value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security",           value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "@react-pdf/renderer"],

  async rewrites() {
    return [
      // /api/v1/* → /api/* (forward-compatible versioning, non-breaking)
      { source: "/api/v1/:path*", destination: "/api/:path*" },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
