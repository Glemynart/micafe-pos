/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: ['localhost', '192.168.2.205'],
}

export default nextConfig
