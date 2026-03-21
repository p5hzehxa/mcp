'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  WappalyzerClient,
  buildLookupSearchParams,
  buildSubdomainsSearchParams,
  parseCreditHeaders,
} = require('../lib/http-client')
const { UpstreamHttpError } = require('../lib/errors')
const { createJsonResponse, startJsonServer } = require('./helpers')

test('buildLookupSearchParams forces recursive=false and serializes inputs', () => {
  const params = buildLookupSearchParams({
    denoise: false,
    live: true,
    maxAge: 7,
    sets: ['company', 'contact'],
    url: 'https://example.com',
  })

  assert.equal(
    params.toString(),
    'urls=https%3A%2F%2Fexample.com&live=true&recursive=false&denoise=false&max_age=7&sets=company%2Ccontact'
  )
})

test('buildSubdomainsSearchParams serializes domain pagination inputs', () => {
  const params = buildSubdomainsSearchParams({
    after: 'shop.example.com',
    domain: 'example.com',
    limit: 200,
  })

  assert.equal(
    params.toString(),
    'domains=example.com&limit=200&after=shop.example.com'
  )
})

test('parseCreditHeaders extracts numeric spent and remaining values', () => {
  const headers = new Headers({
    'wappalyzer-credits-remaining': '99',
    'wappalyzer-credits-spent': '1',
  })

  assert.deepEqual(parseCreditHeaders(headers), {
    remaining: 99,
    spent: 1,
  })
})

test('lookupSite normalizes the first upstream response object and credits', async () => {
  const server = await startJsonServer({
    'GET /lookup/': ({ call }) =>
      createJsonResponse(
        [
          {
            technologies: [{ slug: 'shopify' }],
            url: 'https://example.com',
          },
        ],
        {
          headers: {
            'wappalyzer-credits-remaining': '42',
            'wappalyzer-credits-spent': '1',
          },
        }
      ),
  })

  const client = new WappalyzerClient({
    apiBaseUrl: server.baseUrl,
    apiKey: 'secret',
    httpTimeoutMs: 1000,
    metadataBaseUrl: server.baseUrl,
  })

  try {
    const result = await client.lookupSite({
      denoise: true,
      live: true,
      maxAge: 2,
      sets: ['company'],
      url: 'https://example.com',
    })

    assert.deepEqual(result, {
      credits: {
        remaining: 42,
        spent: 1,
      },
      data: {
        technologies: [{ slug: 'shopify' }],
        url: 'https://example.com',
      },
      request: {
        denoise: true,
        live: true,
        max_age: 2,
        recursive: false,
        sets: ['company'],
        url: 'https://example.com',
      },
    })

    assert.equal(server.calls[0].headers['x-api-key'], 'secret')
    assert.equal(server.calls[0].searchParams.recursive, 'false')
  } finally {
    await server.close()
  }
})

test('lookupSubdomains forwards pagination and returns the single domain object', async () => {
  const server = await startJsonServer({
    'GET /subdomains/': () =>
      createJsonResponse(
        [
          {
            domain: 'example.com',
            moreAfter: 'shop.example.com',
            subdomains: {
              'shop.example.com': {
                createdAt: 1,
                updatedAt: 2,
              },
            },
          },
        ],
        {
          headers: {
            'wappalyzer-credits-remaining': '30',
            'wappalyzer-credits-spent': '2',
          },
        }
      ),
  })

  const client = new WappalyzerClient({
    apiBaseUrl: server.baseUrl,
    apiKey: 'secret',
    httpTimeoutMs: 1000,
    metadataBaseUrl: server.baseUrl,
  })

  try {
    const result = await client.lookupSubdomains({
      after: 'shop.example.com',
      domain: 'example.com',
      limit: 100,
    })

    assert.equal(server.calls[0].searchParams.after, 'shop.example.com')
    assert.deepEqual(result.credits, { remaining: 30, spent: 2 })
    assert.equal(result.data.domain, 'example.com')
    assert.equal(result.request.after, 'shop.example.com')
  } finally {
    await server.close()
  }
})

test('getCreditBalance returns the upstream balance payload', async () => {
  const server = await startJsonServer({
    'GET /credits/balance/': () =>
      createJsonResponse({
        credits: 1234,
      }),
  })

  const client = new WappalyzerClient({
    apiBaseUrl: server.baseUrl,
    apiKey: 'secret',
    httpTimeoutMs: 1000,
    metadataBaseUrl: server.baseUrl,
  })

  try {
    assert.deepEqual(await client.getCreditBalance(), { credits: 1234 })
  } finally {
    await server.close()
  }
})

test('metadata requests are cached for five minutes and never send the API key', async () => {
  let hitCount = 0

  const server = await startJsonServer({
    'GET /technologies/': () => {
      hitCount += 1

      return createJsonResponse([{ slug: 'shopify' }])
    },
  })

  const client = new WappalyzerClient(
    {
      apiBaseUrl: server.baseUrl,
      apiKey: 'secret',
      httpTimeoutMs: 1000,
      metadataBaseUrl: server.baseUrl,
    },
    {
      now: () => 1000,
    }
  )

  try {
    const first = await client.getTechnologies()
    const second = await client.getTechnologies()

    assert.deepEqual(first.data, [{ slug: 'shopify' }])
    assert.deepEqual(second.data, [{ slug: 'shopify' }])
    assert.equal(hitCount, 1)
    assert.equal(server.calls[0].headers['x-api-key'], undefined)
  } finally {
    await server.close()
  }
})

test('upstream HTTP errors include status, body, and retry-after details', async () => {
  const server = await startJsonServer({
    'GET /lookup/': () =>
      createJsonResponse(
        { message: 'Too many requests' },
        {
          headers: {
            'retry-after': '120',
          },
          status: 429,
        }
      ),
  })

  const client = new WappalyzerClient({
    apiBaseUrl: server.baseUrl,
    apiKey: 'secret',
    httpTimeoutMs: 1000,
    metadataBaseUrl: server.baseUrl,
  })

  try {
    await assert.rejects(
      () =>
        client.lookupSite({
          denoise: true,
          live: false,
          maxAge: 2,
          sets: [],
          url: 'https://example.com',
        }),
      (error) => {
        assert.ok(error instanceof UpstreamHttpError)
        assert.equal(error.status, 429)
        assert.equal(error.retryAfter, '120')
        assert.deepEqual(error.body, { message: 'Too many requests' })
        return true
      }
    )
  } finally {
    await server.close()
  }
})

for (const status of [400, 403, 404, 500]) {
  test(`upstream HTTP ${status} responses are mapped into UpstreamHttpError`, async () => {
    const server = await startJsonServer({
      'GET /credits/balance/': () =>
        createJsonResponse(
          { message: `Error ${status}` },
          {
            status,
          }
        ),
    })

    const client = new WappalyzerClient({
      apiBaseUrl: server.baseUrl,
      apiKey: 'secret',
      httpTimeoutMs: 1000,
      metadataBaseUrl: server.baseUrl,
    })

    try {
      await assert.rejects(
        () => client.getCreditBalance(),
        (error) => {
          assert.ok(error instanceof UpstreamHttpError)
          assert.equal(error.status, status)
          assert.deepEqual(error.body, { message: `Error ${status}` })
          return true
        }
      )
    } finally {
      await server.close()
    }
  })
}
