import type { Metadata } from "next"
import "../globals.css"
import "./critical.css"
import Script from "next/script"

export const metadata: Metadata = {
  title: "Reservar Sala - Cafe Atrato",
  description: "Reserva nuestra sala de juntas en Cafe Atrato Coworking Cultural y Empresarial",
}

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div id="reservar-splash" className="reservar-splash" aria-hidden="true">
        <div className="reservar-splash-logo">CA</div>
        <div className="reservar-splash-spinner"></div>
        <div className="reservar-splash-text">Cargando reserva</div>
        <div className="reservar-splash-bar"><div className="reservar-splash-bar-inner"></div></div>
      </div>
      {children}
      <Script id="hide-splash" strategy="afterInteractive">{`
        (function() {
          function hideSplash() {
            var el = document.getElementById('reservar-splash');
            if (el) {
              el.classList.add('reservar-splash-hide');
              setTimeout(function() { el.remove(); }, 400);
            }
          }
          if (document.readyState === 'complete') {
            setTimeout(hideSplash, 100);
          } else {
            window.addEventListener('load', function() { setTimeout(hideSplash, 100); });
          }
        })();
      `}</Script>
    </>
  )
}
