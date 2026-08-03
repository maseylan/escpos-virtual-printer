import { useEffect, useRef, useState } from 'react'
import type { EmulatorSnapshot } from '@shared/types'

export function useEmulatorState(): EmulatorSnapshot | null {
  const [snapshot, setSnapshot] = useState<EmulatorSnapshot | null>(null)
  const pendingRef = useRef<EmulatorSnapshot | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let mounted = true

    const flush = (): void => {
      rafRef.current = null
      if (mounted && pendingRef.current) {
        setSnapshot(pendingRef.current)
        pendingRef.current = null
      }
    }

    const scheduleFlush = (s: EmulatorSnapshot): void => {
      pendingRef.current = s
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flush)
      }
    }

    window.api.getSnapshot().then((s) => {
      if (mounted) setSnapshot(s)
    })

    const unsubscribe = window.api.onStateUpdated(scheduleFlush)

    return () => {
      mounted = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      unsubscribe()
    }
  }, [])

  return snapshot
}
