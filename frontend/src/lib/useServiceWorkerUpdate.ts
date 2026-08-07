import { useEffect, useState } from 'react'

/**
 * Detecta una nueva versión del service worker (build nuevo) y expone el estado
 * para que la UI ofrezca "actualizar ahora". Invoca `onSkipWaiting` / reload.
 */
export function useServiceWorkerUpdate() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
    let sw: ServiceWorkerRegistration | null = null
    let refreshing = false

    const onUpdateFound = () => {
      const newSW = sw?.installing
      if (!newSW) return
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          setUpdateReady(true)
        }
      })
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        sw = reg
        onUpdateFound()
      })
      .catch(() => {})

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })

    return () => {
      sw = null
    }
  }, [])

  /** Activa la nueva versión: pide skipWaiting y recarga automáticamente. */
  const aplicarUpdate = async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  }

  return { updateReady, aplicarUpdate }
}