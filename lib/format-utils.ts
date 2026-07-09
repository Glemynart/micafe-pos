export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleDateString('es-CO')
}

export function formatTime(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—'
  return ts.toDate().toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
