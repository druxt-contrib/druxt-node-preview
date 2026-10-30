/**
 * @jest-environment node
 */
import http from 'http'
import { registerTarget } from '../src/register.js'

// Real sockets and the real DruxtClient, to prove what the mocked tests
// assume about axios: no redirect is followed, and the timeout holds.
const serve = (handler) =>
  new Promise((resolve) => {
    const seen = []
    const server = http.createServer((req, res) => {
      seen.push(req.url)
      handler(req, res)
    })
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        seen,
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
  druxt: { baseUrl },
  url: 'https://www.example.com',
  label: 'www.example.com',
  consumer: 'frontend',
  secret: 'the-client-secret-value',
  path: '/druxt/node/preview',
  layouts: [],
  timeout: 1000,
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
      registerTarget(settings(drupal.base, { timeout: 200 }))
    ).resolves.toBe('failed')
    expect(Date.now() - started).toBeLessThan(3000)
    expect(warn.mock.calls[0][0]).toContain('within 0.2 seconds')
  } finally {
    await close(drupal.server)
  }
})
