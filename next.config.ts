import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    // Allow build to complete even with type errors during development
    ignoreBuildErrors: false,
  },
  eslint: {
    // Allow production builds to complete even with ESLint errors
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Enable server components external packages
    serverComponentsExternalPackages: [],
  },
}

export default nextConfig
