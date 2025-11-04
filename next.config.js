/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    domains: ['kteobfyferrukqeolofj.supabase.co'],
    unoptimized: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    }
  }
}

module.exports = nextConfig
