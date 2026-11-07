import { useEffect, useState } from 'react'

/** Demo-only: fakes a network delay so skeleton states are visible. Remove when real queries land. */
export function useSimulatedLoading(ms = 450) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(t)
  }, [ms])
  return loading
}
