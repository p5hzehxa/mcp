'use strict'

const DEFAULT_API_BASE_URL = 'https://api.wappalyzer.com/v2/'
const DEFAULT_HTTP_TIMEOUT_MS = 30000
const METADATA_CACHE_TTL_MS = 5 * 60 * 1000

const LOOKUP_SET_VALUES = [
  'locale',
  'email',
  'phone',
  'contact',
  'social',
  'meta',
  'security',
  'trackers',
  'company',
  'keywords',
  'signals',
  'createdAt',
  'events',
  'all',
]

const LOOKUP_SET_ALLOWLIST = new Set(LOOKUP_SET_VALUES)

module.exports = {
  DEFAULT_API_BASE_URL,
  DEFAULT_HTTP_TIMEOUT_MS,
  LOOKUP_SET_ALLOWLIST,
  LOOKUP_SET_VALUES,
  METADATA_CACHE_TTL_MS,
}
