import { DruxtClient } from 'druxt'
import {
  mergeTargets,
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

const json = (status, data) => ({ status, text: JSON.stringify(data) })

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
  timeout: 5000,
  ...overrides,
})

const OURS =
  'https://www.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview_path]'

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

// Every message the module printed.
const printed = () =>
  [...warn.mock.calls, ...info.mock.calls].map((args) => args.join(' '))

describe('resolveRegister', () => {
  const env = { DRUXT_NODE_PREVIEW_CLIENT_SECRET: SECRET }

  test('is off unless the register option is set', () => {
    for (const value of [undefined, null, false]) {
      expect(resolveRegister(value, env)).toBeNull()
    }
    expect(warn).not.toHaveBeenCalled()
  })

  test('takes the options, and defaults the label to the URL host', () => {
    expect(
      resolveRegister(
        { url: 'https://www.example.com:8443/', consumer: 'frontend' },
        env
      )
    ).toEqual({
      url: 'https://www.example.com:8443',
      label: 'www.example.com:8443',
      consumer: 'frontend',
      secret: SECRET,
      timeout: 5000,
    })
  })

  test('keeps a path in the URL, for a site under a sub path', () => {
    expect(
      resolveRegister(
        { url: 'https://www.example.com/app/', consumer: 'c' },
        env
      ).url
    ).toBe('https://www.example.com/app')
  })

  test('takes a label and a timeout', () => {
    const resolved = resolveRegister(
      {
        url: 'https://www.example.com',
        consumer: 'c',
        label: ' Production ',
        timeout: 2000,
      },
      env
    )
    expect(resolved.label).toBe('Production')
    expect(resolved.timeout).toBe(2000)
  })

  test('true takes everything from the environment', () => {
    expect(
      resolveRegister(true, {
        ...env,
        DRUXT_NODE_PREVIEW_URL: 'http://localhost:3000',
        DRUXT_NODE_PREVIEW_CLIENT_ID: 'local',
      })
    ).toEqual({
      url: 'http://localhost:3000',
      label: 'localhost:3000',
      consumer: 'local',
      secret: SECRET,
      timeout: 5000,
    })
  })

  test('the environment wins over the options', () => {
    const resolved = resolveRegister(
      { url: 'https://www.example.com', consumer: 'prod' },
      {
        ...env,
        DRUXT_NODE_PREVIEW_URL: 'https://staging.example.com',
        DRUXT_NODE_PREVIEW_CLIENT_ID: 'staging',
      }
    )
    expect(resolved.url).toBe('https://staging.example.com')
    expect(resolved.label).toBe('staging.example.com')
    expect(resolved.consumer).toBe('staging')
  })

  test('an empty environment variable does not hide the option', () => {
    const resolved = resolveRegister(
      { url: 'https://www.example.com', consumer: 'prod' },
      {
        ...env,
        DRUXT_NODE_PREVIEW_URL: '',
        DRUXT_NODE_PREVIEW_CLIENT_ID: '',
      }
    )
    expect(resolved.url).toBe('https://www.example.com')
    expect(resolved.consumer).toBe('prod')
  })

  test('a register value that is not true or an object is reported and ignored', () => {
    expect(resolveRegister('yes', env)).toBeNull()
    expect(resolveRegister(['https://www.example.com'], env)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignored the register option')
    )
  })

  test('a missing or bad URL is reported and turns registration off', () => {
    expect(resolveRegister({ consumer: 'c' }, env)).toBeNull()
    expect(warn).toHaveBeenLastCalledWith(
      expect.stringContaining('DRUXT_NODE_PREVIEW_URL')
    )
    for (const url of [
      'www.example.com',
      'javascript:alert(1)',
      'https://www.example.com/?a=1',
      'https://www.example.com/#x',
      7,
    ]) {
      expect(resolveRegister({ url, consumer: 'c' }, env)).toBeNull()
    }
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"www.example.com"')
    )
  })

  test('a bad URL from the environment says so', () => {
    expect(
      resolveRegister(true, {
        ...env,
        DRUXT_NODE_PREVIEW_URL: 'nope',
        DRUXT_NODE_PREVIEW_CLIENT_ID: 'c',
      })
    ).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('from DRUXT_NODE_PREVIEW_URL')
    )
  })

  test("the consumer falls back to druxt-auth's client ID", () => {
    const url = 'https://www.example.com'
    const auth = {
      auth: { clientId: 'auth-option', clientSecret: 'auth-secret-value' },
    }
    const authEnv = { ...env, DRUXT_AUTH_CLIENT_ID: 'auth-env' }

    // The order: DRUXT_NODE_PREVIEW_CLIENT_ID, register.consumer,
    // druxt.auth.clientId, then DRUXT_AUTH_CLIENT_ID.
    expect(
      resolveRegister(
        { url, consumer: 'option' },
        { ...authEnv, DRUXT_NODE_PREVIEW_CLIENT_ID: 'env' },
        auth
      ).consumer
    ).toBe('env')
    expect(
      resolveRegister({ url, consumer: 'option' }, authEnv, auth).consumer
    ).toBe('option')
    expect(resolveRegister({ url }, authEnv, auth).consumer).toBe('auth-option')
    expect(resolveRegister({ url }, authEnv, {}).consumer).toBe('auth-env')
    expect(resolveRegister({ url }, authEnv, undefined).consumer).toBe(
      'auth-env'
    )

    // druxt-auth's secret is never used.
    expect(resolveRegister({ url }, env, auth).secret).toBe(SECRET)
    expect(resolveRegister({ url }, {}, auth)).toBeNull()
    expect(printed().join('\n')).not.toContain('auth-secret-value')
  })

  test('a missing or bad consumer is reported and turns registration off', () => {
    expect(resolveRegister({ url: 'https://www.example.com' }, env)).toBeNull()
    expect(warn).toHaveBeenLastCalledWith(
      expect.stringContaining('DRUXT_NODE_PREVIEW_CLIENT_ID')
    )
    expect(
      resolveRegister({ url: 'https://www.example.com', consumer: 'a\nb' }, env)
    ).toBeNull()
    expect(
      resolveRegister({ url: 'https://www.example.com', consumer: 7 }, env)
    ).toBeNull()
    expect(warn).toHaveBeenCalledTimes(3)
  })

  test('a missing secret is reported and turns registration off', () => {
    expect(
      resolveRegister({ url: 'https://www.example.com', consumer: 'c' }, {})
    ).toBeNull()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('DRUXT_NODE_PREVIEW_CLIENT_SECRET is not set')
    )
  })

  test('a secret in the options is never used or printed', () => {
    const resolved = resolveRegister(
      {
        url: 'https://www.example.com',
        consumer: 'c',
        secret: 'in-the-config',
      },
      env
    )
    expect(resolved.secret).toBe(SECRET)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignored druxt.nodePreview.register.secret')
    )
    expect(printed().join('\n')).not.toContain('in-the-config')

    expect(
      resolveRegister(
        {
          url: 'https://www.example.com',
          consumer: 'c',
          secret: 'in-the-config',
        },
        {}
      )
    ).toBeNull()
    expect(printed().join('\n')).not.toContain('in-the-config')
  })

  test('a bad label falls back to the default, with a warning', () => {
    for (const label of ['', '  ', 7]) {
      expect(
        resolveRegister(
          { url: 'https://www.example.com', consumer: 'c', label },
          env
        ).label
      ).toBe('www.example.com')
    }
    expect(warn).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignored the register label')
    )
  })

  test('a bad timeout falls back to the default, with a warning', () => {
    for (const timeout of [0, -1, '5000', 120001, NaN]) {
      expect(
        resolveRegister(
          { url: 'https://www.example.com', consumer: 'c', timeout },
          env
        ).timeout
      ).toBe(5000)
    }
    expect(warn).toHaveBeenCalledTimes(5)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignored the register timeout')
    )
  })
})

describe('targetUrl', () => {
  test('has the layout token only when layouts are configured', () => {
    expect(
      targetUrl('https://www.example.com', '/druxt/node/preview', [])
    ).toBe(
      'https://www.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview_path]'
    )
    expect(
      targetUrl('https://www.example.com', '/druxt/node/preview', [
        'default',
        'preview',
      ])
    ).toBe(
      'https://www.example.com/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]'
    )
  })
})

describe('mergeTargets', () => {
  const others = [
    { label: 'Local', url: 'http://localhost:3000/p' },
    { label: 'Staging', url: 'https://staging.example.com/p' },
  ]

  test('appends a target with a new label, and keeps the others', () => {
    expect(
      mergeTargets(others, {
        label: 'Production',
        url: 'https://www.example.com/p',
      })
    ).toEqual({
      changed: true,
      targets: [
        ...others,
        { label: 'Production', url: 'https://www.example.com/p' },
      ],
    })
  })

  test('replaces the target with the same label, in its place', () => {
    expect(
      mergeTargets(others, { label: 'Local', url: 'http://localhost:4000/p' })
    ).toEqual({
      changed: true,
      targets: [{ label: 'Local', url: 'http://localhost:4000/p' }, others[1]],
    })
  })

  test('reports no change for the same target', () => {
    expect(mergeTargets(others, { ...others[1] })).toEqual({
      changed: false,
      targets: others,
    })
  })

  test('replaces only the first of two targets with the label', () => {
    const twice = [
      { label: 'A', url: 'https://a.example.com/1' },
      { label: 'A', url: 'https://a.example.com/2' },
    ]
    expect(
      mergeTargets(twice, { label: 'A', url: 'https://a.example.com/3' })
        .targets
    ).toEqual([{ label: 'A', url: 'https://a.example.com/3' }, twice[1]])
  })
})

describe('registerTarget', () => {
  const tokenOk = () =>
    json(200, { token_type: 'Bearer', access_token: TOKEN, expires_in: 300 })
  const current = (targets, layouts = []) =>
    json(200, { consumer: 'uuid', targets, layouts })

  test('requests a client credentials token', async () => {
    answer(tokenOk(), current([{ label: 'www.example.com', url: OURS }]))
    await registerTarget(settings())

    const [method, url, options] = request.mock.calls[0]
    expect(method).toBe('POST')
    expect(url).toBe(`${BASE}/oauth/token`)
    expect(options.headers['Content-Type']).toBe(
      'application/x-www-form-urlencoded'
    )
    expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({
      grant_type: 'client_credentials',
      client_id: 'frontend',
      client_secret: SECRET,
    })
    expect(options.config.maxRedirects).toBe(0)
  })

  test('builds one DruxtClient from the druxt options, with the timeout', async () => {
    answer(tokenOk(), current([{ label: 'www.example.com', url: OURS }]))
    const druxt = {
      baseUrl: BASE,
      debug: false,
      axios: { headers: { 'X-Site': 'yes' }, timeout: 60000 },
    }
    await registerTarget(settings({ druxt, timeout: 2000 }))

    expect(DruxtClient).toHaveBeenCalledTimes(1)
    expect(DruxtClient).toHaveBeenCalledWith(BASE, {
      ...druxt,
      axios: { headers: { 'X-Site': 'yes' }, timeout: 2000 },
    })
    expect(clients[0].axios.defaults.timeout).toBe(2000)
    expect(clients[0].axios.defaults.headers['X-Site']).toBe('yes')
    // No request follows a redirect, and every status comes back.
    for (const [config] of clients[0].axios.request.mock.calls) {
      expect(config.maxRedirects).toBe(0)
      expect(config.validateStatus(500)).toBe(true)
    }
  })

  test('takes a JSON body that axios has already parsed', async () => {
    answer(tokenOk())
    request.mockResolvedValueOnce({
      status: 200,
      text: { targets: [{ label: 'www.example.com', url: OURS }], layouts: [] },
    })
    await expect(registerTarget(settings())).resolves.toBe('unchanged')
  })

  test('reads the targets with the token and the consumer header', async () => {
    answer(tokenOk(), current([{ label: 'www.example.com', url: OURS }]))
    await registerTarget(settings({ baseUrl: BASE + '/' }))

    const [method, url, options] = request.mock.calls[1]
    expect(method).toBe('GET')
    expect(url).toBe(API)
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'X-Consumer-ID': 'frontend',
    })
    expect(options.config.maxRedirects).toBe(0)
  })

  test('appends the target and keeps the others', async () => {
    const local = {
      label: 'Local',
      url: 'http://localhost:3000/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview]',
    }
    answer(
      tokenOk(),
      current([local], ['default']),
      current([local, { label: 'www.example.com', url: OURS }], ['default'])
    )
    await expect(registerTarget(settings())).resolves.toBe('registered')

    expect(request).toHaveBeenCalledTimes(3)
    const [method, url, options] = request.mock.calls[2]
    expect(method).toBe('PUT')
    expect(url).toBe(API)
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      'X-Consumer-ID': 'frontend',
      'Content-Type': 'application/json',
    })
    // No layouts option, so the PUT leaves the consumer's layouts alone.
    expect(JSON.parse(options.body)).toEqual({
      targets: [local, { label: 'www.example.com', url: OURS }],
    })
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining(
        'Registered the preview target "www.example.com" on the consumer "frontend"'
      )
    )
  })

  test('replaces the target with the same label', async () => {
    const other = { label: 'Other', url: 'https://other.example.com/p' }
    answer(
      tokenOk(),
      current([
        { label: 'www.example.com', url: 'https://old.example.com/p' },
        other,
      ]),
      current([])
    )
    await expect(registerTarget(settings())).resolves.toBe('registered')
    expect(JSON.parse(request.mock.calls[2][2].body).targets).toEqual([
      { label: 'www.example.com', url: OURS },
      other,
    ])
  })

  test('skips the PUT when the target is up to date', async () => {
    answer(tokenOk(), current([{ label: 'www.example.com', url: OURS }]))
    await expect(registerTarget(settings())).resolves.toBe('unchanged')
    expect(request).toHaveBeenCalledTimes(2)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('is up to date'))
  })

  test('sends the layouts when they are configured', async () => {
    const url =
      'https://www.example.com/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]'
    answer(tokenOk(), current([], ['old']), current([]))
    await registerTarget(
      settings({ layouts: ['default', 'preview', 'default'] })
    )
    expect(JSON.parse(request.mock.calls[2][2].body)).toEqual({
      targets: [{ label: 'www.example.com', url }],
      layouts: ['default', 'preview'],
    })
  })

  test('puts when only the layouts differ', async () => {
    const url =
      'https://www.example.com/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]'
    answer(
      tokenOk(),
      current([{ label: 'www.example.com', url }], ['preview']),
      current([])
    )
    await expect(
      registerTarget(settings({ layouts: ['default', 'preview'] }))
    ).resolves.toBe('registered')
    expect(JSON.parse(request.mock.calls[2][2].body).layouts).toEqual([
      'default',
      'preview',
    ])
  })

  test('skips the PUT when the target and the layouts are up to date', async () => {
    const url =
      'https://www.example.com/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]'
    answer(
      tokenOk(),
      current([{ label: 'www.example.com', url }], ['default', 'preview'])
    )
    await expect(
      registerTarget(settings({ layouts: ['default', 'preview'] }))
    ).resolves.toBe('unchanged')
    expect(request).toHaveBeenCalledTimes(2)
  })

  describe('failures warn and never throw, and never print the secret or the token', () => {
    afterEach(() => {
      const all = printed().join('\n')
      expect(all).not.toContain(SECRET)
      expect(all).not.toContain(TOKEN)
    })

    const failsWith = async (text, overrides) => {
      await expect(registerTarget(settings(overrides))).resolves.toBe('failed')
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toMatch(
        /^\[druxt-node-preview\] Could not register the preview target/
      )
      expect(warn.mock.calls[0][0]).toContain(text)
      return warn.mock.calls[0][0]
    }

    test('no Drupal URL', async () => {
      await failsWith('druxt.baseUrl', { baseUrl: undefined })
      expect(request).not.toHaveBeenCalled()
    })

    test('a token request refused with 401', async () => {
      // An OAuth server can echo what it got. The message must still hide it.
      answer(
        json(401, {
          error: 'invalid_client',
          message: `Client authentication failed for ${SECRET}`,
        })
      )
      const message = await failsWith('HTTP 401')
      expect(message).toContain('Client authentication failed')
      expect(message).toContain('DRUXT_NODE_PREVIEW_CLIENT_SECRET')
      expect(request).toHaveBeenCalledTimes(1)
    })

    test('a token request refused with 400', async () => {
      answer(
        json(400, {
          error: 'unauthorized_client',
          error_description: 'The grant type is not allowed.',
        })
      )
      const message = await failsWith(
        'HTTP 400: The grant type is not allowed.'
      )
      expect(message).toContain('Client credentials')
    })

    test('no token endpoint', async () => {
      answer({ status: 404, text: '<html>Not found</html>' })
      const message = await failsWith('Simple OAuth')
      expect(message).not.toContain('<html>')
    })

    test('a token endpoint that fails otherwise', async () => {
      answer(json(500, { message: 'You need to set the OAuth2 private key.' }))
      await failsWith('HTTP 500: You need to set the OAuth2 private key.')
    })

    test('a token response without a token', async () => {
      answer({ status: 200, text: 'not json' })
      await failsWith('no access token')
    })

    test('Drupal does not answer the token request', async () => {
      answer(
        Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        })
      )
      await failsWith(
        `Drupal did not answer at ${BASE}/oauth/token (ECONNREFUSED)`
      )
    })

    test('the token request times out', async () => {
      answer(
        Object.assign(new Error('timeout of 5000ms exceeded'), {
          code: 'ECONNABORTED',
        })
      )
      await failsWith('within 5 seconds', { timeout: 5000 })
    })

    test('a request aborted for another reason is not a timeout', async () => {
      answer(Object.assign(new Error('aborted'), { code: 'ECONNABORTED' }))
      await failsWith('(ECONNABORTED). Check druxt.baseUrl')
    })

    test('a redirect is not followed', async () => {
      answer({
        status: 301,
        text: '',
        headers: { location: 'https://other.example.com/oauth/token' },
      })
      const message = await failsWith(
        `Drupal redirected ${BASE}/oauth/token to https://other.example.com/oauth/token (HTTP 301)`
      )
      expect(message).toContain('druxt.baseUrl')
      expect(request).toHaveBeenCalledTimes(1)
    })

    test('a redirect without a location', async () => {
      answer(tokenOk(), { status: 302, text: '' })
      await failsWith(`Drupal redirected ${API} (HTTP 302)`)
    })

    test('the GET refused with 403', async () => {
      answer(
        tokenOk(),
        json(403, { message: 'This user does not own the consumer.' })
      )
      const message = await failsWith(
        'HTTP 403: This user does not own the consumer.'
      )
      expect(message).toContain('register consumer node preview targets')
      expect(request).toHaveBeenCalledTimes(2)
    })

    test('the GET answered 404', async () => {
      answer(
        tokenOk(),
        json(404, {
          message: 'No consumer could be identified from the request.',
        })
      )
      const message = await failsWith(
        'HTTP 404: No consumer could be identified from the request.'
      )
      expect(message).toContain('"frontend"')
    })

    test('the GET answered with something else', async () => {
      answer(tokenOk(), { status: 500, text: 'oops' })
      await failsWith('HTTP 500')
    })

    test('the GET answered 200 without targets', async () => {
      answer(tokenOk(), { status: 200, text: '<html></html>' })
      await failsWith('did not answer with a targets list')
    })

    test('the GET answered targets that are not plain', async () => {
      answer(tokenOk(), current([null]))
      await failsWith('did not answer with a targets list')
    })

    test('an unexpected error still only warns', async () => {
      request.mockResolvedValueOnce(null)
      await failsWith('Could not register the preview target: ')
    })

    test('the GET times out', async () => {
      answer(
        tokenOk(),
        Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
      )
      await failsWith(`Drupal did not answer at ${API} within 2 seconds`, {
        timeout: 2000,
      })
    })

    test("the PUT refused with 422 gives CNP's message", async () => {
      answer(
        tokenOk(),
        current([]),
        json(422, { message: 'preview_targets.0.url: The URL is not valid.' })
      )
      const message = await failsWith(
        'HTTP 422: preview_targets.0.url: The URL is not valid.'
      )
      expect(message).toContain('register url')
    })

    test('the PUT refused with 403', async () => {
      answer(tokenOk(), current([]), json(403, { message: 'Access denied.' }))
      await failsWith('HTTP 403: Access denied.')
    })

    test('the PUT fails on the network', async () => {
      answer(
        tokenOk(),
        current([]),
        Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
      )
      await failsWith('(ECONNRESET)')
    })

    test('an error without a code', async () => {
      answer(new Error('Something odd'))
      await failsWith('Something odd')
    })

    test('a long message from Drupal is cut short', async () => {
      answer(json(500, { message: 'x'.repeat(1000) }))
      const message = await failsWith('HTTP 500')
      expect(message.length).toBeLessThan(600)
    })
  })
})

describe('registerOnce', () => {
  const KEY = Symbol.for('druxt-node-preview.register')
  beforeEach(() => {
    delete process[KEY]
  })
  afterEach(() => {
    delete process[KEY]
  })

  test('runs once per process, and returns the same promise after that', async () => {
    const run = jest.fn(async () => 'registered')
    const first = registerOnce(run)
    const second = registerOnce(run)
    expect(second).toBe(first)
    await expect(first).resolves.toBe('registered')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
