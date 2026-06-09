export default function Loading() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .reservar-loader {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #F5F1EA;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          animation: loader-fade-in 200ms ease-out;
        }
        @keyframes loader-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .reservar-loader-spinner {
          width: 56px;
          height: 56px;
          border: 4px solid rgba(5, 29, 65, 0.12);
          border-top-color: #F9B207;
          border-right-color: #F9B207;
          border-radius: 50%;
          animation: spin 800ms linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .reservar-loader-logo {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #051D41 0%, #0a2659 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #F9B207;
          font-size: 28px;
          font-weight: 900;
          box-shadow: 0 8px 24px -8px rgba(5, 29, 65, 0.4);
        }
        .reservar-loader-text {
          color: #051D41;
          font-size: 14px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          animation: pulse-text 1.5s ease-in-out infinite;
        }
        @keyframes pulse-text {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .reservar-loader-bar {
          width: 200px;
          height: 3px;
          background: rgba(5, 29, 65, 0.10);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }
        .reservar-loader-bar::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 40%;
          background: linear-gradient(90deg, #051D41, #F9B207);
          border-radius: 2px;
          animation: loader-slide 1.2s ease-in-out infinite;
        }
        @keyframes loader-slide {
          0% { left: -40%; }
          100% { left: 100%; }
        }
      `}} />
      <div className="reservar-loader" role="status" aria-live="polite">
        <div className="reservar-loader-logo">CA</div>
        <div className="reservar-loader-spinner" aria-hidden="true"></div>
        <div className="reservar-loader-text">Cargando reserva</div>
        <div className="reservar-loader-bar" aria-hidden="true"></div>
      </div>
    </>
  )
}
