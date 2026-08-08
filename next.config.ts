import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Any request that reaches Next.js with the old hostname gets a permanent
  // redirect to the new one, preserving the path + query. Vercel's own
  // domain-level redirect (configured in the dashboard) handles this before
  // a function invocation; this is a belt-and-suspenders in case the DNS or
  // Vercel alias config drifts.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.rahulvaidun.com" }],
        destination: "https://rahul.ws/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "rahulvaidun.com" }],
        destination: "https://rahul.ws/:path*",
        permanent: true,
      },
    ];
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
      // Apple Music CDN — round-robins across is1..is5-ssl.mzstatic.com
      {
        protocol: "https",
        hostname: "*.mzstatic.com",
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
