'use client'

import dynamic from 'next/dynamic'

const FcmManager = dynamic(
  () => import('@/components/fcm-manager').then(mod => mod.FcmManager),
  { ssr: false }
)

export function FcmManagerWrapper() {
  return <FcmManager />
}
