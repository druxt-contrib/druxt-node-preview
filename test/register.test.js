import { DruxtClient } from 'druxt'
import {
  HEARTBEAT,
  registerOnce,
  registerTarget,
  resolveRegister,
  targetUrl,
} from '../src/register.js'
import { routeDruxtClient } from './helpers/druxt-client.js'

jest.mock('druxt', () => ({
  ...jest.requireActual('druxt'),
  DruxtClient: jest.fn(),
}))

// Answers each request the module sends through its DruxtClient.
const request = jest.fn()

const SECRET = 'the-client-secret-value'
const TOKEN = 'the-access-token-value'
const BASE = 'https://cms.example.com'
const API = `${BASE}/api/consumer-node-preview/targets`
const OURS =
  'https://www.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview_path]'

const json = (status, data) => ({ status, text: JSON.stringify(data) })
const tokenOk = () => json(200, { access_token: TOKEN })
const saved = () => json(200, { targets: [], layouts: [] })

// Answers each request in turn from a list of responses or errors.
const answer = (...responses) => {
  for (const response of responses) {
    if (response instanceof Error) request.mockRejectedValueOnce(response)
    else request.mockResolvedValueOnce(response)
  }
}

const settings = (overrides = {}) => ({
  baseUrl: BASE,
  url: 'https://www.example.com',
  label: 'www.example.com',
  consumer: 'frontend',
  secret: SECRET,
  path: '/druxt/node/preview',
  layouts: [],
  ...overrides,
})

let warn
let info
let clients
beforeEach(() => {
  request.mockReset()
  DruxtClient.mockReset()
  clients = routeDruxtClient(DruxtClient, request)
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  info = jest.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
  info.mockRestore()
})

describe('resolveRegister', () => {
  const ENV = {
    DRUXT_NODE_PREVIEW_URL: 'https://env.example.com/base/',
    DRUXT_NODE_PREVIEW_CLIENT_ID: 'from-env',
    DRUXT_NODE_PREVIEW_CLIENT_SECRET: SECRET,
  }

  test.each([[undefined], [null], [false]])('%s is off', (value) => {
    expect(resolveRegister(value, ENV)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  test.each([['yes'], [1], [[]]])('%j warns and is off', (value) => {
    expect(resolveRegister(value, ENV)).toBeNull()
    expect(warn.mock.calls[0][0]).toContain('Ignored the register option')
  })

  test('true takes everything from the environment', () => {
    expect(resolveRegister(true, ENV)).toEqual({
      url: 'https://env.example.com/base',
      label: 'env.example.com',
      consumer: 'from-env',
      secret: SECRET,
    })
  })

  test('the environment wins over the options', () => {
    const options = { url: 'https://www.example.com', consumer: 'frontend' }
    expect(resolveRegister(options, ENV)).toMatchObject({
      url: 'https://env.example.com/base',
      consumer: 'from-env',
    })
  })

  test('the options fill what the environment leaves out', () => {
    const env = { DRUXT_NODE_PREVIEW_CLIENT_SECRET: ` ${SECRET} ` }
    const options = {
      url: 'https://www.example.com',
      consumer: 'frontend',
      label: ' Production ',
    }
    expect(resolveRegister(options, env)).toEqual({
      url: 'https://www.example.com',
      label: 'Production',
      consumer: 'frontend',
      secret: SECRET,
    })
  })

  test.each([[''], ['  '], [7]])('a label of %j gives the host', (label) => {
    expect(resolveRegister({ label }, ENV).label).toBe('env.example.com')
  })

  test('one warning names everything that is missing', () => {
    expect(resolveRegister(true, {})).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    const [message] = warn.mock.calls[0]
    expect(message).toContain('DRUXT_NODE_PREVIEW_URL')
    expect(message).toContain('DRUXT_NODE_PREVIEW_CLIENT_ID')
    expect(message).toContain('DRUXT_NODE_PREVIEW_CLIENT_SECRET')
  })

  test.each([
    ['not a url'],
    ['ftp://www.example.com'],
    ['https://www.example.com/?a=1'],
    ['https://www.example.com/#a'],
    [7],
  ])('the URL %j is refused', (url) => {
    const env = { ...ENV, DRUXT_NODE_PREVIEW_URL: undefined }
    expect(resolveRegister({ url }, env)).toBeNull()
    expect(warn.mock.calls[0][0]).toContain('DRUXT_NODE_PREVIEW_URL')
  })

  test.each([['two words'], [7]])('the consumer %j is refused', (consumer) => {
    const env = { ...ENV, DRUXT_NODE_PREVIEW_CLIENT_ID: undefined }
    expect(resolveRegister({ consumer }, env)).toBeNull()
    expect(warn.mock.calls[0][0]).toContain('DRUXT_NODE_PREVIEW_CLIENT_ID')
  })

  test('a secret in the options is ignored and never printed', () => {
    const secret = 'secret-in-the-config'
    const env = { ...ENV, DRUXT_NODE_PREVIEW_CLIENT_SECRET: undefined }
    expect(resolveRegister({ secret }, env)).toBeNull()
    const output = warn.mock.calls.flat().join(' ')
    expect(output).toContain('Never put the secret in nuxt.config.js')
    expect(output).not.toContain(secret)
  })
})

describe('targetUrl', () => {
  test('sends the endpoint as a path, and the view mode in the query', () => {
    expect(targetUrl('https://www.example.com', '/p', [])).toBe(
      'https://www.example.com/p?vm=[view_mode]#[jsonapi_node_preview_path]'
    )
  })

  test('adds the layout when the site lists layouts', () => {
    expect(targetUrl('https://www.example.com', '/p', ['default'])).toBe(
      'https://www.example.com/p?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]'
    )
  })
})

describe('registerTarget', () => {
  test('gets a client credentials token', async () => {
    answer(tokenOk(), saved())
    await registerTarget(settings())

    const [method, url, options] = request.mock.calls[0]
    expect(method).toBe('POST')
    expect(url).toBe(`${BASE}/oauth/token`)
    expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'frontend',
      client_secret: SECRET,
    })
  })

  test('sends one PATCH with its target and the consumer header', async () => {
    answer(tokenOk(), saved())
    const result = await registerTarget(settings({ baseUrl: BASE + '/' }))

    expect(result).toBe('registered')
    expect(request).toHaveBeenCalledTimes(2)
    const [method, url, options] = request.mock.calls[1]
    expect(method).toBe('PATCH')
    expect(url).toBe(API)
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'X-Consumer-ID': 'frontend',
    })
    expect(JSON.parse(options.body)).toEqual({
      target: { label: 'www.example.com', url: OURS },
    })
  })

  test('sends the layouts once each, when the site lists them', async () => {
    answer(tokenOk(), saved())
    await registerTarget(settings({ layouts: ['a', 'b', 'a'] }))
    expect(JSON.parse(request.mock.calls[1][2].body).layouts).toEqual([
      'a',
      'b',
    ])
  })

  test('applies the site axios options, with a default timeout', async () => {
    answer(tokenOk(), saved(), tokenOk(), saved())
    const druxt = { baseUrl: BASE, axios: { headers: { 'X-Site': 'yes' } } }
    await registerTarget(settings({ druxt }))
    expect(clients[0].axios.defaults.timeout).toBe(5000)
    expect(clients[0].axios.defaults.headers['X-Site']).toBe('yes')

    await registerTarget(settings({ druxt: { axios: { timeout: 60000 } } }))
    expect(clients[1].axios.defaults.timeout).toBe(60000)
  })

  test('no request follows a redirect, and every status comes back', async () => {
    answer(tokenOk(), saved())
    await registerTarget(settings())
    for (const [config] of clients[0].axios.request.mock.calls) {
      expect(config.maxRedirects).toBe(0)
      expect(config.validateStatus(500)).toBe(true)
    }
  })

  describe('failures warn and never throw, and never print the secret or the token', () => {
    const fails = async (expected, ...responses) => {
      answer(...responses)
      await expect(registerTarget(settings())).resolves.toBe('failed')
      expect(warn).toHaveBeenCalledTimes(1)
      const [message] = warn.mock.calls[0]
      expect(message).toContain('Could not register the preview target')
      expect(message).toContain(expected)
      expect(message).not.toContain(SECRET)
      expect(message).not.toContain(TOKEN)
    }

    test('no base URL', async () => {
      await expect(
        registerTarget(settings({ baseUrl: undefined }))
      ).resolves.toBe('failed')
      expect(warn.mock.calls[0][0]).toContain('druxt.baseUrl is not set')
    })

    test('a network failure', () =>
      fails('connect ECONNREFUSED', new Error('connect ECONNREFUSED')))

    test('a redirect names its target', () =>
      fails('to https://other.example.com', {
        status: 307,
        text: '',
        headers: { location: 'https://other.example.com' },
      }))

    test('a redirect without a location', () =>
      fails('HTTP 301', { status: 301, text: '' }))

    test.each([
      [404, 'Simple OAuth'],
      [400, 'Client credentials'],
      [401, 'Client credentials'],
      [500, 'HTTP 500'],
    ])('the token request answers %i', (status, expected) =>
      fails(expected, json(status, {}))
    )

    test('a token response without a token', () =>
      fails('no access token', json(200, {})))

    test('an HTML page gives no reason', () =>
      fails('HTTP 500.', { status: 500, text: '<html>' }))

    test.each([
      [404, 'Consumer Node Preview'],
      [401, 'own the consumer'],
      [403, 'register consumer node preview targets'],
      [405, 'PATCH'],
      [422, 'path option'],
      [500, 'HTTP 500'],
    ])('the targets API answers %i', (status, expected) =>
      fails(expected, tokenOk(), json(status, {}))
    )

    test('gives the reason Drupal gave', () =>
      fails(
        'The URL is bad',
        tokenOk(),
        json(422, { message: ' The URL is bad ' })
      ))

    test('gives the reason OAuth gave', () =>
      fails('bad client', json(401, { error_description: 'bad client' })))

    test('hides a secret or a token that Drupal echoes', () =>
      fails(
        '[hidden]',
        tokenOk(),
        json(403, { message: `${SECRET} and ${TOKEN}` })
      ))
  })
})

describe('registerOnce', () => {
  const KEY = Symbol.for('druxt-node-preview.register')
  beforeEach(() => {
    jest.useFakeTimers()
    delete process[KEY]
  })
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    delete process[KEY]
  })

  test('runs once for each process, and gives the first result', async () => {
    const first = jest.fn().mockResolvedValue('registered')
    const second = jest.fn()
    await expect(registerOnce(first)).resolves.toBe('registered')
    await expect(registerOnce(second)).resolves.toBe('registered')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  test('registers again on the heartbeat, within the inactive limit', () => {
    const run = jest.fn().mockResolvedValue('registered')
    registerOnce(run)
    expect(HEARTBEAT).toBeLessThan(86400000)
    jest.advanceTimersByTime(HEARTBEAT * 2)
    expect(run).toHaveBeenCalledTimes(3)
  })

  test('the heartbeat does not keep a build alive', () => {
    const unref = jest.fn()
    const interval = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref })
    registerOnce(jest.fn())
    expect(unref).toHaveBeenCalledTimes(1)
    interval.mockRestore()
  })
})
