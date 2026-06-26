import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // next/image needs to know which remote hosts are allowed to be
  // optimised. The backend serves uploaded product images at
  // /uploads/* and also returns absolute URLs for the dev seed.
  images: {
    remotePatterns: [
      // Dev backend (FastAPI uploads).
      { protocol: 'http', hostname: '127.0.0.1', port: '8000', pathname: '/uploads/**' },
      { protocol: 'http', hostname: 'localhost', port: '8000', pathname: '/uploads/**' },
      // Generic HTTPS catch-all (CDN, prod backend).
      { protocol: 'https', hostname: '**' },
    ],
  },
  // Performance: compress responses, prefer modern image formats.
  compress: true,
  poweredByHeader: false,
  // Strict-ish React behaviour for safer rendering.
  reactStrictMode: true,
}

export default nextConfig
