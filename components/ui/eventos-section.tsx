"use client"

import { useState, useEffect } from "react"
import { CalendarDays, Clock, Sparkles, X, MapPin, ArrowRight } from "lucide-react"
import { collection, query, where, orderBy, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { type Evento } from "@/lib/eventos-service"

const NAVY = "#051D41"
const GOLD = "#F9B207"

const catStyles: Record<string, { accent: string; chip: string; bg: string }> = {
  "Musica en vivo": { accent: "#7C3AED", chip: "#EDE9FE", bg: "#F5F3FF" },
  "Taller": { accent: "#0D9488", chip: "#CCFBF1", bg: "#F0FDFA" },
  "Conferencia": { accent: "#2563EB", chip: "#DBEAFE", bg: "#EFF6FF" },
  "Networking": { accent: GOLD, chip: "#FEF3C7", bg: "#FFFBEB" },
  "Arte y Cultura": { accent: "#E11D48", chip: "#FFE4E6", bg: "#FFF1F2" },
  "Gastronomia": { accent: "#EA580C", chip: "#FFEDD5", bg: "#FFF7ED" },
  "Otro": { accent: "#64748B", chip: "#E2E8F0", bg: "#F8FAFC" },
}

const style = (c: string) => catStyles[c] || catStyles["Otro"]
const fmt = (e: Evento) => new Date(e.fecha + "T" + e.hora).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
const dayShort = (e: Evento) => new Date(e.fecha + "T" + e.hora).toLocaleDateString("es-CO", { weekday: "short" })
const dayNum = (e: Evento) => new Date(e.fecha + "T" + e.hora).getDate()
const monthShort = (e: Evento) => new Date(e.fecha + "T" + e.hora).toLocaleDateString("es-CO", { month: "short" })

const formatTime = (hora: string) => {
  if (!hora) return ""
  const parts = hora.split(":")
  if (parts.length < 2) return hora
  let h = parseInt(parts[0], 10)
  const m = parts[1]
  const ampm = h >= 12 ? "p. m." : "a. m."
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

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

  useEffect(() => {
    if (selected) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "unset"
    }
    return () => { document.body.style.overflow = "unset" }
  }, [selected])

  if (cargando) return (
    <section style={{ background: `linear-gradient(180deg, #ffffff 0%, #F5F1EA 100%)`, padding: "5rem 0" }}>
      <div className="container text-center">
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", padding: "0.5rem 1rem", background: "white", borderRadius: "9999px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <Sparkles style={{ width: "1rem", height: "1rem", color: GOLD }} />
          <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: NAVY }}>Agenda Cultural</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem 0" }}>
          <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", border: "3px solid rgba(5, 29, 65, 0.12)", borderTopColor: GOLD, borderRightColor: GOLD, animation: "spin 800ms linear infinite" }}></div>
        </div>
      </div>
    </section>
  )

  if (eventos.length === 0) return null

  return (
    <>
      <section
        style={{
          background: "linear-gradient(180deg, #ffffff 0%, #F5F1EA 50%, #faf6ee 100%)",
          padding: "6rem 0",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: "10%", left: "-5%", width: "300px", height: "300px", borderRadius: "50%", background: GOLD, opacity: 0.06, filter: "blur(80px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "20%", right: "-5%", width: "400px", height: "400px", borderRadius: "50%", background: NAVY, opacity: 0.05, filter: "blur(100px)", pointerEvents: "none" }} />

        <div className="container mx-auto px-4 md:px-6" style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", maxWidth: "42rem", width: "100%", margin: "0 auto 4rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "1rem", padding: "0.5rem 1.25rem", background: "white", borderRadius: "9999px", boxShadow: "0 4px 16px -4px rgba(5, 29, 65, 0.08)", border: `1px solid ${GOLD}33` }}>
              <Sparkles style={{ width: "1rem", height: "1rem", color: GOLD }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: NAVY, textAlign: "center" }}>Agenda Cultural</span>
            </div>
            <h2 style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)", fontWeight: 900, color: NAVY, marginBottom: "1rem", letterSpacing: "-0.02em", lineHeight: 1.1, textAlign: "center", width: "100%" }}>
              Próximos <span style={{ color: GOLD }}>Eventos</span>
            </h2>
            <p style={{ fontSize: "1.125rem", color: "#64748B", lineHeight: 1.6, maxWidth: "36rem", textAlign: "center", margin: "0 auto" }}>
              Descubre experiencias, talleres y encuentros en Café Atrato.
            </p>
          </div>

          <div
            className="eventos-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "2rem",
              maxWidth: "80rem",
              margin: "0 auto",
            }}
          >
            <style>{`
              @media (min-width: 768px) {
                .eventos-grid { grid-template-columns: repeat(2, 1fr) !important; }
              }
              @media (min-width: 1024px) {
                .eventos-grid { grid-template-columns: repeat(3, 1fr) !important; }
              }
              @media (max-width: 767px) {
                .eventos-card-image { height: 180px !important; }
              }
              @keyframes eventos-card-in {
                from { opacity: 0; transform: translateY(24px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @keyframes eventos-spin {
                to { transform: rotate(360deg); }
              }
            `}</style>

            {eventos.slice(0, 6).map((evento, idx) => {
              const s = style(evento.categoria)
              const cat = evento.categoria || "Otro"
              return (
                <article
                  key={evento.id}
                  onClick={() => setSelected(evento)}
                  style={{
                    cursor: "pointer",
                    background: "white",
                    borderRadius: "1.5rem",
                    overflow: "hidden",
                    boxShadow: "0 4px 24px -8px rgba(5, 29, 65, 0.08)",
                    border: "1px solid rgba(5, 29, 65, 0.06)",
                    transition: "all 400ms cubic-bezier(0.16, 1, 0.3, 1)",
                    display: "flex",
                    flexDirection: "column",
                    animation: `eventos-card-in 600ms cubic-bezier(0.16, 1, 0.3, 1) ${idx * 80}ms both`,
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-6px)"
                    e.currentTarget.style.boxShadow = "0 20px 40px -12px rgba(5, 29, 65, 0.18)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)"
                    e.currentTarget.style.boxShadow = "0 4px 24px -8px rgba(5, 29, 65, 0.08)"
                  }}
                >
                  <div style={{ position: "relative", height: "220px", background: s.bg, overflow: "hidden" }} className="eventos-card-image">
                    {evento.imagenUrl ? (
                      <img
                        src={evento.imagenUrl}
                        alt={evento.titulo}
                        style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 700ms ease" }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)" }}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${s.bg} 0%, ${s.accent}22 100%)` }}>
                        <CalendarDays style={{ width: "4rem", height: "4rem", color: s.accent, opacity: 0.4 }} />
                      </div>
                    )}

                    <div style={{ position: "absolute", top: "1rem", left: "1rem" }}>
                      <span style={{
                        display: "inline-block",
                        fontSize: "0.65rem",
                        fontWeight: 800,
                        padding: "0.4rem 0.75rem",
                        borderRadius: "9999px",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        background: "white",
                        color: s.accent,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        border: `1.5px solid ${s.accent}33`,
                      }}>{cat}</span>
                    </div>

                    <div style={{
                      position: "absolute",
                      top: "1rem",
                      right: "1rem",
                      background: "white",
                      borderRadius: "0.75rem",
                      padding: "0.5rem 0.75rem",
                      textAlign: "center",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                      minWidth: "60px",
                      border: `2px solid ${NAVY}11`,
                    }}>
                      <div style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: GOLD }}>{monthShort(evento)}</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 900, lineHeight: 1, color: NAVY, marginTop: "0.1rem" }}>{dayNum(evento)}</div>
                      <div style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94A3B8", marginTop: "0.1rem" }}>{dayShort(evento)}</div>
                    </div>
                  </div>

                  <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", flex: 1 }}>
                    <h3 style={{
                      fontSize: "1.125rem",
                      fontWeight: 800,
                      color: NAVY,
                      marginBottom: "0.5rem",
                      lineHeight: 1.3,
                      letterSpacing: "-0.01em",
                    }}>
                      {evento.titulo}
                    </h3>
                    {evento.descripcion && (
                      <p style={{
                        fontSize: "0.875rem",
                        color: "#64748B",
                        marginBottom: "1.25rem",
                        lineHeight: 1.55,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}>{evento.descripcion}</p>
                    )}

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid rgba(5, 29, 65, 0.06)" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem", background: NAVY + "08", borderRadius: "0.5rem" }}>
                        <Clock style={{ width: "0.8rem", height: "0.8rem", color: GOLD }} />
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: NAVY }}>{formatTime(evento.hora)}</span>
                      </div>
                      {(evento as any).ubicacion && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.75rem", background: NAVY + "08", borderRadius: "0.5rem" }}>
                          <MapPin style={{ width: "0.8rem", height: "0.8rem", color: GOLD }} />
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: NAVY }}>{(evento as any).ubicacion}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "1rem", fontSize: "0.8rem", fontWeight: 700, color: GOLD, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Ver detalles
                      <ArrowRight style={{ width: "0.9rem", height: "0.9rem", transition: "transform 200ms" }} />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* MODAL */}
      {selected && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1rem",
            background: "rgba(5, 29, 65, 0.65)",
            backdropFilter: "blur(12px)",
            animation: "fade-in 250ms ease",
          }}
          onClick={() => setSelected(null)}
          className="eventos-modal-overlay"
        >
          <div
            style={{
              background: "white",
              borderRadius: "1.75rem",
              overflow: "hidden",
              maxWidth: "64rem",
              width: "100%",
              maxHeight: "90vh",
              boxShadow: "0 40px 80px -20px rgba(5, 29, 65, 0.5)",
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              position: "relative",
              animation: "scale-in 300ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={e => e.stopPropagation()}
            className="eventos-modal"
          >
            <style>{`
              @media (max-width: 767px) {
                .eventos-modal-overlay {
                  padding: 0 !important;
                  align-items: flex-start !important;
                }
                .eventos-modal {
                  flex-direction: column !important;
                  max-height: 100dvh !important;
                  height: 100dvh !important;
                  border-radius: 0 !important;
                  max-width: 100% !important;
                  overflow-y: auto !important;
                  display: block !important;
                }
                .eventos-modal .modal-image {
                  width: 100% !important;
                  min-height: 0 !important;
                  height: auto !important;
                  display: block !important;
                  background: transparent !important;
                }
                .eventos-modal .modal-image img {
                  width: 100% !important;
                  height: auto !important;
                  max-height: 60vh !important;
                  object-fit: contain !important;
                  display: block !important;
                  margin: 0 auto !important;
                }
                .eventos-modal .modal-content {
                  width: 100% !important;
                  padding: 1.5rem !important;
                  overflow-y: visible !important;
                }
                .eventos-modal > button {
                  position: fixed !important;
                  top: 1rem !important;
                  right: 1rem !important;
                }
              }
            `}</style>

            <button
              onClick={() => setSelected(null)}
              style={{
                position: "absolute", top: "1rem", right: "1rem", zIndex: 10,
                width: "2.5rem", height: "2.5rem",
                background: "rgba(255, 255, 255, 0.95)", color: NAVY,
                border: "none", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                cursor: "pointer", transition: "transform 150ms",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)" }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)" }}
              aria-label="Cerrar"
            >
              <X style={{ width: "1.1rem", height: "1.1rem" }} />
            </button>

            {/* Imagen */}
            <div
              className="modal-image"
              style={{
                width: "50%", position: "relative", flexShrink: 0,
                background: style(selected.categoria).bg,
                minHeight: "300px",
              }}
            >
              {selected.imagenUrl ? (
                <img
                  src={selected.imagenUrl}
                  alt={selected.titulo}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${style(selected.categoria).bg} 0%, ${style(selected.categoria).accent}22 100%)` }}>
                  <CalendarDays style={{ width: "6rem", height: "6rem", color: style(selected.categoria).accent, opacity: 0.3 }} />
                </div>
              )}
              <div style={{ position: "absolute", top: "1rem", left: "1rem" }}>
                <span style={{
                  fontSize: "0.7rem", fontWeight: 800,
                  padding: "0.5rem 0.875rem", borderRadius: "9999px",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  background: "white", color: style(selected.categoria).accent,
                  border: `1.5px solid ${style(selected.categoria).accent}33`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}>{selected.categoria}</span>
              </div>
            </div>

            {/* Contenido */}
            <div
              className="modal-content"
              style={{
                width: "50%", padding: "2.5rem", display: "flex",
                flexDirection: "column", gap: "1.5rem", overflowY: "auto",
              }}
            >
              <div>
                <h2 style={{ fontSize: "1.875rem", fontWeight: 900, color: NAVY, lineHeight: 1.2, marginBottom: "0.5rem", letterSpacing: "-0.01em" }}>
                  {selected.titulo}
                </h2>
                <div style={{ width: "60px", height: "4px", background: GOLD, borderRadius: "2px" }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1.25rem", background: "linear-gradient(135deg, rgba(5, 29, 65, 0.03) 0%, rgba(249, 178, 7, 0.05) 100%)", borderRadius: "1rem", border: "1px solid rgba(5, 29, 65, 0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center", color: NAVY, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                    <CalendarDays style={{ width: "1.1rem", height: "1.1rem" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94A3B8" }}>Fecha</p>
                    <p style={{ fontSize: "0.95rem", fontWeight: 700, color: NAVY }}>{fmt(selected)}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center", color: NAVY, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                    <Clock style={{ width: "1.1rem", height: "1.1rem" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94A3B8" }}>Hora</p>
                    <p style={{ fontSize: "0.95rem", fontWeight: 700, color: NAVY }}>{formatTime(selected.hora)}</p>
                  </div>
                </div>
                {(selected as any).ubicacion && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ width: "2.5rem", height: "2.5rem", borderRadius: "50%", background: "white", display: "flex", alignItems: "center", justifyContent: "center", color: NAVY, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}>
                      <MapPin style={{ width: "1.1rem", height: "1.1rem" }} />
                    </div>
                    <div>
                      <p style={{ fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94A3B8" }}>Ubicación</p>
                      <p style={{ fontSize: "0.95rem", fontWeight: 700, color: NAVY }}>{(selected as any).ubicacion}</p>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: GOLD, marginBottom: "0.5rem" }}>Detalles del Evento</h4>
                {selected.descripcion ? (
                  <p style={{ color: "#475569", lineHeight: 1.7, fontSize: "0.95rem", whiteSpace: "pre-wrap" }}>
                    {selected.descripcion}
                  </p>
                ) : (
                  <p style={{ color: "#94A3B8", fontStyle: "italic", fontSize: "0.95rem" }}>Sin descripción adicional para este evento.</p>
                )}
              </div>

              <button
                onClick={() => setSelected(null)}
                style={{
                  width: "100%", padding: "1rem 1.5rem",
                  background: GOLD, color: NAVY,
                  border: "none", borderRadius: "0.75rem",
                  fontWeight: 800, fontSize: "0.95rem",
                  cursor: "pointer", transition: "filter 200ms",
                  letterSpacing: "0.02em",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.08)" }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)" }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
