import React, { useEffect, useState } from 'react'
import { addWindowListener } from '../lib/safe-browser'
import { triggerSWUpdate } from '../lib/appBoot'

// Listens for the 'eleco-sw-update' event dispatched by appBoot when a new SW is waiting.
// Update is ONLY applied on explicit user action — never automatically.
export default function PwaUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    return addWindowListener('eleco-sw-update', () => setUpdateAvailable(true))
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="pwa-update">
      <div>
        <div className="pwa-update__title">Nouvelle version disponible</div>
        <div className="pwa-update__text">Actualise pour charger la derniere version.</div>
      </div>
      <button type="button" onClick={triggerSWUpdate}>Mettre a jour</button>
    </div>
  )
}
