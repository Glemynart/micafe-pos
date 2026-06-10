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
              <a href="https://wa.me/573102871513" target="_blank" rel="noopener" className="text-white/70 hover:text-green-400 transition-colors" title="WhatsApp">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
              </a>
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
                <a href="https://wa.me/573102871513" target="_blank" rel="noopener" className="text-white/60 hover:text-green-400 transition-colors" onClick={() => setMenuOpen(false)}>
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
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
                { Icon: Wifi, title: "Internet de Alta Velocidad", desc: "Fibra óptica simétrica con respaldo. Nunca te quedes sin conexión en medio de tu trabajo." },
                { Icon: Coffee, title: "Café y Bebidas Premium", desc: "Café de especialidad ilimitado, tés selectos, snacks saludables. Todo incluido en tu membresía." },
                { Icon: Users, title: "Comunidad Profesional", desc: "Conecta con emprendedores, freelancers y equipos innovadores en un ambiente colaborativo." },
                { Icon: Zap, title: "Espacios Flexibles", desc: "Escritorios individuales, salas de reunión privadas y áreas abiertas. Elegí dónde trabajar." },
                { Icon: Clock, title: "Horario Extendido", desc: "Abierto de 7:00 AM a 10:00 PM, los 7 días de la semana. Trabaja a tu ritmo." },
                { Icon: Lock, title: "Ambiente Seguro", desc: "Acceso controlado, lockers personales y seguridad 24/7 para tu tranquilidad." },
              ].map((item, i) => (
                <div key={i} className="group bg-white rounded-2xl shadow-sm border border-slate-100 p-6 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-[#F9B207] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="flex items-start gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-all duration-300"
                      style={{
                        backgroundColor: "#051D41",
                        border: "1.5px solid rgba(249, 178, 7, 0.25)",
                      }}
                    >
                      <item.Icon className="w-7 h-7" style={{ color: "#F9B207" }} strokeWidth={1.75} />
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
                    <p className="contact-text">Calle Principal 123<br/>Centro de la Ciudad<br/>Colombia</p>
                  </div>
                </div>

                <div className="contact-item">
                  <div className="contact-icon flex items-center justify-center">
                    <Clock className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <h3 className="contact-title">Horario</h3>
                    <p className="contact-text">Lunes - Domingo<br/>7:00 AM - 10:00 PM</p>
                  </div>
                </div>

                <div className="contact-item">
                  <div className="contact-icon flex items-center justify-center">
                    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </div>
                  <div>
                    <h3 className="contact-title">Teléfono</h3>
                    <p className="contact-text">+57 310 2871513</p>
                  </div>
                </div>

                <div className="contact-item">
                  <div className="contact-icon flex items-center justify-center">
                    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <div>
                    <h3 className="contact-title">Email</h3>
                    <p className="contact-text">hola@cafeatrato.com</p>
                  </div>
                </div>
              </div>
              
              <div className="contact-cta flex flex-col justify-center items-center text-center p-8 md:p-12" style={{ backgroundColor: '#051D41', backgroundImage: 'none' }}>
                <h3 className="cta-title">¿Listo para comenzar?</h3>
                <p className="cta-text" style={{ marginBottom: 0 }}>
                  Ven a conocer nuestro espacio. La primera visita incluye café gratis y un tour completo de nuestras instalaciones.
                </p>
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
                <a href="https://wa.me/573102871513" target="_blank" rel="noopener" title="WhatsApp" className="social-link">
                  <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
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
          href="https://wa.me/573102871513"
          target="_blank"
          rel="noopener"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-110 active:scale-95 transition-all duration-300 animate-fade-in"
          title="WhatsApp"
          style={{ animation: 'pulse-wa 2s infinite' }}
        >
          <svg width="32" height="32" viewBox="0 0 16 16" fill="white"><path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>
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
