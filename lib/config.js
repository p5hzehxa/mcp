'use strict'

const {
  DEFAULT_API_BASE_URL,
  DEFAULT_HTTP_TIMEOUT_MS,
} = require('./constants')

function normalizeBaseUrl(url) {
  const value = String(url || '').trim()

  if (!value) {
    throw new Error('Base URL must not be empty')
  }

  return value.endsWith('/') ? value : `${value}/`
}

function parseTimeout(value) {
  if (value == null || value === '') {
    return DEFAULT_HTTP_TIMEOUT_MS
  }

  const timeout = Number.parseInt(value, 10)

  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new Error('WAPPALYZER_HTTP_TIMEOUT_MS must be a positive integer')
  }

  return timeout
}

function loadConfig({ env = process.env, requireApiKey = true } = {}) {
  const apiKey = env.WAPPALYZER_API_KEY
  const apiBaseUrl = normalizeBaseUrl(
    env.WAPPALYZER_API_BASE_URL || DEFAULT_API_BASE_URL
  )
  const metadataBaseUrl = normalizeBaseUrl(
    env.WAPPALYZER_METADATA_BASE_URL || apiBaseUrl
  )
  const httpTimeoutMs = parseTimeout(env.WAPPALYZER_HTTP_TIMEOUT_MS)

  if (requireApiKey && !apiKey) {
    throw new Error('WAPPALYZER_API_KEY is required')
  }

  return {
    apiBaseUrl,
    apiKey: apiKey || null,
    httpTimeoutMs,
    metadataBaseUrl,
  }
}

module.exports = {
  loadConfig,
  normalizeBaseUrl,
}
