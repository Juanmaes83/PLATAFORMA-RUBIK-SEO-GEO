import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Core is a CommonJS/UMD library installed from its Git repository at a pinned
  // commit. Keeping it external makes the server `require` the exact installed code
  // instead of re-bundling it (ADR 0001).
  serverExternalPackages: ["@rubik/seo-geo-core"],
  poweredByHeader: false,
  // No dev overlay badge: keeps local screenshots faithful to what users see.
  devIndicators: false,
  // Vercel's adapter currently serves the first page but returns 404 for additional
  // immutable chunks referenced after a Server Action in protected Preview.
  // Keep static assets scoped to this deployment until that adapter path is fixed.
  supportsImmutableAssets: false,
};

export default nextConfig;
