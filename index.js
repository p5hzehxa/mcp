#!/usr/bin/env node

'use strict'

const { loadConfig } = require('./lib/config')
const { startServer } = require('./lib/server')

async function main() {
  const config = loadConfig()

  await startServer(config)
}

main().catch((error) => {
  const message = error && error.message ? error.message : String(error)

  process.stderr.write(`wappalyzer-mcp: ${message}\n`)
  process.exitCode = 1
})
