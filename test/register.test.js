import axios from 'axios'
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
      token: false,
      interval: HEARTBEAT,
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
      token: false,
      interval: HEARTBEAT,
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
    // The option can come from druxt.nodePreview or the module options.
    expect(output).toContain('Ignored register.secret.')
  })

  test('registers again every 6 hours by default', () => {
    expect(resolveRegister(true, ENV).interval).toBe(HEARTBEAT)
  })

  test('takes the interval from the options or the environment', () => {
    expect(resolveRegister({ interval: 600000 }, ENV).interval).toBe(600000)
    // Node's timers stop at this, the largest 32-bit signed integer.
    expect(resolveRegister({ interval: 2147483647 }, ENV).interval).toBe(
      2147483647
    )
    expect(
      resolveRegister(
        { interval: 600000 },
        { ...ENV, DRUXT_NODE_PREVIEW_REGISTER_INTERVAL: ' 60000 ' }
      ).interval
    ).toBe(60000)
    expect(warn).not.toHaveBeenCalled()
  })

  test.each([[59999], [1.5], ['600000'], [-60000], [Infinity], [2147483648]])(
    'the interval %j is ignored with a warning',
    (interval) => {
      const register = resolveRegister({ interval }, ENV)
      expect(register.interval).toBe(HEARTBEAT)
      expect(warn.mock.calls[0][0]).toBe(
        '[druxt-node-preview] Ignored DRUXT_NODE_PREVIEW_REGISTER_INTERVAL or register.interval. Use a whole number of milliseconds, from 60000 to 2147483647.'
      )
    }
  )

  test.each([['10m'], ['600000.5'], ['1e6'], ['59999'], ['2147483648']])(
    'the interval %j from the environment is ignored with a warning',
    (value) => {
      const env = { ...ENV, DRUXT_NODE_PREVIEW_REGISTER_INTERVAL: value }
      expect(resolveRegister(true, env).interval).toBe(HEARTBEAT)
      expect(warn.mock.calls[0][0]).toContain('register.interval')
    }
  )
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

  test('registers the token form, on another site or when asked', async () => {
    answer(tokenOk(), saved(), tokenOk(), saved())
    await registerTarget(
      settings({ baseUrl: undefined, backend: 'https://cms.test', token: true })
    )
    await registerTarget(settings({ token: true }))

    expect(request.mock.calls[0][1]).toBe('https://cms.test/oauth/token')
    expect(request.mock.calls[1][1]).toBe(
      'https://cms.test/api/consumer-node-preview/targets'
    )
    const sent = (call) => JSON.parse(request.mock.calls[call][2].body)
    // A path would name druxt.baseUrl, not the backend.
    expect(sent(1).target.url).toBe(
      'https://www.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview];token=[preview_token]'
    )
    // On druxt.baseUrl, the path goes through the site's API proxy, if any.
    expect(sent(3).target.url).toBe(
      'https://www.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview_path];token=[preview_token]'
    )
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

  // Druxt 0.25 takes its axios options from Nuxt's own axios option, for
  // @nuxtjs/axios, and deprecates druxt.axios.
  test("applies Nuxt's axios options before druxt.axios", async () => {
    answer(tokenOk(), saved(), tokenOk(), saved())
    await registerTarget(
      settings({
        axios: { timeout: 60000, headers: { 'X-Site': 'yes' }, proxy: true },
        druxt: { baseUrl: BASE, axios: { timeout: 1000, params: { a: 'b' } } },
      })
    )
    const { defaults } = clients[0].axios
    expect(defaults.timeout).toBe(60000)
    expect(defaults.headers['X-Site']).toBe('yes')
    expect(defaults.params).toEqual({ a: 'b' })
    // Its proxy turns on @nuxtjs/proxy. It is not an axios proxy.
    expect(defaults.proxy).toBeUndefined()

    // druxt.axios fills what Nuxt's option leaves out.
    await registerTarget(
      settings({ axios: {}, druxt: { axios: { timeout: 1000 } } })
    )
    expect(clients[1].axios.defaults.timeout).toBe(1000)
  })

  test("a backend gets only the timeout of Nuxt's axios options", async () => {
    answer(tokenOk(), saved())
    await registerTarget(
      settings({
        backend: 'https://other.example.com',
        token: true,
        axios: {
          timeout: 60000,
          headers: { Authorization: 'Basic c2l0ZQ==' },
          proxy: true,
        },
      })
    )
    const { defaults } = clients[0].axios
    expect(defaults.timeout).toBe(60000)
    expect(defaults.headers).toEqual({})
    expect(defaults.proxy).toBeUndefined()
  })

  test('sends no site credentials to a backend', async () => {
    answer(tokenOk(), saved())
    const druxt = {
      baseUrl: BASE,
      axios: {
        timeout: 60000,
        headers: { Authorization: 'Basic c2l0ZQ==' },
        auth: { username: 'site', password: 'site' },
        withCredentials: true,
      },
    }
    await registerTarget(
      settings({ backend: 'https://other.example.com', token: true, druxt })
    )
    const { defaults } = clients[0].axios
    expect(defaults.timeout).toBe(60000)
    expect(defaults.headers.Authorization).toBeUndefined()
    expect(defaults.auth).toBeUndefined()
    expect(defaults.withCredentials).toBeFalsy()
  })

  test('a backend gets only the timeout and proxy of the site', async () => {
    answer(tokenOk(), saved())
    const proxy = { host: 'proxy.example.com', port: 3128 }
    const druxt = {
      baseUrl: BASE,
      axios: { timeout: 60000, proxy, params: { api_key: 'site' } },
    }
    await registerTarget(
      settings({ backend: 'https://other.example.com', token: true, druxt })
    )
    const { defaults } = clients[0].axios
    expect(defaults.timeout).toBe(60000)
    expect(defaults.proxy).toEqual(proxy)
    expect(defaults.params).toBeUndefined()
  })

  test('a backend gets no defaults from the global axios', async () => {
    answer(tokenOk(), saved(), tokenOk(), saved())
    axios.defaults.headers.common.Authorization = 'Basic Z2xvYmFs'
    axios.defaults.headers.patch.Cookie = 'SESS=site'
    axios.defaults.headers.common['X-Api-Key'] = 'site'
    axios.defaults.headers['X-Site'] = 'yes'
    axios.defaults.params = { api_key: 'site' }
    try {
      await registerTarget(
        settings({ backend: 'https://other.example.com', token: true })
      )
      await registerTarget(settings())
    } finally {
      delete axios.defaults.headers.common.Authorization
      delete axios.defaults.headers.patch.Cookie
      delete axios.defaults.headers.common['X-Api-Key']
      delete axios.defaults.headers['X-Site']
      delete axios.defaults.params
    }
    const [backend, site] = clients.map(({ axios }) => axios.defaults)
    // Each request sets its own headers, and the defaults bring none.
    expect(backend.headers).toEqual({})
    expect(backend.params).toBeUndefined()
    expect(backend.adapter).toBe('http')
    expect(backend.transformRequest).not.toBe(axios.defaults.transformRequest)
    expect(backend.transformResponse).not.toBe(axios.defaults.transformResponse)
    // druxt.baseUrl keeps what axios gives it.
    expect(site.headers.common.Authorization).toBe('Basic Z2xvYmFs')
  })

  test('a backend keeps an adapter function, as axios 0.x gives', async () => {
    answer(tokenOk(), saved())
    const before = axios.defaults.adapter
    const adapter = jest.fn()
    axios.defaults.adapter = adapter
    try {
      await registerTarget(
        settings({ backend: 'https://other.example.com', token: true })
      )
    } finally {
      axios.defaults.adapter = before
    }
    expect(clients[0].axios.defaults.adapter).toBe(adapter)
  })

  test("a backend ignores the site's adapter", async () => {
    answer(tokenOk(), saved())
    const before = axios.defaults.adapter
    const adapter = jest.fn()
    axios.defaults.adapter = adapter
    try {
      await registerTarget(
        settings({
          backend: 'https://other.example.com',
          token: true,
          druxt: { axios: { adapter: '' } },
        })
      )
    } finally {
      axios.defaults.adapter = before
    }
    expect(clients[0].axios.defaults.adapter).toBe(adapter)
  })

  test('no request follows a redirect, and every status comes back', async () => {
    answer(tokenOk(), saved())
    await registerTarget(settings())
    for (const [config] of clients[0].axios.request.mock.calls) {
      expect(config.maxRedirects).toBe(0)
      expect(config.validateStatus(500)).toBe(true)
    }
  })

  test.each([
    ['http://cms.example.com', 1],
    ['https://cms.example.com', 0],
    ['http://localhost:8080', 0],
    ['http://127.0.0.1:8080', 0],
    ['http://[::1]:8080', 0],
    ['http://druxt.localhost', 0],
  ])('%s gives %i warnings about plain HTTP', async (baseUrl, count) => {
    answer(tokenOk(), saved())
    await expect(registerTarget(settings({ baseUrl }))).resolves.toBe(
      'registered'
    )
    expect(warn).toHaveBeenCalledTimes(count)
    if (count) {
      expect(warn.mock.calls[0][0]).toContain('plain HTTP')
      expect(warn.mock.calls[0][0]).not.toContain(SECRET)
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

    test('a user name and password in the base URL', async () => {
      answer(json(404, {}))
      await registerTarget(
        settings({ baseUrl: 'https://admin:hunter2@cms.example.com' })
      )
      const [message] = warn.mock.calls[0]
      expect(message).toContain('https://cms.example.com/oauth/token')
      expect(message).not.toContain('admin')
      expect(message).not.toContain('hunter2')
    })

    test('a password with an "@" in the base URL', async () => {
      answer(json(404, {}))
      await registerTarget(
        settings({ baseUrl: 'https://admin:p@ssw0rd@cms.example.com' })
      )
      const [message] = warn.mock.calls[0]
      expect(message).toContain('https://cms.example.com/oauth/token')
      expect(message).not.toContain('ssw0rd')
    })

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

    test('a redirect from druxt.baseUrl says to set it', () =>
      fails('Set druxt.baseUrl to the URL Drupal redirects to.', {
        status: 301,
        text: '',
      }))

    test('a redirect from a backend says to set the backend', async () => {
      answer({ status: 301, text: '' })
      await registerTarget(
        settings({ backend: 'https://other.example.com', token: true })
      )
      expect(warn.mock.calls[0][0]).toContain(
        'Set the register backend to the URL Drupal redirects to.'
      )
    })

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

  test('registers again on the interval it is given', () => {
    const run = jest.fn().mockResolvedValue('registered')
    registerOnce(run, 60000)
    jest.advanceTimersByTime(60000 * 3)
    expect(run).toHaveBeenCalledTimes(4)
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

describe('registering on another Drupal site', () => {
  const env = {
    DRUXT_NODE_PREVIEW_REGISTER_SECRET: 'theirs',
    DRUXT_NODE_PREVIEW_CLIENT_SECRET: 'ours',
  }
  const options = {
    url: 'https://branch.example.com',
    consumer: 'frontend',
    backend: 'https://cms.example.com/',
  }

  test('uses the separate secret, not the one for its own backend', () => {
    const settings = resolveRegister(options, env)
    expect(settings.backend).toBe('https://cms.example.com')
    expect(settings.secret).toBe('theirs')
  })

  test('registers nothing without the separate secret', () => {
    expect(
      resolveRegister(options, { DRUXT_NODE_PREVIEW_CLIENT_SECRET: 'ours' })
    ).toBe(null)
  })

  test('the environment names the backend too', () => {
    const settings = resolveRegister(
      { url: options.url, consumer: 'frontend' },
      {
        ...env,
        DRUXT_NODE_PREVIEW_REGISTER_BACKEND: 'https://other.example.com',
      }
    )
    expect(settings.backend).toBe('https://other.example.com')
  })

  test('a backend target holds the full endpoint and a token', () => {
    expect(targetUrl('https://b.example.com', '/p', ['a'], true, true)).toBe(
      'https://b.example.com/p?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview];token=[preview_token]'
    )
  })

  test('a token target on druxt.baseUrl holds the path and a token', () => {
    expect(targetUrl('https://b.example.com', '/p', ['a'], true)).toBe(
      'https://b.example.com/p?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path];token=[preview_token]'
    )
    expect(targetUrl('https://b.example.com', '/p', [])).toBe(
      'https://b.example.com/p?vm=[view_mode]#[jsonapi_node_preview_path]'
    )
  })
})

describe('the token option', () => {
  const env = { DRUXT_NODE_PREVIEW_CLIENT_SECRET: 'ours' }
  const options = { url: 'https://www.example.com', consumer: 'frontend' }

  test('is off for druxt.baseUrl, and on for another site', () => {
    expect(resolveRegister(options, env).token).toBe(false)
    expect(
      resolveRegister(
        { ...options, backend: 'https://cms.example.com' },
        { DRUXT_NODE_PREVIEW_REGISTER_SECRET: 'theirs' }
      ).token
    ).toBe(true)
  })

  test('takes a boolean option, or true or false from the environment', () => {
    expect(resolveRegister({ ...options, token: true }, env).token).toBe(true)
    expect(
      resolveRegister(
        { ...options, token: true },
        { ...env, DRUXT_NODE_PREVIEW_REGISTER_TOKEN: 'false' }
      ).token
    ).toBe(false)
    expect(
      resolveRegister(options, {
        ...env,
        DRUXT_NODE_PREVIEW_REGISTER_TOKEN: '1',
      }).token
    ).toBe(true)
  })

  test('registers nothing for a value that is not true or false', () => {
    expect(resolveRegister({ ...options, token: 'yes' }, env)).toBe(null)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('register.token must be true or false')
    )
  })

  // An object lookup would find these on Object.prototype.
  test.each(['toString', 'constructor', '__proto__'])(
    'registers nothing for %s',
    (value) => {
      expect(resolveRegister({ ...options, token: value }, env)).toBe(null)
      expect(
        resolveRegister(options, {
          ...env,
          DRUXT_NODE_PREVIEW_REGISTER_TOKEN: value,
        })
      ).toBe(null)
    }
  )
})
