import type { NextConfig } from "next";

// Deliberately NOT importing the centralized `./src/lib/env` module here:
// next.config.ts loads before NEXT_PHASE is reliably readable via
// `process.env` (Next only passes it as an argument to a function-form
// config export), so evaluating the full env module here would run its
// production checks (including unrelated ones like Upstash) at the wrong
// point in the build lifecycle. This is a minimal, self-contained
// equivalent of `env.ts`'s requiredInProd for just this one variable —
// `src/lib/env.ts` remains the single source of truth for every other
// consumer of FRONTEND_URL in the app.
function frontendUrl(): string {
  const val = process.env.FRONTEND_URL;
  if (val) return val;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3001";
  throw new Error("[next.config] Missing required environment variable in production: FRONTEND_URL");
}

const ALLOWED_ORIGIN = frontendUrl();

const CORS_HEADERS = [
  { key: "Access-Control-Allow-Origin",  value: ALLOWED_ORIGIN },
  { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
  { key: "Access-Control-Max-Age",       value: "86400" },
];

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
        source: "/api/:path*",
        headers: CORS_HEADERS,
      },
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
