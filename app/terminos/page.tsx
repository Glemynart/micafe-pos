import Link from "next/link"
import { ArrowLeft, ChevronRight, ShieldCheck, Mail } from "lucide-react"

export const metadata = {
  title: "Términos y Privacidad - Café Atrato",
  description: "Términos de servicio y políticas de privacidad en Café Atrato.",
}

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-white selection:bg-[#F9B207] selection:text-[#051D41]">
      {/* Header Minimalista */}
      <header className="bg-white text-[#051D41] py-4 border-b border-slate-100 sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-6xl flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:text-[#F9B207] transition-colors font-bold text-sm tracking-wide uppercase">
            <ArrowLeft className="w-4 h-4" />
            Volver al inicio
          </Link>
          <div className="font-black text-xl tracking-tighter">
            CAFÉ<span className="text-[#F9B207]">ATRATO</span>
          </div>
        </div>
      </header>

      {/* Hero Document */}
      <div className="bg-slate-50 border-b border-slate-100 py-12 md:py-20">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-blue-600 mb-6">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-[#051D41] tracking-tight mb-4">
            Términos y Privacidad
          </h1>
          <p className="text-slate-500 text-lg">
            Última actualización: Junio de 2026
          </p>
        </div>
      </div>

      {/* Document Layout */}
      <div className="container mx-auto px-4 max-w-6xl py-12 md:py-20 flex flex-col md:flex-row gap-12">
        
        {/* Sidebar Nav (Desktop) */}
        <aside className="hidden md:block w-64 shrink-0">
          <div className="sticky top-28">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Contenido</h3>
            <nav className="flex flex-col space-y-1">
              {['Información General', 'Reservas y Pagos', 'Uso del Espacio', 'Cancelaciones', 'Privacidad y Datos'].map((item) => (
                <a 
                  key={item}
                  href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                  className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#051D41] hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-between group"
                >
                  {item}
                  <ChevronRight className="w-3 h-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </a>
              ))}
            </nav>

            <div className="mt-8 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <h4 className="text-sm font-bold text-[#051D41] mb-2">¿Tienes dudas?</h4>
              <p className="text-xs text-slate-500 mb-4">Estamos disponibles para ayudarte con cualquier consulta legal o de reservas.</p>
              <a href="https://wa.me/573102871513" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-2 bg-[#25D366] text-white text-xs font-bold rounded-lg hover:bg-[#1ebd5a] transition-colors">
                Contactar soporte
              </a>
            </div>
          </div>
        </aside>

        {/* Content Body */}
        <main className="flex-1 max-w-3xl">
          
          <section id="información-general" className="scroll-mt-32 mb-16">
            <h2 className="text-2xl font-bold text-[#051D41] mb-6">1. Información General</h2>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>
                Al acceder y utilizar los servicios de <strong className="text-[#051D41] font-semibold">Café Atrato</strong>, incluyendo nuestra cafetería, espacios de coworking, y la reserva de eventos a través de nuestra plataforma web, usted acepta estar sujeto a estos Términos y Condiciones. 
              </p>
              <p>
                Estos términos constituyen un acuerdo legal vinculante entre usted y Café Atrato. Si no está de acuerdo con alguna parte de los términos, le sugerimos no utilizar nuestros servicios de reserva online.
              </p>
            </div>
          </section>

          <hr className="border-slate-100 my-12" />

          <section id="reservas-y-pagos" className="scroll-mt-32 mb-16">
            <h2 className="text-2xl font-bold text-[#051D41] mb-6">2. Reservas y Pagos</h2>
            <div className="space-y-6 text-slate-600 leading-relaxed">
              <p>Para garantizar una experiencia fluida para todos nuestros clientes, hemos establecido las siguientes políticas respecto a la ocupación de nuestros espacios:</p>
              <ul className="space-y-4 pl-0">
                <li className="flex gap-3">
                  <span className="text-[#F9B207] font-bold mt-1 text-lg leading-none">•</span>
                  <span><strong className="text-[#051D41] font-semibold">Antelación:</strong> Las reservas deben realizarse vía web o a través de nuestros canales oficiales.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-[#F9B207] font-bold mt-1 text-lg leading-none">•</span>
                  <span><strong className="text-[#051D41] font-semibold">Procesamiento:</strong> Los pagos son procesados de forma segura a través de la pasarela de pagos Wompi. No almacenamos datos de tarjetas de crédito.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-[#F9B207] font-bold mt-1 text-lg leading-none">•</span>
                  <span><strong className="text-[#051D41] font-semibold">Confirmación:</strong> Una reserva se considera exitosa y confirmada únicamente cuando el pago ha sido validado en su totalidad por nuestro sistema.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-red-400 font-bold mt-1 text-lg leading-none">•</span>
                  <span><strong className="text-[#051D41] font-semibold">Tiempo de Gracia:</strong> Otorgamos un tiempo de gracia de <strong className="text-[#051D41]">30 minutos</strong>. Pasado este tiempo, si el usuario no se ha presentado, la mesa podrá ser reasignada a otros clientes sin derecho a reembolso.</span>
                </li>
              </ul>
            </div>
          </section>

          <hr className="border-slate-100 my-12" />

          <section id="uso-del-espacio" className="scroll-mt-32 mb-16">
            <h2 className="text-2xl font-bold text-[#051D41] mb-6">3. Uso del Espacio y Coworking</h2>
            <div className="space-y-6 text-slate-600 leading-relaxed">
              <p>Café Atrato es un espacio compartido pensado para la productividad, la lectura y el disfrute. El respeto mutuo es fundamental:</p>
              <ul className="space-y-4 pl-0">
                <li className="flex gap-3">
                  <span className="text-blue-400 font-bold mt-1 text-lg leading-none">•</span>
                  <span>El uso de auriculares es obligatorio para reuniones virtuales, llamadas o consumo de multimedia en las zonas marcadas como "Trabajo Silencioso".</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 font-bold mt-1 text-lg leading-none">•</span>
                  <span>Nuestra red WiFi de alta velocidad es de uso exclusivo para actividades lícitas. La descarga masiva de material protegido o actividades ilegales resultará en el bloqueo permanente de la red.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 font-bold mt-1 text-lg leading-none">•</span>
                  <span>Café Atrato no asume responsabilidad por la pérdida, robo o daño de objetos personales (laptops, teléfonos, documentos) dentro o fuera de las instalaciones.</span>
                </li>
              </ul>
            </div>
          </section>

          <hr className="border-slate-100 my-12" />

          <section id="cancelaciones" className="scroll-mt-32 mb-16">
            <h2 className="text-2xl font-bold text-[#051D41] mb-6">4. Cancelaciones y Reembolsos</h2>
            <div className="space-y-6 text-slate-600 leading-relaxed">
              <p>Entendemos que los imprevistos ocurren. Nuestras políticas de flexibilidad son las siguientes:</p>
              
              <div className="bg-orange-50 text-orange-900 p-5 rounded-2xl text-sm border border-orange-100 my-8 shadow-sm">
                <strong className="block text-base mb-1">Nota importante</strong> 
                Puedes cancelar tu reserva con un mínimo de <strong className="text-orange-950">12 horas de anticipación</strong> para obtener un reembolso total.
              </div>
              
              <p>
                Las cancelaciones realizadas con menos de 12 horas de anticipación no serán reembolsadas en efectivo. Sin embargo, el saldo a favor podrá ser abonado para una futura visita, dependiendo siempre de la disponibilidad del local y bajo criterio exclusivo de la administración.
              </p>
            </div>
          </section>

          <hr className="border-slate-100 my-12" />

          <section id="privacidad-y-datos" className="scroll-mt-32 mb-16">
            <h2 className="text-2xl font-bold text-[#051D41] mb-6">5. Privacidad y Tratamiento de Datos</h2>
            <div className="space-y-6 text-slate-600 leading-relaxed">
              <p>
                Su privacidad es primordial para nosotros. La información personal recopilada durante el proceso de reserva (incluyendo nombre, correo electrónico y número de teléfono) será utilizada exclusivamente para la gestión logística de su visita y procesos de facturación.
              </p>
              <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl my-8">
                <strong className="text-[#051D41] font-bold flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-blue-500" />
                  Nuestra promesa
                </strong>
                <p className="text-sm">
                  Sus datos jamás serán vendidos, alquilados ni compartidos con terceros con fines publicitarios no solicitados. Todo tratamiento de información se rige estrictamente bajo las leyes colombianas de protección de datos (Ley 1581 de 2012).
                </p>
              </div>
            </div>
          </section>

        </main>
      </div>

    </div>
  )
}

