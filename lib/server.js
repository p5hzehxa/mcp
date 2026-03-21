'use strict'

const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js')
const { McpServer, ResourceTemplate } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')

const { WappalyzerClient } = require('./http-client')
const { InputValidationError, UpstreamHttpError } = require('./errors')
const {
  validateLookupInput,
  validateSubdomainsInput,
} = require('./validation')

function formatStructuredContent(value) {
  return {
    content: [
      {
        text: JSON.stringify(value, null, 2),
        type: 'text',
      },
    ],
    structuredContent: value,
  }
}

function formatToolError(error) {
  if (error instanceof InputValidationError) {
    return {
      isError: true,
      ...formatStructuredContent({
        error: {
          details: error.details,
          message: error.message,
          type: error.name,
        },
      }),
    }
  }

  if (error instanceof UpstreamHttpError) {
    return {
      isError: true,
      ...formatStructuredContent({
        error: {
          body: error.body,
          message: error.message,
          retry_after: error.retryAfter,
          status: error.status,
          type: error.name,
        },
      }),
    }
  }

  return {
    isError: true,
    ...formatStructuredContent({
      error: {
        message: error && error.message ? error.message : String(error),
        type: 'Error',
      },
    }),
  }
}

function formatResource(uri, data) {
  return {
    contents: [
      {
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
        uri,
      },
    ],
  }
}

function toMcpError(error) {
  if (error instanceof UpstreamHttpError) {
    return new McpError(ErrorCode.InternalError, error.message, {
      body: error.body,
      retry_after: error.retryAfter,
      status: error.status,
      type: error.name,
    })
  }

  if (error instanceof InputValidationError) {
    return new McpError(ErrorCode.InvalidParams, error.message, {
      details: error.details,
      type: error.name,
    })
  }

  return new McpError(
    ErrorCode.InternalError,
    error && error.message ? error.message : String(error)
  )
}

function createHandlers(client) {
  return {
    async getCreditBalance() {
      try {
        return formatStructuredContent(await client.getCreditBalance())
      } catch (error) {
        return formatToolError(error)
      }
    },

    async lookupSite(args) {
      try {
        const input = validateLookupInput(args)

        return formatStructuredContent(await client.lookupSite(input))
      } catch (error) {
        return formatToolError(error)
      }
    },

    async lookupSubdomains(args) {
      try {
        const input = validateSubdomainsInput(args)

        return formatStructuredContent(await client.lookupSubdomains(input))
      } catch (error) {
        return formatToolError(error)
      }
    },

    async readCategories() {
      try {
        const { data } = await client.getCategories()

        return formatResource('wappalyzer://categories', data)
      } catch (error) {
        throw toMcpError(error)
      }
    },

    async readCategory({ slug }) {
      try {
        const { data } = await client.getCategory(slug)

        return formatResource(`wappalyzer://categories/${slug}`, data)
      } catch (error) {
        throw toMcpError(error)
      }
    },

    async readTechnologies() {
      try {
        const { data } = await client.getTechnologies()

        return formatResource('wappalyzer://technologies', data)
      } catch (error) {
        throw toMcpError(error)
      }
    },

    async readTechnology({ slug }) {
      try {
        const { data } = await client.getTechnology(slug)

        return formatResource(`wappalyzer://technologies/${slug}`, data)
      } catch (error) {
        throw toMcpError(error)
      }
    },
  }
}

function createServer(config, options = {}) {
  const client = options.client || new WappalyzerClient(config, options)
  const handlers = createHandlers(client)
  const server = new McpServer({
    name: 'wappalyzer-mcp',
    version: '0.1.0',
  })

  server.registerTool(
    'lookup_site',
    {
      description: 'Look up technologies and enrichment data for a single URL.',
      inputSchema: {
        denoise: z.boolean().default(true),
        live: z.boolean().default(false),
        max_age: z.number().int().default(2),
        sets: z.array(z.string()).default([]),
        url: z.string(),
      },
      outputSchema: {
        credits: z.object({
          remaining: z.number().nullable(),
          spent: z.number().nullable(),
        }),
        data: z.record(z.any()),
        request: z.object({
          denoise: z.boolean(),
          live: z.boolean(),
          max_age: z.number().int(),
          recursive: z.literal(false),
          sets: z.array(z.string()),
          url: z.string(),
        }),
      },
    },
    handlers.lookupSite
  )

  server.registerTool(
    'lookup_subdomains',
    {
      description: 'Discover website-serving subdomains for a single domain.',
      inputSchema: {
        after: z.string().optional(),
        domain: z.string(),
        limit: z.number().int().default(100),
      },
      outputSchema: {
        credits: z.object({
          remaining: z.number().nullable(),
          spent: z.number().nullable(),
        }),
        data: z.record(z.any()),
        request: z.object({
          after: z.string().optional(),
          domain: z.string(),
          limit: z.number().int(),
        }),
      },
    },
    handlers.lookupSubdomains
  )

  server.registerTool(
    'get_credit_balance',
    {
      description: 'Get the remaining Wappalyzer API credit balance.',
      inputSchema: {},
      outputSchema: {
        credits: z.number().nullable(),
      },
    },
    handlers.getCreditBalance
  )

  server.registerResource(
    'technologies',
    'wappalyzer://technologies',
    {
      description: 'Technology metadata from the public Wappalyzer API.',
      mimeType: 'application/json',
    },
    handlers.readTechnologies
  )

  server.registerResource(
    'technology',
    new ResourceTemplate('wappalyzer://technologies/{slug}', {
      list: undefined,
    }),
    {
      description: 'Technology metadata for a specific slug.',
      mimeType: 'application/json',
    },
    handlers.readTechnology
  )

  server.registerResource(
    'categories',
    'wappalyzer://categories',
    {
      description: 'Category metadata from the public Wappalyzer API.',
      mimeType: 'application/json',
    },
    handlers.readCategories
  )

  server.registerResource(
    'category',
    new ResourceTemplate('wappalyzer://categories/{slug}', {
      list: undefined,
    }),
    {
      description: 'Category metadata for a specific slug.',
      mimeType: 'application/json',
    },
    handlers.readCategory
  )

  return {
    client,
    handlers,
    server,
  }
}

async function startServer(config, options = {}) {
  const { server } = createServer(config, options)
  const transport = new StdioServerTransport()

  await server.connect(transport)

  return server
}

module.exports = {
  createHandlers,
  createServer,
  startServer,
}
