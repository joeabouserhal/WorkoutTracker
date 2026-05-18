import { useEffect, useState } from 'react'
import { getRestSecondsRemaining } from '@/services/restTimerSettings'

export function useRestCountdownSeconds(restEndsAt?: number | null): number {
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    getRestSecondsRemaining(restEndsAt),
  )

  useEffect(() => {
    if (!restEndsAt) {
      setSecondsRemaining(0)
      return
    }

    const updateSecondsRemaining = () => {
      setSecondsRemaining(getRestSecondsRemaining(restEndsAt))
    }

    updateSecondsRemaining()
    const interval = setInterval(updateSecondsRemaining, 1000)
    return () => clearInterval(interval)
  }, [restEndsAt])

  return secondsRemaining
}
