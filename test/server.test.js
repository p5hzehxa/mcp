'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const path = require('node:path')

const { McpError } = require('@modelcontextprotocol/sdk/types.js')

const { UpstreamHttpError } = require('../lib/errors')
const { createHandlers, createServer } = require('../lib/server')

test('createServer wires the expected tools and resources without throwing', () => {
  const fakeClient = {
    getCategories: async () => ({ data: [] }),
    getCategory: async () => ({ data: {} }),
    getCreditBalance: async () => ({ credits: 1 }),
    getTechnologies: async () => ({ data: [] }),
    getTechnology: async () => ({ data: {} }),
    lookupSite: async () => ({
      credits: { remaining: 1, spent: 1 },
      data: {},
      request: {
        denoise: true,
        live: false,
        max_age: 2,
        recursive: false,
        sets: [],
        url: 'https://example.com/',
      },
    }),
    lookupSubdomains: async () => ({
      credits: { remaining: 1, spent: 1 },
      data: {},
      request: {
        domain: 'example.com',
        limit: 100,
      },
    }),
  }

  const { server } = createServer(
    {
      apiBaseUrl: 'https://api.wappalyzer.com/v2/',
      apiKey: 'secret',
      httpTimeoutMs: 30000,
      metadataBaseUrl: 'https://api.wappalyzer.com/v2/',
    },
    { client: fakeClient }
  )

  assert.ok(server)
})

test('tool handlers return structured validation errors for unsupported sets', async () => {
  const handlers = createHandlers({
    lookupSite: async () => {
      throw new Error('should not reach upstream')
    },
  })

  const result = await handlers.lookupSite({
    sets: ['bad-set'],
    url: 'https://example.com',
  })

  assert.equal(result.isError, true)
  assert.equal(result.structuredContent.error.type, 'InputValidationError')
  assert.match(result.structuredContent.error.message, /unsupported value/)
})

test('lookup_site rejects multiple URLs in a single request', async () => {
  const handlers = createHandlers({
    lookupSite: async () => {
      throw new Error('should not reach upstream')
    },
  })

  const result = await handlers.lookupSite({
    url: 'https://example.com,https://example.org',
  })

  assert.equal(result.isError, true)
  assert.equal(result.structuredContent.error.type, 'InputValidationError')
  assert.match(result.structuredContent.error.message, /exactly one value/)
})

test('lookup_subdomains enforces the documented limit bounds and multiples', async () => {
  const handlers = createHandlers({
    lookupSubdomains: async () => {
      throw new Error('should not reach upstream')
    },
  })

  const result = await handlers.lookupSubdomains({
    domain: 'example.com',
    limit: 55,
  })

  assert.equal(result.isError, true)
  assert.equal(result.structuredContent.error.type, 'InputValidationError')
  assert.match(result.structuredContent.error.message, /multiple of 10/)
})

test('metadata resources are returned as JSON content blocks', async () => {
  const handlers = createHandlers({
    getCategories: async () => ({ data: [{ slug: 'ecommerce' }] }),
  })

  const result = await handlers.readCategories()

  assert.deepEqual(result.contents, [
    {
      mimeType: 'application/json',
      text: JSON.stringify([{ slug: 'ecommerce' }], null, 2),
      uri: 'wappalyzer://categories',
    },
  ])
})

test('metadata resource errors are raised as MCP errors with upstream details', async () => {
  const handlers = createHandlers({
    getTechnology: async () => {
      throw new UpstreamHttpError('Forbidden', {
        body: { message: 'Forbidden' },
        retryAfter: null,
        status: 403,
      })
    },
  })

  await assert.rejects(
    () => handlers.readTechnology({ slug: 'shopify' }),
    (error) => {
      assert.ok(error instanceof McpError)
      assert.equal(error.data.status, 403)
      assert.deepEqual(error.data.body, { message: 'Forbidden' })
      return true
    }
  )
})

test('startup fails fast when WAPPALYZER_API_KEY is missing', async () => {
  const executable = path.join(__dirname, '..', 'index.js')

  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable], {
      env: {
        PATH: process.env.PATH,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', reject)
    child.on('close', (code) => {
      resolve({ code, stderr })
    })
  })

  assert.equal(result.code, 1)
  assert.match(result.stderr, /WAPPALYZER_API_KEY is required/)
})
