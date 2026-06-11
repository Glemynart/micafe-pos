"use client"

export function AdBanner() {
  return (
    <section
      style={{
        background: "linear-gradient(135deg, #051D41 0%, #0a2659 50%, #1976c5 100%)",
        padding: "2.5rem 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-50px",
          right: "-50px",
          width: "200px",
          height: "200px",
          borderRadius: "50%",
          background: "#F9B207",
          opacity: 0.08,
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-50px",
          left: "-50px",
          width: "200px",
          height: "200px",
          borderRadius: "50%",
          background: "#F9B207",
          opacity: 0.08,
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <div className="container max-w-4xl mx-auto px-4" style={{ position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", maxWidth: "640px", margin: "0 auto" }}>
          <p
            style={{
              display: "inline-block",
              padding: "0.4rem 1rem",
              background: "rgba(249, 178, 7, 0.15)",
              border: "1px solid rgba(249, 178, 7, 0.3)",
              borderRadius: "9999px",
              fontSize: "0.7rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              color: "#F9B207",
              marginBottom: "1rem",
            }}
          >
            ¿Tienes un evento?
          </p>
          <h3 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#ffffff", lineHeight: 1.3, marginBottom: "0.5rem", letterSpacing: "-0.01em" }}>
            Promociona tu evento o taller en Café Atrato
          </h3>
          <p style={{ color: "rgba(255, 255, 255, 0.7)", fontSize: "0.95rem", marginBottom: "1.25rem" }}>
            Este espacio es para ti
          </p>
          <a
            href="https://wa.me/573102871513?text=Hola,%20me%20gustar%C3%ADa%20agendar%20un%20evento%20en%20Caf%C3%A9%20Atrato"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:scale-105 transition-transform duration-300"
            style={{
              display: "inline-block",
              padding: "0.85rem 1.75rem",
              background: "#F9B207",
              color: "#051D41",
              borderRadius: "9999px",
              fontWeight: 800,
              fontSize: "1rem",
              boxShadow: "0 8px 20px -4px rgba(249, 178, 7, 0.4)",
              textDecoration: "none",
              animation: "pulse-glow 2.5s infinite"
            }}
          >
            <style>{`
              @keyframes pulse-glow {
                0%, 100% { box-shadow: 0 8px 20px -4px rgba(249, 178, 7, 0.4); transform: scale(1); }
                50% { box-shadow: 0 8px 30px 4px rgba(249, 178, 7, 0.6); transform: scale(1.02); }
              }
            `}</style>
            ¡Agenda tu próximo evento!
          </a>
          <p style={{ color: "rgba(255, 255, 255, 0.55)", fontSize: "0.8rem", marginTop: "0.75rem", letterSpacing: "0.02em" }}>
            Contáctanos por WhatsApp o Instagram
          </p>
        </div>
      </div>
    </section>
  )
}
