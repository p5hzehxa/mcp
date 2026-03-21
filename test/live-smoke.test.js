'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const { loadConfig } = require('../lib/config')
const { WappalyzerClient } = require('../lib/http-client')

const SECRET_PATH = '/Users/elbert/.codex/secrets/wappalyzer-api.toml'

function readSecretFile() {
  if (!fs.existsSync(SECRET_PATH)) {
    return null
  }

  const text = fs.readFileSync(SECRET_PATH, 'utf8')
  const apiKeyMatch = text.match(/api_key\s*=\s*"([^"]+)"/)
  const baseUrlMatch = text.match(/base_url\s*=\s*"([^"]+)"/)

  if (!apiKeyMatch) {
    throw new Error(`No api_key entry found in ${SECRET_PATH}`)
  }

  return {
    WAPPALYZER_API_BASE_URL: baseUrlMatch
      ? baseUrlMatch[1]
      : 'https://api.wappalyzer.com/v2/',
    WAPPALYZER_API_KEY: apiKeyMatch[1],
  }
}

test('live smoke: credit balance, cached lookup, subdomains, and public metadata', async (t) => {
  const secretEnv = readSecretFile()

  if (!secretEnv) {
    t.skip(`Missing ${SECRET_PATH}`)
    return
  }

  const config = loadConfig({ env: secretEnv })
  const client = new WappalyzerClient(config)

  const balance = await client.getCreditBalance()

  assert.equal(typeof balance.credits, 'number')

  const lookup = await client.lookupSite({
    denoise: true,
    live: false,
    maxAge: 2,
    sets: [],
    url: 'https://www.wappalyzer.com',
  })

  assert.equal(lookup.request.recursive, false)
  assert.equal(lookup.request.live, false)
  assert.ok(lookup.data)

  const subdomains = await client.lookupSubdomains({
    domain: 'wappalyzer.com',
    limit: 100,
  })

  assert.equal(subdomains.request.domain, 'wappalyzer.com')
  assert.ok(subdomains.data)

  const technology = await client.getTechnology('shopify')
  const category = await client.getCategory('ecommerce')
  const publicMetadataClient = new WappalyzerClient({
    apiBaseUrl: config.apiBaseUrl,
    apiKey: null,
    httpTimeoutMs: config.httpTimeoutMs,
    metadataBaseUrl: config.metadataBaseUrl,
  })
  const publicTechnology = await publicMetadataClient.getTechnology('shopify')
  const publicCategory = await publicMetadataClient.getCategory('ecommerce')

  assert.equal(technology.data.slug, 'shopify')
  assert.equal(category.data.slug, 'ecommerce')
  assert.equal(publicTechnology.data.slug, 'shopify')
  assert.equal(publicCategory.data.slug, 'ecommerce')
})

test('live smoke: invalid API key returns a 403 from credits balance', async () => {
  const client = new WappalyzerClient({
    apiBaseUrl: 'https://api.wappalyzer.com/v2/',
    apiKey: 'invalid-key',
    httpTimeoutMs: 30000,
    metadataBaseUrl: 'https://api.wappalyzer.com/v2/',
  })

  await assert.rejects(
    () => client.getCreditBalance(),
    (error) => {
      assert.equal(error.status, 403)
      return true
    }
  )
})
