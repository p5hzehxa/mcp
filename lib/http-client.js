'use strict'

const { METADATA_CACHE_TTL_MS } = require('./constants')
const { UpstreamHttpError } = require('./errors')

function parseJsonBody(text) {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch (error) {
    return text
  }
}

function parseCreditHeaders(headers) {
  const spent = headers.get('wappalyzer-credits-spent')
  const remaining = headers.get('wappalyzer-credits-remaining')

  return {
    remaining:
      remaining == null || remaining === ''
        ? null
        : Number.parseInt(remaining, 10),
    spent:
      spent == null || spent === '' ? null : Number.parseInt(spent, 10),
  }
}

function normalizeErrorMessage(status, body, statusText) {
  if (body && typeof body === 'object') {
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message
    }

    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error
    }
  }

  if (typeof body === 'string' && body.trim()) {
    return body
  }

  return statusText || `Upstream request failed with status ${status}`
}

function buildLookupSearchParams({
  url,
  live = false,
  sets = [],
  denoise = true,
  maxAge = 2,
}) {
  const params = new URLSearchParams()

  params.set('urls', url)
  params.set('live', String(live))
  params.set('recursive', 'false')
  params.set('denoise', String(denoise))
  params.set('max_age', String(maxAge))

  if (sets.length) {
    params.set('sets', sets.join(','))
  }

  return params
}

function buildSubdomainsSearchParams({ domain, limit = 100, after = null }) {
  const params = new URLSearchParams()

  params.set('domains', domain)
  params.set('limit', String(limit))

  if (after) {
    params.set('after', after)
  }

  return params
}

class WappalyzerClient {
  constructor(config, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('A fetch implementation is required')
    }

    this.apiBaseUrl = config.apiBaseUrl
    this.apiKey = config.apiKey || null
    this.fetch = fetchImpl
    this.httpTimeoutMs = config.httpTimeoutMs
    this.metadataBaseUrl = config.metadataBaseUrl
    this.now = now
    this.metadataCache = new Map()
  }

  async requestJson(path, {
    apiKey = null,
    baseUrl = this.apiBaseUrl,
    cacheTtlMs = 0,
    searchParams = null,
  } = {}) {
    const url = new URL(path, baseUrl)

    if (searchParams) {
      url.search = searchParams.toString()
    }

    const cacheKey =
      cacheTtlMs > 0 && !apiKey && !searchParams ? url.toString() : null
    const now = this.now()

    if (cacheKey) {
      const cached = this.metadataCache.get(cacheKey)

      if (cached && cached.expiresAt > now) {
        return cached.value
      }

      if (cached) {
        this.metadataCache.delete(cacheKey)
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.httpTimeoutMs)

    try {
      const response = await this.fetch(url, {
        headers: {
          accept: 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : null),
        },
        signal: controller.signal,
      })
      const bodyText = await response.text()
      const body = parseJsonBody(bodyText)
      const credits = parseCreditHeaders(response.headers)

      if (!response.ok) {
        throw new UpstreamHttpError(
          normalizeErrorMessage(response.status, body, response.statusText),
          {
            body,
            retryAfter: response.headers.get('retry-after'),
            status: response.status,
          }
        )
      }

      const value = {
        credits,
        data: body,
      }

      if (cacheKey) {
        this.metadataCache.set(cacheKey, {
          expiresAt: now + cacheTtlMs,
          value,
        })
      }

      return value
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.httpTimeoutMs}ms`)
      }

      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async lookupSite(input) {
    const request = {
      denoise: input.denoise,
      live: input.live,
      max_age: input.maxAge,
      recursive: false,
      sets: input.sets,
      url: input.url,
    }
    const { data, credits } = await this.requestJson('lookup/', {
      apiKey: this.apiKey,
      searchParams: buildLookupSearchParams(input),
    })

    if (!Array.isArray(data) || !data.length) {
      throw new Error('Unexpected lookup response from upstream API')
    }

    return {
      credits,
      data: data[0],
      request,
    }
  }

  async lookupSubdomains(input) {
    const request = {
      ...(input.after ? { after: input.after } : null),
      domain: input.domain,
      limit: input.limit,
    }
    const { data, credits } = await this.requestJson('subdomains/', {
      apiKey: this.apiKey,
      searchParams: buildSubdomainsSearchParams(input),
    })

    if (!Array.isArray(data) || !data.length) {
      throw new Error('Unexpected subdomains response from upstream API')
    }

    return {
      credits,
      data: data[0],
      request,
    }
  }

  async getCreditBalance() {
    const { data } = await this.requestJson('credits/balance/', {
      apiKey: this.apiKey,
    })

    return {
      credits: data && typeof data === 'object' ? data.credits : null,
    }
  }

  async getTechnologies() {
    return this.requestJson('technologies/', {
      baseUrl: this.metadataBaseUrl,
      cacheTtlMs: METADATA_CACHE_TTL_MS,
    })
  }

  async getTechnology(slug) {
    return this.requestJson(`technologies/${encodeURIComponent(slug)}/`, {
      baseUrl: this.metadataBaseUrl,
      cacheTtlMs: METADATA_CACHE_TTL_MS,
    })
  }

  async getCategories() {
    return this.requestJson('categories/', {
      baseUrl: this.metadataBaseUrl,
      cacheTtlMs: METADATA_CACHE_TTL_MS,
    })
  }

  async getCategory(slug) {
    return this.requestJson(`categories/${encodeURIComponent(slug)}/`, {
      baseUrl: this.metadataBaseUrl,
      cacheTtlMs: METADATA_CACHE_TTL_MS,
    })
  }
}

module.exports = {
  WappalyzerClient,
  buildLookupSearchParams,
  buildSubdomainsSearchParams,
  parseCreditHeaders,
}
