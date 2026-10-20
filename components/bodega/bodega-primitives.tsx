import type { ChangeEvent } from "react"
import { PackageSearch, Search } from "lucide-react"

export function BodegaSearch({ value, onChange, placeholder }: { value: string; onChange(value: string): void; placeholder: string }) {
  return <label className="bodega-search">
    <Search aria-hidden="true" className="h-5 w-5" />
    <input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)} />
  </label>
}

export function BodegaEmptyState({ title, detail }: { title: string; detail: string }) {
  return <div role="status" className="bodega-empty-state">
    <span aria-hidden="true"><PackageSearch className="h-6 w-6" /></span>
    <strong>{title}</strong>
    <p>{detail}</p>
  </div>
}
