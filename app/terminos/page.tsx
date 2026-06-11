import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Términos y Condiciones - Café Atrato",
  description: "Términos y condiciones de servicio para reservas, coworking y eventos en Café Atrato.",
}

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <header className="bg-[#051D41] text-white py-6 shadow-md sticky top-0 z-50">
        <div className="container mx-auto px-4 flex items-center">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold text-sm tracking-wide uppercase">Volver al inicio</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="bg-white rounded-3xl shadow-sm p-8 md:p-12 border border-slate-100">
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#051D41] mb-6 tracking-tight">
            Términos y Condiciones
          </h1>
          <p className="text-slate-500 mb-10 text-sm">Última actualización: Junio de 2026</p>

          <div className="space-y-8 text-slate-700 leading-relaxed">
            <section>
              <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F9B207] text-[#051D41] flex items-center justify-center text-xs">1</span>
                Información General
              </h2>
              <p>
                Al acceder y utilizar los servicios de Café Atrato, incluyendo nuestra cafetería, espacios de coworking, y la reserva de eventos a través de nuestra plataforma web, usted acepta estar sujeto a estos Términos y Condiciones. Si no está de acuerdo con alguna parte de los términos, no podrá acceder al servicio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F9B207] text-[#051D41] flex items-center justify-center text-xs">2</span>
                Reservas y Pagos
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>Las reservas de mesas y espacios de trabajo deben realizarse con antelación a través de nuestra plataforma web o canales oficiales.</li>
                <li>Los pagos realizados a través de la plataforma son procesados por Wompi, y están sujetos a sus propias políticas de seguridad y procesamiento.</li>
                <li>Una reserva se considera confirmada únicamente cuando el pago ha sido validado en su totalidad.</li>
                <li>En caso de llegar tarde a su reserva, el espacio se mantendrá por un máximo de 30 minutos. Pasado este tiempo, la mesa podrá ser reasignada sin derecho a reembolso.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F9B207] text-[#051D41] flex items-center justify-center text-xs">3</span>
                Uso del Coworking y Red WiFi
              </h2>
              <p className="mb-2">El uso del espacio de trabajo compartido implica un comportamiento respetuoso con el resto de los usuarios:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Se prohíbe el uso de altavoces o realizar videollamadas en voz alta en las zonas de trabajo silencioso. Por favor, use auriculares.</li>
                <li>El uso de nuestra red WiFi de alta velocidad es exclusivamente para actividades lícitas. Está prohibida la descarga masiva de archivos protegidos por derechos de autor o cualquier actividad que comprometa la red.</li>
                <li>Café Atrato no se hace responsable por la pérdida o daño de objetos personales dentro de las instalaciones.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F9B207] text-[#051D41] flex items-center justify-center text-xs">4</span>
                Cancelaciones y Reembolsos
              </h2>
              <p>
                Las reservas pueden ser canceladas con un mínimo de 12 horas de anticipación para obtener un reembolso total. Las cancelaciones realizadas con menos tiempo no serán reembolsadas, pero el saldo podrá ser abonado para una futura visita dependiendo de la disponibilidad y el criterio de la administración.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F9B207] text-[#051D41] flex items-center justify-center text-xs">5</span>
                Eventos y Talleres
              </h2>
              <p>
                Los eventos promocionados a través de la sección "Próximos Eventos" que sean organizados por terceros son responsabilidad exclusiva del organizador. Café Atrato actúa únicamente como facilitador del espacio y la plataforma de promoción.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#F9B207] text-[#051D41] flex items-center justify-center text-xs">6</span>
                Privacidad y Tratamiento de Datos
              </h2>
              <p>
                La información personal recopilada durante la reserva (nombre, correo, teléfono) será utilizada exclusivamente para la gestión de su reserva, comunicación sobre su visita y facturación. Sus datos no serán vendidos ni compartidos con terceros con fines publicitarios, y se rigen bajo las leyes colombianas de protección de datos (Ley 1581 de 2012).
              </p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-slate-100 text-center">
            <p className="text-slate-500 mb-6">Si tienes alguna duda sobre nuestros términos, contáctanos:</p>
            <a 
              href="https://wa.me/573102871513" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-6 py-3 rounded-full font-bold hover:bg-[#1ebd5a] transition-colors shadow-md hover:shadow-lg"
            >
              Escribir a WhatsApp
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
