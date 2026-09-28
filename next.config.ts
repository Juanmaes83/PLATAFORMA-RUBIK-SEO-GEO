import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Core is a CommonJS/UMD library installed from its Git repository at a pinned
  // commit. Keeping it external makes the server `require` the exact installed code
  // instead of re-bundling it (ADR 0001).
  serverExternalPackages: ["@rubik/seo-geo-core"],
  poweredByHeader: false,
  // No dev overlay badge: keeps local screenshots faithful to what users see.
  devIndicators: false,
};

export default nextConfig;
