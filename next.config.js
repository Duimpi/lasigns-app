/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['your-supabase-project.supabase.co'],
  },
  experimental: {
    serverComponentsExternalPackages: ['jspdf'],
  },
}

module.exports = nextConfig
