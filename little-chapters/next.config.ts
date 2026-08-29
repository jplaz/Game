import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Heavy media work never runs in the web tier; sharp is only needed by the
  // worker but must be external so Next.js doesn't try to bundle its binaries.
  serverExternalPackages: ["sharp", "postgres"],
  images: {
    // Media is served through signed URLs from our own storage; remote
    // optimization is disabled so URLs are never rewritten through third parties.
    unoptimized: true,
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(self), microphone=(self), geolocation=()",
        },
      ],
    },
  ],
};

export default nextConfig;
