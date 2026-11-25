import type { NextConfig } from 'next';

const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'imransiteinfo.firebasestorage.app';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Google sign-in uses a popup: same-origin-allow-popups keeps it working while still isolating the page.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Only images from THIS project's Firebase Storage bucket may be optimised.
    remotePatterns: [{ protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: `/v0/b/${bucket}/o/**` }]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Same caching rules the legacy vercel.json applied to the nature footage.
      { source: '/nature/manifest.json', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
      { source: '/nature/videos/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] },
      { source: '/nature/posters/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] }
    ];
  }
};

export default config;
