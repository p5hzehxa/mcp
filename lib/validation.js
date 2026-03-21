'use strict'

const {
  LOOKUP_SET_ALLOWLIST,
  LOOKUP_SET_VALUES,
} = require('./constants')
const { InputValidationError } = require('./errors')

function ensureSingleValue(label, value) {
  const normalized = String(value || '').trim()

  if (!normalized) {
    throw new InputValidationError(`${label} is required`)
  }

  if (normalized.includes(',')) {
    throw new InputValidationError(`${label} must contain exactly one value`)
  }

  return normalized
}

function validateUrl(value) {
  const normalized = ensureSingleValue('url', value)
  let parsed

  try {
    parsed = new URL(normalized)
  } catch (error) {
    throw new InputValidationError('url must be a valid absolute URL')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new InputValidationError('url must use http or https')
  }

  return parsed.toString()
}

function validateSets(sets = []) {
  if (!Array.isArray(sets)) {
    throw new InputValidationError('sets must be an array')
  }

  const normalized = []

  for (const entry of sets) {
    const value = String(entry || '').trim()

    if (!value) {
      throw new InputValidationError('sets must not contain empty values')
    }

    if (!LOOKUP_SET_ALLOWLIST.has(value)) {
      throw new InputValidationError(
        `sets contains an unsupported value: ${value}`,
        { allowedValues: LOOKUP_SET_VALUES }
      )
    }

    if (!normalized.includes(value)) {
      normalized.push(value)
    }
  }

  return normalized
}

function validateInteger(name, value, { minimum = null, maximum = null } = {}) {
  if (!Number.isInteger(value)) {
    throw new InputValidationError(`${name} must be an integer`)
  }

  if (minimum != null && value < minimum) {
    throw new InputValidationError(`${name} must be >= ${minimum}`)
  }

  if (maximum != null && value > maximum) {
    throw new InputValidationError(`${name} must be <= ${maximum}`)
  }

  return value
}

function validateLookupInput(input = {}) {
  return {
    denoise: input.denoise !== false,
    live: input.live === true,
    maxAge: validateInteger('max_age', input.max_age ?? input.maxAge ?? 2, {
      minimum: 0,
    }),
    sets: validateSets(input.sets || []),
    url: validateUrl(input.url),
  }
}

function validateDomain(value) {
  const normalized = ensureSingleValue('domain', value).toLowerCase()

  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      normalized
    )
  ) {
    throw new InputValidationError('domain must be a valid domain name')
  }

  return normalized
}

function validateSubdomainsInput(input = {}) {
  const limit = validateInteger('limit', input.limit ?? 100, {
    minimum: 10,
    maximum: 1000,
  })

  if (limit % 10 !== 0) {
    throw new InputValidationError('limit must be a multiple of 10')
  }

  return {
    after:
      input.after == null || String(input.after).trim() === ''
        ? null
        : ensureSingleValue('after', input.after),
    domain: validateDomain(input.domain),
    limit,
  }
}

module.exports = {
  validateLookupInput,
  validateSets,
  validateSubdomainsInput,
}
