'use client'

import React, { useEffect, useRef, useState } from 'react'
import './landing.css'
import Link from 'next/link'
import { Wifi, Coffee, Presentation, MapPin, Users, Zap, Clock, Lock, Menu, X } from 'lucide-react'
import dynamic from 'next/dynamic'
import { EventosSection } from '@/components/ui/eventos-section'
import { AdBanner } from '@/components/ui/ad-banner'

const CafeMap = dynamic(() => import('@/components/ui/cafe-map').then(m => ({ default: m.CafeMap })), {
  ssr: false,
  loading: () => (
    <div className="w-full rounded-3xl overflow-hidden shadow-xl mb-12 border-4 border-white/80 h-64 sm:h-96 bg-[#eef8fc] flex items-center justify-center">
      <MapPin className="w-8 h-8 animate-bounce text-primary/40" />
    </div>
  )
})

export default function LandingPage() {
  const orbitLayerRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (orbitLayerRef.current) {
        const x = (e.clientX / window.innerWidth - 0.5) * 10
        const y = (e.clientY / window.innerHeight - 0.5) * 10
        orbitLayerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
    }
    window.addEventListener('mousemove', handleMouseMove)

    // Smooth scroll para el indicador
    const scrollIndicator = document.querySelector('.scroll-indicator')
    const aboutSection = document.querySelector('.about')
    const handleScrollClick = () => {
      if (aboutSection) aboutSection.scrollIntoView({ behavior: 'smooth' })
    }
    if (scrollIndicator) scrollIndicator.addEventListener('click', handleScrollClick)

    // Animacion de interseccion mejorada con stagger
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' })

    const animatedElements = document.querySelectorAll('.feature-card, .section-header, .about-grid, .contact-grid')
    animatedElements.forEach(el => {
      observer.observe(el)
    })

    // Safety fallback: reveal all elements after 1.5s if observer hasn't fired
    const safetyTimer = setTimeout(() => {
      document.querySelectorAll('.feature-card, .section-header, .about-grid, .contact-grid').forEach(el => {
        el.classList.add('visible')
      })
    }, 1500)

    // Parallax mejorado con GPU acceleration
    let rafId: number
    const handleWindowScroll = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const hero = document.querySelector('.hero-background img') as HTMLElement
        if (hero) {
          const scrolled = window.pageYOffset
          hero.style.transform = `translate3d(0, ${scrolled * 0.4}px, 0)`
        }
      })
    }
    window.addEventListener('scroll', handleWindowScroll, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (scrollIndicator) scrollIndicator.removeEventListener('click', handleScrollClick)
      window.removeEventListener('scroll', handleWindowScroll)
      if (rafId) cancelAnimationFrame(rafId)
      clearTimeout(safetyTimer)
      observer.disconnect()
    }
  }, [])

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Pacifico&display=swap" rel="stylesheet" />
      <div className="landing-body">
        {/* Navbar */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-primary/95 backdrop-blur-md border-b border-white/10">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <a href="#" className="flex items-center gap-2.5">
              <img src="/landing-assets/iconpx.png" alt="Logo" className="w-8 h-8" />
              <span className="text-white font-bold text-lg pacifico-regular">Café Atrato</span>
            </a>
            <div className="hidden md:flex items-center gap-6">
              <a href="#about" className="text-white/70 hover:text-secondary transition-colors text-sm font-medium">Sobre Nosotros</a>
              <a href="#features" className="text-white/70 hover:text-secondary transition-colors text-sm font-medium">Servicios</a>
              <a href="#menu" className="text-white/70 hover:text-secondary transition-colors text-sm font-medium">Carta</a>
              <a href="#contact" className="text-white/70 hover:text-secondary transition-colors text-sm font-medium">Ubicación</a>
              <a href="https://www.instagram.com/cafeatrato/" target="_blank" rel="noopener" className="text-white/70 hover:text-pink-400 transition-colors" title="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
              </a>
              <a href="#" target="_blank" rel="noopener" className="text-white/70 hover:text-green-400 transition-colors" title="WhatsApp">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1110.1-1.4L3 21z"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9.5 13.5c.82.83 2.15.85 3 .03"/></svg>
              </a>
              <Link href="/reservar" className="bg-secondary text-primary px-5 py-2 rounded-full font-semibold text-sm hover:bg-secondary/90 transition-all">Reservar</Link>
            </div>
            <button className="md:hidden text-white p-2" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
          {menuOpen && (
            <div className="md:hidden bg-primary/98 border-t border-white/10 px-4 py-4 space-y-3">
              <a href="#about" onClick={() => setMenuOpen(false)} className="block text-white/70 hover:text-secondary transition-colors text-sm py-2">Sobre Nosotros</a>
              <a href="#features" onClick={() => setMenuOpen(false)} className="block text-white/70 hover:text-secondary transition-colors text-sm py-2">Servicios</a>
              <a href="#menu" onClick={() => setMenuOpen(false)} className="block text-white/70 hover:text-secondary transition-colors text-sm py-2">Carta</a>
              <a href="#contact" onClick={() => setMenuOpen(false)} className="block text-white/70 hover:text-secondary transition-colors text-sm py-2">Ubicación</a>
              <Link href="/reservar" onClick={() => setMenuOpen(false)} className="block w-full text-center bg-secondary text-primary px-5 py-3 rounded-full font-semibold text-sm">Reservar una Sala</Link>
              <div className="flex items-center gap-4 pt-2 justify-center">
                <a href="https://www.instagram.com/cafeatrato/" target="_blank" rel="noopener" className="text-white/60 hover:text-pink-400 transition-colors" onClick={() => setMenuOpen(false)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                </a>
                <a href="#" target="_blank" rel="noopener" className="text-white/60 hover:text-green-400 transition-colors" onClick={() => setMenuOpen(false)}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1110.1-1.4L3 21z"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9.5 13.5c.82.83 2.15.85 3 .03"/></svg>
                </a>
              </div>
            </div>
          )}
        </nav>
        {/* Hero Section */}
        <section className="hero">
          <div className="hero-background">
            <img src="/landing-assets/cover-1.png" alt="Café Atrato coworking space" />
            <div className="hero-overlay"></div>
          </div>
          
          <div className="hero-orbit-layer" ref={orbitLayerRef}>
            <div className="bean-orbit bean-orbit-1"><div className="bean bean-1"></div></div>
            <div className="bean-orbit bean-orbit-2"><div className="bean bean-2"></div></div>
            <div className="bean-orbit bean-orbit-3"><div className="bean bean-3"></div></div>
            <div className="bean-orbit bean-orbit-4"><div className="bean bean-4"></div></div>
            <div className="bean-orbit bean-orbit-5"><div className="bean bean-5"></div></div>
            <div className="bean-orbit bean-orbit-6"><div className="bean bean-6"></div></div>
          </div>

          <div className="hero-content">
            <div className="hero-brand">
              <img src="/landing-assets/iconpx.png" alt="Logo Café Atrato" className="hero-icon" />
              <h1 className="hero-title pacifico-regular">Café Atrato</h1>
            </div>
            
            <p className="hero-tagline">Coworking cultural y empresarial</p>
            <p className="hero-description">
              Un espacio premium diseñado para profesionales que buscan 
              productividad, comunidad y el mejor café tradicional
            </p>
            
            <div className="hero-buttons">
              <Link href="/reservar" className="btn btn-primary btn-3d">
                Reservar una Sala
              </Link>
            </div>
            
            <div className="hero-features">
              <div className="hero-feature">
                <Wifi className="w-6 h-6 text-secondary" />
                <span>WiFi y Equipos</span>
              </div>
              <div className="hero-feature">
                <Coffee className="w-6 h-6 text-secondary" />
                <span>Café Premium</span>
              </div>
              <div className="hero-feature">
                <Presentation className="w-6 h-6 text-secondary" />
                <span>Sala de Juntas</span>
              </div>
            </div>
          </div>
          
          <div className="scroll-indicator">
            <div className="scroll-icon"></div>
          </div>
        </section>

        {/* About Section */}
        <section className="about" id="about">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Más que un Café</h2>
              <p className="section-subtitle">Un ecosistema completo para hacer realidad tus mejores ideas</p>
            </div>
            
            <div className="about-grid">
              <div className="about-text">
                <h3 className="about-heading">Excelencia en Cada Taza</h3>
                <p className="about-paragraph">
                  En Café Atrato, creemos que el trabajo excepcional comienza con café excepcional. 
                  Nuestros baristas expertos preparan cada bebida con precisión y pasión.
                </p>
                <p className="about-paragraph">
                  Desde espressos perfectamente equilibrados hasta lattes creativos, cada taza 
                  está diseñada para inspirarte a lo largo de tu jornada.
                </p>
              </div>
              <div className="about-image">
                <img src="/landing-assets/Coffee-1.png" alt="Barista profesional" />
              </div>
            </div>
            
            <div className="about-grid about-grid-reverse">
              <div className="about-image">
                <img src="/landing-assets/audit.png" alt="Espacio de trabajo moderno" />
              </div>
              <div className="about-text">
                <h3 className="about-heading">Tu Oficina Perfecta</h3>
                <p className="about-paragraph">
                  Espacios de trabajo diseñados pensando en tu comodidad y productividad. 
                  Desde mesas individuales hasta sala de reuniones privadas.
                </p>
                <p className="about-paragraph">
                  Conectividad de alta velocidad, enchufes en cada mesa, y un ambiente 
                  que fomenta tanto la concentración profunda como la colaboración creativa.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Menu Section */}
        <section id="menu" className="py-16 bg-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="section-title">Nuestra Carta</h2>
            <p className="section-subtitle">Escanea o dale click al código QR para explorar nuestro menú digital</p>
            <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden shadow-xl mt-10 hover:shadow-2xl transition-all cursor-pointer">
              <Link href="#">
                <img src="/landing-assets/carta-btn.jpg" alt="Nuestra Carta" className="w-full h-auto object-cover" />
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16" style={{ backgroundColor: '#eef8fc' }}>
          <div className="container mx-auto px-4">
            <div className="section-header text-center mb-12">
              <h2 className="section-title">Todo lo que Necesitas</h2>
              <p className="section-subtitle">Facilidades diseñadas para maximizar tu productividad y comodidad</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {[
                { Icon: Wifi, color: "from-blue-500 to-cyan-500", bg: "from-blue-500 to-cyan-500", title: "Internet de Alta Velocidad", desc: "Fibra óptica simétrica con respaldo. Nunca te quedes sin conexión en medio de tu trabajo." },
                { Icon: Coffee, color: "from-amber-600 to-orange-500", bg: "from-amber-600 to-orange-500", title: "Café y Bebidas Premium", desc: "Café de especialidad ilimitado, tés selectos, snacks saludables. Todo incluido en tu membresía." },
                { Icon: Users, color: "from-purple-500 to-pink-500", bg: "from-purple-500 to-pink-500", title: "Comunidad Profesional", desc: "Conecta con emprendedores, freelancers y equipos innovadores en un ambiente colaborativo." },
                { Icon: Zap, color: "from-emerald-500 to-teal-500", bg: "from-emerald-500 to-teal-500", title: "Espacios Flexibles", desc: "Escritorios individuales, salas de reunión privadas y áreas abiertas. Elegí dónde trabajar." },
                { Icon: Clock, color: "from-rose-500 to-red-500", bg: "from-rose-500 to-red-500", title: "Horario Extendido", desc: "Abierto de 7:00 AM a 10:00 PM, los 7 días de la semana. Trabaja a tu ritmo." },
                { Icon: Lock, color: "from-slate-600 to-slate-800", bg: "from-slate-600 to-slate-800", title: "Ambiente Seguro", desc: "Acceso controlado, lockers personales y seguridad 24/7 para tu tranquilidad." },
              ].map((item, i) => (
                <div key={i} className="feature-card group bg-white rounded-2xl shadow-sm border border-slate-100 p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${item.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.bg} flex items-center justify-center shrink-0 shadow-lg group-hover:shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}
                      style={{ perspective: "200px" }}>
                      <item.Icon className="w-7 h-7 text-white drop-shadow-md" style={{ transform: "rotate3d(1, -0.5, 0, 15deg)" }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-primary mb-2">{item.title}</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Ad Space */}
        <AdBanner />

        {/* Events Section */}
        <EventosSection />

        {/* Contact Section */}
        <section id="contact" className="contact">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Visítanos</h2>
              <p className="section-subtitle">Encuentra tu nuevo espacio favorito para trabajar</p>
            </div>
            
            <CafeMap className="w-full rounded-3xl overflow-hidden shadow-xl mb-12 border-4 border-white/80 h-64 sm:h-96" />
            
            <div className="contact-grid">
              <div className="contact-info">
                {/* Contact items */}
                <div className="contact-item">
                  <div className="contact-icon flex items-center justify-center">
                    <MapPin className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="contact-title">Ubicación</h3>
                    <p className="contact-text">Calle Principal 123<br/>Colombia</p>
                  </div>
                </div>
              </div>
              
              <div className="contact-cta">
                <h3 className="cta-title">¿Listo para reunirte?</h3>
                <p className="cta-text">
                  Reserva nuestra sala de juntas ahora mismo, paga en línea de forma segura y recibe tu confirmación al instante.
                </p>
                <Link href="/reservar" className="btn btn-secondary text-center">
                  Agendar Sala
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="footer">
          <div className="container">
            <div className="footer-content">
              <div className="footer-brand">
                <span className="footer-title">Café Atrato</span>
              </div>
              <div className="footer-social">
                <a href="https://www.instagram.com/cafeatrato/" target="_blank" rel="noopener" title="Instagram" className="social-link">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                </a>
                <a href="https://wa.me/57" target="_blank" rel="noopener" title="WhatsApp" className="social-link">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1110.1-1.4L3 21z"/><path d="M9 10h.01"/><path d="M15 10h.01"/><path d="M9.5 13.5c.82.83 2.15.85 3 .03"/></svg>
                </a>
              </div>
              <div className="footer-copyright">
                <p>&copy; 2026 Café Atrato. Todos los derechos reservados.</p>
              </div>
            </div>
          </div>
        </footer>

        {/* Floating WhatsApp Button */}
        <a
          href="#"
          target="_blank"
          rel="noopener"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-300 animate-fade-in"
          title="WhatsApp"
          style={{ animation: 'pulse-wa 2s infinite' }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1110.1-1.4L3 21z"/><path d="M9 10a1 1 0 012 0"/><path d="M15 10a1 1 0 012 0"/><path fill="white" d="M9.5 13.5c.82.83 2.15.85 3 .03"/></svg>
        </a>
        <style>{`
          @keyframes pulse-wa {
            0%, 100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.4); }
            50% { box-shadow: 0 0 0 15px rgba(37, 211, 102, 0); }
          }
        `}</style>
      </div>
    </>
  )
}
