import Link from "next/link"
import { ArrowLeft, FileText, CalendarCheck, Wifi, RefreshCcw, Users, ShieldCheck, MessageCircle } from "lucide-react"

export const metadata = {
  title: "Términos y Condiciones - Café Atrato",
  description: "Términos y condiciones de servicio para reservas, coworking y eventos en Café Atrato.",
}

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] selection:bg-[#F9B207] selection:text-[#051D41]">
      {/* Sticky Header */}
      <header className="bg-white/80 backdrop-blur-md text-[#051D41] py-4 shadow-sm sticky top-0 z-50 border-b border-slate-100 transition-all">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:text-[#F9B207] transition-colors font-bold text-sm tracking-wide uppercase">
            <ArrowLeft className="w-5 h-5" />
            Volver al inicio
          </Link>
          <div className="hidden md:flex font-black text-xl tracking-tighter">
            CAFÉ<span className="text-[#F9B207]">ATRATO</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 bg-[#051D41] overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[url('/landing-assets/texture.png')] bg-repeat opacity-30"></div>
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-[#051D41] to-transparent"></div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-[#F9B207] opacity-5 blur-[80px]"></div>
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-white opacity-5 blur-[60px]"></div>

        <div className="container mx-auto px-4 relative z-10 text-center max-w-3xl">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#F9B207] text-[#051D41] mb-6 shadow-[0_0_30px_rgba(249,178,7,0.3)]">
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight leading-tight">
            Términos, Condiciones <br/> <span className="text-[#F9B207]">y Privacidad</span>
          </h1>
          <p className="text-slate-300 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
            Las reglas claras conservan la amistad. Conoce cómo cuidamos tu experiencia y tus datos en nuestro espacio.
          </p>
          <div className="mt-8 inline-block px-4 py-1.5 rounded-full bg-white/10 text-white/80 text-sm font-semibold backdrop-blur-sm border border-white/10">
            Última actualización: Junio de 2026
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16 max-w-4xl -mt-10 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1 */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-lg transition-shadow duration-300 md:col-span-2">
            <h2 className="text-2xl font-bold text-[#051D41] mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#051D41]/5 text-[#051D41] flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              Información General
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Al acceder y utilizar los servicios de <strong className="text-[#051D41]">Café Atrato</strong>, incluyendo nuestra cafetería, espacios de coworking, y la reserva de eventos a través de nuestra plataforma web, usted acepta estar sujeto a estos Términos y Condiciones. Si no está de acuerdo con alguna parte de los términos, le sugerimos no utilizar nuestros servicios de reserva online.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-lg transition-shadow duration-300">
            <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                <CalendarCheck className="w-5 h-5" />
              </div>
              Reservas y Pagos
            </h2>
            <ul className="space-y-3 text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-[#F9B207] font-bold mt-0.5">•</span>
                Las reservas deben realizarse con antelación vía web.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#F9B207] font-bold mt-0.5">•</span>
                Pagos procesados de forma 100% segura por Wompi.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#F9B207] font-bold mt-0.5">•</span>
                Reserva confirmada únicamente con el pago exitoso.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 font-bold mt-0.5">•</span>
                <span className="text-slate-700 font-medium">Tiempo de gracia:</span> 30 minutos. Pasado este tiempo, la mesa podrá reasignarse sin reembolso.
              </li>
            </ul>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-lg transition-shadow duration-300">
            <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Wifi className="w-5 h-5" />
              </div>
              Uso del Coworking
            </h2>
            <p className="text-slate-600 mb-4">El respeto es la base de nuestra comunidad:</p>
            <ul className="space-y-3 text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold mt-0.5">•</span>
                Uso obligatorio de auriculares en zonas de trabajo silencioso.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold mt-0.5">•</span>
                Red WiFi exclusiva para actividades lícitas. Prohibida la descarga masiva pirata.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold mt-0.5">•</span>
                Café Atrato no asume responsabilidad por pérdida de objetos personales.
              </li>
            </ul>
          </div>

          {/* Card 4 */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-lg transition-shadow duration-300">
            <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                <RefreshCcw className="w-5 h-5" />
              </div>
              Cancelaciones
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              Sabemos que los planes cambian. Puedes cancelar con un mínimo de <strong className="text-[#051D41]">12 horas de anticipación</strong> para obtener un reembolso total.
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600">
              Cancelaciones con menos de 12 horas no serán reembolsadas en efectivo, pero el saldo podrá ser abonado para una futura visita (sujeto a disponibilidad).
            </div>
          </div>

          {/* Card 5 */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-lg transition-shadow duration-300">
            <h2 className="text-xl font-bold text-[#051D41] mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              Eventos y Talleres
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Los eventos promocionados que sean organizados por terceros son responsabilidad exclusiva del organizador o ponente. Café Atrato actúa únicamente como facilitador del espacio físico y canal de promoción.
            </p>
          </div>

          {/* Card 6 - Full Width */}
          <div className="bg-gradient-to-br from-[#051D41] to-[#0A2E61] rounded-3xl p-8 shadow-md md:col-span-2 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-[50px] -mr-20 -mt-20"></div>
            
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              Privacidad y Tratamiento de Datos
            </h2>
            <p className="text-white/80 leading-relaxed relative z-10 md:text-lg">
              La información personal recopilada (nombre, correo, teléfono) se usa exclusivamente para la gestión de su reserva y facturación. 
              <br/><br/>
              <strong className="text-white font-bold">Promesa de oro:</strong> Sus datos jamás serán vendidos ni compartidos con terceros con fines publicitarios. Nos regimos estrictamente bajo las leyes colombianas de protección de datos (Ley 1581 de 2012).
            </p>
          </div>

        </div>

        {/* Contact Footer */}
        <div className="mt-16 text-center">
          <div className="inline-flex flex-col items-center justify-center p-8 bg-white rounded-3xl shadow-sm border border-slate-100 max-w-xl mx-auto">
            <div className="w-12 h-12 bg-[#25D366]/10 text-[#25D366] rounded-full flex items-center justify-center mb-4">
              <MessageCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-[#051D41] mb-2">¿Tienes alguna duda legal?</h3>
            <p className="text-slate-500 mb-6">Nuestro equipo está listo para aclarar cualquier inquietud sobre nuestros términos de servicio.</p>
            <a 
              href="https://wa.me/573102871513" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#25D366] text-white px-8 py-3.5 rounded-full font-bold hover:bg-[#1ebd5a] transition-all hover:scale-105 shadow-[0_8px_20px_-4px_rgba(37,211,102,0.4)]"
            >
              Contactar por WhatsApp
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}

