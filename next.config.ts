import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles only what's needed — required for the Docker image.
  output: "standalone",
};

export default nextConfig;
