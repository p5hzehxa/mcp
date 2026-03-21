'use strict'

class InputValidationError extends Error {
  constructor(message, details = null) {
    super(message)

    this.name = 'InputValidationError'
    this.details = details
  }
}

class UpstreamHttpError extends Error {
  constructor(message, { status, body = null, retryAfter = null } = {}) {
    super(message)

    this.name = 'UpstreamHttpError'
    this.status = status
    this.body = body
    this.retryAfter = retryAfter
  }
}

module.exports = {
  InputValidationError,
  UpstreamHttpError,
}
