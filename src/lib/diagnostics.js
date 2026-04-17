const DIAGNOSTIC_PREFIX = 'eleco'
const DIAGNOSTIC_STORAGE_KEY = 'eleco_diagnostics'

function canReadDiagnosticsFlag() {
  try {
    const search = globalThis?.location?.search || ''
    if (search.includes('debug=1') || search.includes('diag=1')) return true
    return globalThis?.localStorage?.getItem(DIAGNOSTIC_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function diagnosticsEnabled() {
  return Boolean(import.meta.env.DEV || canReadDiagnosticsFlag())
}

export function diag(layer, message, data, level = 'info') {
  const shouldLog = level === 'error' || level === 'warn' || diagnosticsEnabled()
  if (!shouldLog) return

  const prefix = `[${DIAGNOSTIC_PREFIX}:${layer}] ${message}`
  const logger = console[level] || console.log
  if (data === undefined) {
    logger(prefix)
    return
  }
  logger(prefix, data)
}

export function enableDiagnostics() {
  try {
    globalThis?.localStorage?.setItem(DIAGNOSTIC_STORAGE_KEY, '1')
  } catch {
    // Diagnostic activation must never affect app boot.
  }
}

export function disableDiagnostics() {
  try {
    globalThis?.localStorage?.removeItem(DIAGNOSTIC_STORAGE_KEY)
  } catch {
    // Diagnostic activation must never affect app boot.
  }
}
