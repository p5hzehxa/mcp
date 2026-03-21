'use strict'

const http = require('node:http')

function createJsonResponse(body, {
  headers = {},
  status = 200,
} = {}) {
  return {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    status,
  }
}

async function startJsonServer(routes) {
  const calls = []

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')

    calls.push({
      headers: request.headers,
      method: request.method,
      pathname: url.pathname,
      searchParams: Object.fromEntries(url.searchParams.entries()),
    })

    const key = `${request.method} ${url.pathname}`
    const handler = routes[key]

    if (!handler) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ message: 'Not found' }))
      return
    }

    try {
      const result = await handler({
        call: calls[calls.length - 1],
        request,
        url,
      })

      response.writeHead(result.status || 200, result.headers || {})
      response.end(result.body || '')
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ message: error.message }))
    }
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()

  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    calls,
    close: async () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      }),
  }
}

module.exports = {
  createJsonResponse,
  startJsonServer,
}
