/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  distDir: 'out',
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Permitir explícitamente que la IP local se conecte para que el celular descargue los WebSockets de desarrollo
  allowedDevOrigins: ['localhost', '192.168.2.205'],
}

export default nextConfig
