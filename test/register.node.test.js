/**
 * @jest-environment node
 */
import axios from 'axios'
import http from 'http'
import { registerTarget } from '../src/register.js'

// Real sockets and the real DruxtClient, to prove what the mocked tests
// assume about axios: no redirect is followed, and the timeout holds.
const serve = (handler) =>
  new Promise((resolve) => {
    const seen = []
    const requests = []
    const server = http.createServer((req, res) => {
      seen.push(req.url)
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => requests.push({ headers: req.headers, body }))
      handler(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        seen,
        requests,
        base: `http://127.0.0.1:${server.address().port}`,
      })
    })
  })

const close = (server) =>
  new Promise((resolve) => {
    if (server.closeAllConnections) server.closeAllConnections()
    server.close(resolve)
  })

const settings = (baseUrl, overrides = {}) => ({
  baseUrl,
  druxt: { baseUrl, axios: { timeout: 1000 } },
  url: 'https://www.example.com',
  label: 'www.example.com',
  consumer: 'frontend',
  secret: 'the-client-secret-value',
  path: '/druxt/node/preview',
  layouts: [],
  ...overrides,
})

let warn
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

test('the token request does not follow a redirect to another host', async () => {
  const other = await serve((req, res) => res.end('{}'))
  const drupal = await serve((req, res) => {
    res.writeHead(307, { Location: `${other.base}/oauth/token` })
    res.end()
  })
  try {
    await expect(registerTarget(settings(drupal.base))).resolves.toBe('failed')
    expect(drupal.seen).toEqual(['/oauth/token'])
    expect(other.seen).toEqual([])
    expect(warn.mock.calls[0][0]).toContain('(HTTP 307)')
    expect(warn.mock.calls[0][0]).not.toContain('the-client-secret-value')
  } finally {
    await close(drupal.server)
    await close(other.server)
  }
})

test('a request that Drupal does not answer stops at the timeout', async () => {
  const drupal = await serve(() => {})
  try {
    const started = Date.now()
    await expect(
      registerTarget(
        settings(drupal.base, {
          druxt: { baseUrl: drupal.base, axios: { timeout: 200 } },
        })
      )
    ).resolves.toBe('failed')
    expect(Date.now() - started).toBeLessThan(3000)
    expect(warn.mock.calls[0][0]).toContain('timeout of 200ms')
  } finally {
    await close(drupal.server)
  }
})

test('a backend gets nothing from the global axios defaults', async () => {
  const backend = await serve((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(
      req.url === '/oauth/token'
        ? '{"access_token":"the-access-token-value"}'
        : '{"targets":[],"layouts":[]}'
    )
  })
  const global = axios.defaults
  const before = {
    common: { ...global.headers.common },
    transformRequest: global.transformRequest,
  }
  global.headers.common['X-Api-Key'] = ['site-key']
  global.headers.common.Authorization = 'Basic c2l0ZQ=='
  global.transformRequest = [
    (data, headers) => {
      headers['X-Leak'] = 'site'
      return data
    },
    ...before.transformRequest,
  ]
  try {
    await expect(
      registerTarget(
        settings('https://cms.example.com', {
          backend: backend.base,
          token: true,
        })
      )
    ).resolves.toBe('registered')
  } finally {
    global.headers.common = before.common
    global.transformRequest = before.transformRequest
    await close(backend.server)
  }
  expect(backend.seen).toEqual([
    '/oauth/token',
    '/api/consumer-node-preview/targets',
  ])
  for (const { headers } of backend.requests) {
    expect(headers['x-api-key']).toBeUndefined()
    expect(headers['x-leak']).toBeUndefined()
  }
  const [tokenRequest, patch] = backend.requests
  expect(tokenRequest.headers.authorization).toBeUndefined()
  expect(tokenRequest.body).toContain('grant_type=client_credentials')
  expect(patch.headers.authorization).toBe('Bearer the-access-token-value')
  expect(JSON.parse(patch.body).target.label).toBe('www.example.com')
})
