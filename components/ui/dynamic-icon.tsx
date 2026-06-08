import * as React from 'react'
import * as LucideIcons from 'lucide-react'

interface DynamicIconProps {
  name?: string | null
  className?: string
  fallback?: React.ReactNode
}

export function DynamicIcon({ name, className, fallback }: DynamicIconProps) {
  if (!name) {
    return <>{fallback || <LucideIcons.Package className={className} />}</>
  }

  const isEmoji = /[\u{1F000}-\u{1F9FF}]|[\u{2000}-\u{2BFF}]|[\u{FE00}-\u{FEFF}]|[\u{E0000}-\u{E007F}]/u.test(name)
  if (isEmoji) {
    return <span className={className} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'inherit' }}>{name}</span>
  }

  const IconComponent = (LucideIcons as any)[name]
  if (!IconComponent) {
    return <>{fallback || <LucideIcons.Package className={className} />}</>
  }

  return <IconComponent className={className} />
}
