import type { NextConfig } from "next";

const ALLOWED_ORIGIN = process.env.FRONTEND_URL ?? "http://localhost:3001";

const CORS_HEADERS = [
  { key: "Access-Control-Allow-Origin",  value: ALLOWED_ORIGIN },
  { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
  { key: "Access-Control-Max-Age",       value: "86400" },
];

const SECURITY_HEADERS = [
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
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
