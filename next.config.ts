import type { NextConfig } from "next"

const modelHeaders = (contentType: string) => [
  { key: "Content-Type", value: contentType },
  // Scene Viewer (Android) fetches the model from Google's app, not the page.
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
]

const nextConfig: NextConfig = {
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
  images: {
    formats: ["image/webp"],
  },
  async headers() {
    return [
      { source: "/models/:path*.glb", headers: modelHeaders("model/gltf-binary") },
      { source: "/models/:path*.usdz", headers: modelHeaders("model/vnd.usdz+zip") },
      { source: "/vendor/draco/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
    ]
  },
}

export default nextConfig
