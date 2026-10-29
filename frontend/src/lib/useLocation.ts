import { useEffect, useState } from 'react'

export const CHENNAI = { lat: 13.0827, lng: 80.2707 }

/** The device position, once. `pos` stays null if permission is denied or unavailable. */
export function useCurrentPosition() {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null)
  const [denied, setDenied] = useState(false)
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setDenied(true),
      { timeout: 10000 },
    )
  }, [])
  return { pos, denied }
}
