"use client"

import { useState, useEffect } from "react"
import { CalendarDays, Clock, Sparkles, X } from "lucide-react"
import { collection, query, where, orderBy, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { type Evento } from "@/lib/eventos-service"

const catStyles: Record<string, { gradient: string; badge: string; text: string }> = {
  "Musica en vivo": { gradient: "from-purple-600 to-indigo-600", badge: "bg-purple-100", text: "text-purple-700" },
  "Taller": { gradient: "from-emerald-600 to-teal-600", badge: "bg-emerald-100", text: "text-emerald-700" },
  "Conferencia": { gradient: "from-blue-600 to-cyan-600", badge: "bg-blue-100", text: "text-blue-700" },
  "Networking": { gradient: "from-amber-500 to-orange-500", badge: "bg-amber-100", text: "text-amber-700" },
  "Arte y Cultura": { gradient: "from-rose-500 to-pink-500", badge: "bg-rose-100", text: "text-rose-700" },
  "Gastronomia": { gradient: "from-orange-500 to-red-500", badge: "bg-orange-100", text: "text-orange-700" },
  "Otro": { gradient: "from-slate-500 to-slate-700", badge: "bg-slate-100", text: "text-slate-700" },
}

const style = (c: string) => catStyles[c] || catStyles["Otro"]
const fmt = (e: Evento) => new Date(e.fecha + "T" + e.hora).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short" })

export function EventosSection() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Evento | null>(null)

  useEffect(() => {
    const hoy = new Date().toISOString().split("T")[0]
    const q = query(collection(db, "eventos"), where("activo", "==", true), orderBy("fecha", "asc"))
    getDocs(q).then(snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Evento))
      setEventos(data.filter(e => e.fecha >= hoy))
    }).catch(err => {
      console.error("Error cargando eventos:", err)
      setError(true)
    }).finally(() => setCargando(false))
  }, [])

  // Deshabilitar scroll del body cuando el modal está abierto
  useEffect(() => {
    if (selected) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => { document.body.style.overflow = "unset" }
  }, [selected])

  if (cargando) return (
    <section className="py-24" style={{ backgroundColor: "#faf7f2" }}>
      <div className="container text-center">
        <div className="flex items-center justify-center gap-2 mb-2 animate-pulse">
          <Sparkles className="w-5 h-5 text-secondary" />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Agenda Cultural</span>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        </div>
      </div>
    </section>
  )

  if (eventos.length === 0) return null

  return (
    <>
      <section className="py-24" style={{ backgroundColor: "#faf7f2" }}>
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center justify-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-white shadow-sm border border-slate-100">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-700">Agenda Cultural</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight w-full">Próximos Eventos</h2>
            <p className="text-lg text-slate-500 w-full">Descubre experiencias, talleres y encuentros en Café Atrato.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 max-w-7xl mx-auto">
            {eventos.slice(0, 6).map((evento, idx) => {
              const s = style(evento.categoria)
              return (
                <div
                  key={evento.id}
                  onClick={() => setSelected(evento)}
                  className="group cursor-pointer bg-white rounded-[2rem] p-3 shadow-sm border border-slate-100 overflow-hidden hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-2 transition-all duration-500 flex flex-col"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="relative h-64 rounded-[1.5rem] overflow-hidden mb-4 bg-slate-50">
                    {evento.imagenUrl ? (
                      <img 
                        src={evento.imagenUrl} 
                        alt={evento.titulo} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" 
                      />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${s.gradient} flex items-center justify-center group-hover:scale-105 transition-transform duration-700`}>
                        <CalendarDays className="w-16 h-16 text-white/30" />
                      </div>
                    )}
                    {/* Degradado inferior sutil para contraste */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    {/* Badge flotante */}
                    <div className="absolute top-4 left-4">
                      <span className={`text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm backdrop-blur-md bg-white/90 ${s.text}`}>
                        {evento.categoria}
                      </span>
                    </div>
                  </div>
                  
                  <div className="px-4 pb-4 flex flex-col flex-1">
                    <h3 className="text-xl font-bold text-slate-900 mb-2 leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {evento.titulo}
                    </h3>
                    {evento.descripcion && (
                      <p className="text-sm text-slate-500 mb-6 line-clamp-2 leading-relaxed flex-1">{evento.descripcion}</p>
                    )}
                    
                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 pt-4 border-t border-slate-100/80 mt-auto">
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                        <CalendarDays className="w-4 h-4 text-primary" />
                        <span>{fmt(evento)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                        <Clock className="w-4 h-4 text-primary" />
                        <span>{evento.hora}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* MODAL PRO MAX (2 Columnas en Desktop) */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-[2rem] overflow-hidden max-w-4xl w-full max-h-[90vh] shadow-2xl animate-scale-in flex flex-col md:flex-row relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Botón Cerrar Flotante Absoluto (Móvil y Desktop) */}
            <button
              onClick={() => setSelected(null)}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/80 hover:bg-white text-slate-900 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md transition-all active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Columna Izquierda: Imagen (Poster) */}
            <div className="w-full md:w-1/2 bg-slate-100 relative h-64 md:h-auto shrink-0 flex items-center justify-center">
              {selected.imagenUrl ? (
                // object-contain para que no se corte el afiche, con altura 100% en desktop
                <img
                  src={selected.imagenUrl}
                  alt={selected.titulo}
                  className="w-full h-full object-contain p-4 md:p-8"
                />
              ) : (
                <div className={`w-full h-full bg-gradient-to-br ${style(selected.categoria).gradient} flex items-center justify-center`}>
                  <CalendarDays className="w-24 h-24 text-white/20" />
                </div>
              )}
            </div>

            {/* Columna Derecha: Contenido y Detalles */}
            <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-3 mb-6">
                <span className={`text-[11px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${style(selected.categoria).badge} ${style(selected.categoria).text}`}>
                  {selected.categoria}
                </span>
              </div>

              <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-6 leading-tight">
                {selected.titulo}
              </h2>

              <div className="flex flex-col gap-3 mb-8 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 text-primary">
                    <CalendarDays className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Fecha</p>
                    <p className="text-sm font-semibold text-slate-800">{fmt(selected)}</p>
                  </div>
                </div>
                
                <div className="h-px w-full bg-slate-200/60 my-1"></div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 text-primary">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hora</p>
                    <p className="text-sm font-semibold text-slate-800">{selected.hora}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1">
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Detalles del Evento</h4>
                {selected.descripcion ? (
                  <p className="text-slate-600 leading-relaxed text-sm whitespace-pre-wrap">
                    {selected.descripcion}
                  </p>
                ) : (
                  <p className="text-slate-400 italic text-sm">Sin descripción adicional para este evento.</p>
                )}
              </div>

              {/* Espaciador inferior */}
              <div className="mt-8 pt-6 border-t border-slate-100">
                <button
                  onClick={() => setSelected(null)}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-lg shadow-slate-900/20"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
