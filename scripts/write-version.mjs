import { mkdirSync, writeFileSync } from 'node:fs'

const version = new Date().toISOString()

mkdirSync('public', { recursive: true })
mkdirSync('src/generated', { recursive: true })

writeFileSync('public/version.json', `${JSON.stringify({ version }, null, 2)}\n`)
writeFileSync('src/generated/version.js', `export const APP_VERSION = ${JSON.stringify(version)}\n`)

console.log('VERSION', version)
