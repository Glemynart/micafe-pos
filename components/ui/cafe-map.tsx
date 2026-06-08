"use client"

import { APIProvider, Map, AdvancedMarker, Pin, useMap, InfoWindow } from "@vis.gl/react-google-maps"
import { useState, useCallback } from "react"

const API_KEY = "AIzaSyBq89MRjpxK3i7hOpNC3XyRh7bXqVHzyu0"
const MAP_ID = "63edc2682a2d191f5151411e"
const CAFE_POS = { lat: 7.757872, lng: -76.659176 }

function CafeMarker() {
  const [open, setOpen] = useState(false)
  const map = useMap()

  const handleClick = useCallback(() => {
    setOpen(true)
    if (map) {
      map.panTo(CAFE_POS)
      map.setZoom(18)
    }
  }, [map])

  return (
    <>
      <AdvancedMarker position={CAFE_POS} onClick={handleClick}>
        <div style={{ position: "relative" }}>
          <div style={{
            width: 42, height: 42,
            background: "linear-gradient(135deg, #5C3D2E, #C68F5C)",
            borderRadius: "50% 50% 50% 0",
            transform: "rotate(-45deg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "3px solid white",
            boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
          }}>
            <span style={{ transform: "rotate(45deg)", fontSize: 20 }}>☕</span>
          </div>
        </div>
      </AdvancedMarker>
      {open && (
        <InfoWindow position={CAFE_POS} onCloseClick={() => setOpen(false)}>
          <div style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 4 }}>
            <strong style={{ color: "#5C3D2E", fontSize: 14 }}>☕ Café Atrato</strong><br />
            <span style={{ color: "#6B7280", fontSize: 11 }}>Coworking cultural y empresarial</span><br />
            <a
              href="https://maps.app.goo.gl/CJibYRTCs7TtaksVA"
              target="_blank"
              rel="noopener"
              style={{
                display: "inline-block", marginTop: 8, padding: "6px 14px",
                background: "#5C3D2E", color: "white", borderRadius: 20,
                textDecoration: "none", fontSize: 11, fontWeight: 600,
              }}
            >
              Cómo llegar
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  )
}

export function CafeMap({ className }: { className?: string }) {
  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        mapId={MAP_ID}
        defaultCenter={CAFE_POS}
        defaultZoom={17}
        defaultTilt={55}
        defaultHeading={-20}
        gestureHandling="greedy"
        disableDefaultUI
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        zoomControl={false}
        className={className}
        style={{ width: "100%" }}
      >
        <CafeMarker />
      </Map>
    </APIProvider>
  )
}
