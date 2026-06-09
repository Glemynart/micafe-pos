"use client"

import { APIProvider, Map, AdvancedMarker, Pin, useMap, InfoWindow } from "@vis.gl/react-google-maps"
import { useState, useCallback } from "react"

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ""
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID
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
  const mapProps: any = {
    defaultCenter: CAFE_POS,
    defaultZoom: 17,
    defaultTilt: 55,
    defaultHeading: -20,
    gestureHandling: "greedy",
    disableDefaultUI: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: false,
    className,
    style: { width: "100%" },
  }
  if (MAP_ID) mapProps.mapId = MAP_ID

  return (
    <APIProvider apiKey={API_KEY}>
      <Map {...mapProps}>
        <CafeMarker />
      </Map>
    </APIProvider>
  )
}
