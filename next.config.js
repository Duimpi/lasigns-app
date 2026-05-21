/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://wbkecmtcygiwiebrculy.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6India2VjbXRjeWdpd2llYnJjdWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMTQ2MjksImV4cCI6MjA5NDg5MDYyOX0.6fDe4128i9OYmAwlLAclZqaBx1umk4s49Lp4DKiVXK0',
  },
}

module.exports = nextConfig