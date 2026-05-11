import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Force-include the Node-runtime variant of @vercel/og for the dynamic OG
  // route. Next's tracer was shipping the wrapper but skipping index.node.js,
  // so per-slug requests 500'd with ERR_MODULE_NOT_FOUND.
  outputFileTracingIncludes: {
    "/blog/[slug]/opengraph-image": [
      "./node_modules/next/dist/compiled/@vercel/og/**/*",
    ],
  },
  images: {
    // Allow lower-quality variants for gallery thumbnails. Default is [75];
    // 55 is used by BlogImage when rendered as a masonry tile.
    qualities: [55, 75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "imagedelivery.net",
      },
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
      // Notion CDN domains for uploaded files
      {
        protocol: "https",
        hostname: "prod-files-secure.s3.us-west-2.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "s3.us-west-2.amazonaws.com",
      },
      // R2 public domain — mirrored blog media and photos.
      {
        protocol: "https",
        hostname: "media.rahulvaidun.com",
      },
      // Google Photos CDN
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh4.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh5.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh6.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
