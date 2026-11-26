import type { NextConfig } from "next";

// Basic hardening for a money app: no framing, no sniffing, no device APIs we don't use.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  devIndicators: false, // no "N" badge over the UI in dev (screenshots, phone testing)
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
