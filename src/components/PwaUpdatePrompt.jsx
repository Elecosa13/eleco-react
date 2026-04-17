import React from 'react'
import { useVersion } from '../lib/version'
import { safeLocation } from '../lib/safe-browser'

export default function PwaUpdatePrompt() {
  const { updateAvailable } = useVersion()

  function applyUpdate() {
    safeLocation.reload()
  }

  if (!updateAvailable) return null

  return (
    <div className="pwa-update">
      <div>
        <div className="pwa-update__title">Nouvelle version disponible</div>
        <div className="pwa-update__text">Actualise pour charger la derniere version.</div>
      </div>
      <button type="button" onClick={applyUpdate}>Mettre a jour</button>
    </div>
  )
}
