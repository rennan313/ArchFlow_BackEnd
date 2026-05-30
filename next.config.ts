import type { NextConfig } from "next";

const ALLOWED_ORIGIN = process.env.FRONTEND_URL ?? "http://localhost:3001";

const CORS_HEADERS = [
  { key: "Access-Control-Allow-Origin",  value: ALLOWED_ORIGIN },
  { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type,Authorization" },
  { key: "Access-Control-Max-Age",       value: "86400" },
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
    ];
  },
};

export default nextConfig;
