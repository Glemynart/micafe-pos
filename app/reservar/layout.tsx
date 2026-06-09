import type { Metadata } from "next"
import "../globals.css"

export const metadata: Metadata = {
  title: "Reservar Sala - Cafe Atrato",
  description: "Reserva nuestra sala de juntas en Cafe Atrato Coworking Cultural y Empresarial",
}

const CRITICAL_CSS = `
  :root {
    --cafe-navy: #051D41;
    --cafe-gold: #F9B207;
    --cafe-cream: #F5F1EA;
  }
  .reservar-page {
    background-color: var(--cafe-cream) !important;
  }
  .rdp-weekday,
  .rdp .rdp-weekday,
  [class*="weekday"] {
    color: var(--cafe-gold) !important;
    font-weight: 700 !important;
    letter-spacing: 0 !important;
    text-transform: none !important;
  }
  .reservar-card {
    background-color: #ffffff !important;
    box-shadow: 0 10px 25px -5px rgba(5, 29, 65, 0.10), 0 4px 6px -2px rgba(5, 29, 65, 0.05) !important;
    border: 1px solid rgba(5, 29, 65, 0.10) !important;
    border-radius: 1rem !important;
    color: var(--cafe-navy) !important;
  }
  .reservar-card .reservar-title {
    color: var(--cafe-navy) !important;
    font-weight: 700 !important;
  }
  .reservar-card .reservar-num {
    background-color: var(--cafe-navy) !important;
    color: var(--cafe-gold) !important;
    font-weight: 900 !important;
  }
  .reservar-card .reservar-desc {
    color: #64748b !important;
  }
  .reservar-trigger-empty,
  .reservar-trigger-selected {
    height: 3.5rem !important;
    font-size: 1.125rem !important;
    border-radius: 0.75rem !important;
    border-width: 2px !important;
    border-style: solid !important;
    transition: all 200ms ease !important;
  }
  .reservar-trigger-empty {
    background-color: #ffffff !important;
    border-color: rgba(5, 29, 65, 0.20) !important;
    color: var(--cafe-navy) !important;
  }
  .reservar-trigger-selected {
    background-color: var(--cafe-navy) !important;
    border-color: var(--cafe-gold) !important;
    color: #ffffff !important;
    box-shadow: 0 4px 16px -4px rgba(5, 29, 65, 0.3) !important;
  }
  .reservar-btn-primary {
    background-color: var(--cafe-gold) !important;
    color: var(--cafe-navy) !important;
    font-weight: 700 !important;
    box-shadow: 0 10px 25px -5px rgba(249, 178, 7, 0.4) !important;
  }
  .reservar-btn-primary:hover:not(:disabled) {
    filter: brightness(1.05) !important;
  }
  .reservar-btn-primary:disabled {
    opacity: 0.4 !important;
    cursor: not-allowed !important;
  }
  .reservar-hour-available {
    background-color: #ffffff !important;
    border: 2px solid var(--cafe-navy) !important;
    color: var(--cafe-navy) !important;
    font-weight: 700 !important;
    border-radius: 0.75rem !important;
  }
  .reservar-hour-available:hover {
    box-shadow: 0 4px 12px -2px rgba(5, 29, 65, 0.2) !important;
  }
  .reservar-hour-selected {
    background-color: var(--cafe-navy) !important;
    border: 2px solid var(--cafe-navy) !important;
    color: var(--cafe-gold) !important;
    font-weight: 900 !important;
    border-radius: 0.75rem !important;
    box-shadow: 0 8px 20px -6px rgba(5, 29, 65, 0.5) !important;
  }
  .reservar-hour-disabled {
    background-color: #f8fafc !important;
    border: 2px solid #e2e8f0 !important;
    color: #cbd5e1 !important;
    opacity: 0.6 !important;
    border-radius: 0.75rem !important;
    cursor: not-allowed !important;
  }
  .reservar-hour-label {
    font-size: 0.65rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    font-weight: 700 !important;
  }
  .reservar-total-box {
    background: linear-gradient(135deg, rgba(5, 29, 65, 0.04) 0%, rgba(249, 178, 7, 0.10) 100%) !important;
    border: 1px solid rgba(5, 29, 65, 0.10) !important;
    border-radius: 1rem !important;
    color: var(--cafe-navy) !important;
  }
  .reservar-progress-active {
    background-color: var(--cafe-gold) !important;
  }
  .reservar-progress-done {
    background-color: var(--cafe-navy) !important;
  }
  .reservar-progress-pending {
    background-color: #e2e8f0 !important;
  }
`

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CRITICAL_CSS }} />
      {children}
    </>
  )
}
