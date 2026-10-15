import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  experimental: {
    // Browser source maps keep their existing default; only omit server maps
    // from production artifacts to reduce deployment storage.
    serverSourceMaps: false,
  },
  typescript: {
    // MT-U0: el gate de CI (tsc --noEmit) y `next build` validan tipos.
    // No se silencian errores de tipo en el build.
    ignoreBuildErrors: false,
  },
  turbopack: {
    root: __dirname,
  },
  allowedDevOrigins: ['localhost', '192.168.2.205'],
}

export default nextConfig
