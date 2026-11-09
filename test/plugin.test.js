const { loadPlugin } = require('./helpers/plugin-template')

// Drupal gives every JSON:API resource a UUID, and Consumer Node Preview
// points at /{entity type}/{bundle}/{uuid}/preview.
const UUID = '8a0b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const P1 = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const P2 = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f'
const ENDPOINT = `https://example.com/jsonapi/node/article/${UUID}/preview`

/** A JSON:API response, as the Druxt client resolves it. */
const axiosJsonApi = (doc, type = 'application/vnd.api+json') => ({
  data: doc,
  headers: { 'content-type': type },
})

/** A JSON:API response, as window.fetch resolves it. */
const jsonApi = (doc, type = 'application/vnd.api+json') => ({
  ok: true,
  headers: {
    get: (name) => (name.toLowerCase() === 'content-type' ? type : null),
  },
  json: async () => doc,
})

const buildPlugin = (app = {}, include = undefined) => {
  const commits = []
  const modules = {}
  const store = {
    state: {},
    commit: (name, payload) => commits.push({ name, payload }),
    hasModule: (name) => !!modules[name],
    registerModule: (name, module) => {
      modules[name] = module
    },
  }
  let injected
  loadPlugin(include === undefined ? {} : { include }).default(
    { app, store },
    (name, value) => {
      injected = { name, value }
    }
  )
  return { commits, injected, modules }
}

// cspell:ignore cnpt
describe('$druxtNodePreview plugin', () => {
  // A token kept for a reload must not reach the next test.
  beforeEach(() => window.sessionStorage.clear())

  test('injects the plugin', () => {
    const { injected } = buildPlugin()
    expect(injected.name).toBe('druxtNodePreview')
    expect(typeof injected.value.fetch).toBe('function')
  })

  test('layout accepts only a configured layout name', () => {
    const { injected } = buildPlugin()
    expect(injected.value.layout('preview')).toBe('preview')
    expect(injected.value.layout('default')).toBe('default')
    expect(injected.value.layout('admin')).toBeUndefined()
    expect(injected.value.layout(undefined)).toBeUndefined()
    expect(injected.value.layout(['preview'])).toBeUndefined()
    // What Consumer Node Preview sends for a target without layouts.
    expect(injected.value.layout('')).toBeUndefined()
    expect(injected.value.layout(null)).toBeUndefined()
  })

  test('endpoint comes from the fragment', () => {
    const { injected } = buildPlugin()
    window.location.hash =
      '#https%3A%2F%2Fexample.com%2Fjsonapi%2Fnode%2Farticle%2Fabc%2Fpreview'
    expect(injected.value.endpoint()).toBe(
      'https://example.com/jsonapi/node/article/abc/preview'
    )
    window.location.hash = ''
    expect(injected.value.endpoint()).toBe(null)
  })

  test('a token in the fragment is not part of the endpoint', () => {
    const { injected } = buildPlugin()
    window.location.hash =
      '#https://example.com/jsonapi/node/article/abc/preview;token=cnpt.a.b'
    expect(injected.value.endpoint()).toBe(
      'https://example.com/jsonapi/node/article/abc/preview'
    )
    expect(injected.value.token()).toBe('cnpt.a.b')
    window.location.hash = '#/jsonapi/node/article/abc/preview'
    expect(injected.value.token()).toBe(null)
    window.location.hash = ''
  })

  test('registers the preview store module', () => {
    const { modules } = buildPlugin()
    const state = modules.druxtNodePreview.state()
    expect(state).toEqual({ active: false, uuid: null })
    modules.druxtNodePreview.mutations.start(state, 'abc')
    expect(state).toEqual({ active: true, uuid: 'abc' })
    modules.druxtNodePreview.mutations.stop(state)
    expect(state).toEqual({ active: false, uuid: null })
  })

  test('fetch goes through the Druxt client with credentials', async () => {
    const doc = { data: { type: 'node--article', id: UUID } }
    const get = jest.fn().mockResolvedValue(axiosJsonApi(doc))
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })

    const result = await injected.value.fetch(ENDPOINT)

    expect(get).toHaveBeenCalledWith(
      `${ENDPOINT}?include=field_body`,
      expect.objectContaining({ withCredentials: true })
    )
    expect(result).toBe(doc)
  })

  test('fetch through the client refuses an origin that is not allowed', async () => {
    const get = jest.fn()
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await expect(
      injected.value.fetch('https://evil.example/doc.json')
    ).rejects.toThrow('not on this site')
    expect(get).not.toHaveBeenCalled()
  })

  // A site's request interceptors often decide by path, for example to add
  // a workspace header to its own API requests. An absolute URL on the
  // frontend's origin would slip past them.
  test('fetch hands a path endpoint to the Druxt client as a path', async () => {
    const get = jest
      .fn()
      .mockResolvedValue(
        axiosJsonApi({ data: { type: 'node--article', id: UUID } })
      )
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await injected.value.fetch(`/jsonapi/node/article/${UUID}/preview`)
    expect(get.mock.calls[0][0]).toBe(
      `/jsonapi/node/article/${UUID}/preview?include=field_body`
    )
  })

  test("fetch merges the configured include into the endpoint's include", async () => {
    const get = jest
      .fn()
      .mockResolvedValue(
        axiosJsonApi({ data: { type: 'node--article', id: UUID } })
      )
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    const path = `/jsonapi/node/article/${UUID}/preview`

    await injected.value.fetch(`${ENDPOINT}?include=field_content`)
    await injected.value.fetch(`${ENDPOINT}?include=field_body,field_content`)
    await injected.value.fetch(
      `${path}?resourceVersion=rel%3Alatest-version&include=field_content`
    )

    expect(get.mock.calls.map((call) => call[0])).toEqual([
      `${ENDPOINT}?include=field_content,field_body`,
      `${ENDPOINT}?include=field_body,field_content`,
      `${path}?resourceVersion=rel%3Alatest-version&include=field_content,field_body`,
    ])
  })

  test('fetch through the client refuses a response that is not JSON:API', async () => {
    const get = jest
      .fn()
      .mockResolvedValue(
        axiosJsonApi(
          { data: { type: 'node--article', id: UUID } },
          'text/plain'
        )
      )
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow(
      'not a JSON:API document'
    )
  })

  test('fetch through the client reports the status and body', async () => {
    const error = Object.assign(new Error('x'), {
      response: { status: 403, data: { errors: [{ title: 'denied' }] } },
    })
    const get = jest.fn().mockRejectedValue(error)
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow(/403.*denied/)
  })

  test('fetch without the Druxt client adds the include and credentials', async () => {
    const { injected } = buildPlugin()
    const doc = { data: { type: 'node--article', id: UUID } }
    window.fetch = jest.fn().mockResolvedValue(jsonApi(doc))

    const result = await injected.value.fetch(ENDPOINT)

    expect(window.fetch).toHaveBeenCalledWith(
      `${ENDPOINT}?include=field_body`,
      expect.objectContaining({ credentials: 'include' })
    )
    expect(result).toBe(doc)
  })

  test('fetch with a token sends it as a bearer token, without credentials', async () => {
    const doc = { data: { type: 'node--article', id: UUID } }
    window.location.hash = `#${ENDPOINT};token=cnpt.a.b`

    const get = jest.fn().mockResolvedValue(axiosJsonApi(doc))
    const client = buildPlugin({ $druxt: { axios: { get } } }).injected
    await client.value.fetch(ENDPOINT)
    expect(get).toHaveBeenCalledWith(
      `${ENDPOINT}?include=field_body`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer cnpt.a.b' }),
        withCredentials: false,
      })
    )

    // The first page took the token out of the address. A new page load gets
    // it again from Drupal.
    window.location.hash = `#${ENDPOINT};token=cnpt.a.b`
    window.fetch = jest.fn().mockResolvedValue(jsonApi(doc))
    await buildPlugin().injected.value.fetch(ENDPOINT)
    expect(window.fetch).toHaveBeenCalledWith(
      `${ENDPOINT}?include=field_body`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer cnpt.a.b' }),
        credentials: 'omit',
      })
    )

    window.location.hash = ''
  })

  test('a path with a token goes through the client as a path', async () => {
    const doc = { data: { type: 'node--article', id: UUID } }
    const path = `/jsonapi/node/article/${UUID}/preview`
    window.location.hash = `#${path};token=cnpt.a.b`

    const get = jest.fn().mockResolvedValue(axiosJsonApi(doc))
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    expect(injected.value.endpoint()).toBe(path)
    await injected.value.fetch(injected.value.endpoint())
    expect(get).toHaveBeenCalledWith(
      `${path}?include=field_body`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer cnpt.a.b' }),
        withCredentials: false,
      })
    )

    window.location.hash = ''
  })

  test('a backend endpoint goes without the Druxt client or its defaults', async () => {
    const doc = { data: { type: 'node--article', id: UUID } }
    const backend = `https://backend.example.com/jsonapi/node/article/${UUID}/preview`
    window.location.hash = `#${backend};token=cnpt.a.b`

    // The site's client could carry auth for druxt.baseUrl.
    const get = jest.fn().mockResolvedValue(axiosJsonApi(doc))
    window.fetch = jest.fn().mockResolvedValue(jsonApi(doc))
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await injected.value.fetch(injected.value.endpoint())

    expect(get).not.toHaveBeenCalled()
    expect(window.fetch).toHaveBeenCalledWith(`${backend}?include=field_body`, {
      credentials: 'omit',
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: 'Bearer cnpt.a.b',
      },
    })

    window.location.hash = ''
  })

  test('a listed origin goes without the Druxt client, with the session', async () => {
    const doc = { data: { type: 'node--article', id: UUID } }
    const other = `https://backend.example.com/jsonapi/node/article/${UUID}/preview`
    const get = jest.fn().mockResolvedValue(axiosJsonApi(doc))
    window.fetch = jest.fn().mockResolvedValue(jsonApi(doc))
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await injected.value.fetch(other)

    expect(get).not.toHaveBeenCalled()
    expect(window.fetch).toHaveBeenCalledWith(
      `${other}?include=field_body`,
      expect.objectContaining({ credentials: 'include' })
    )
  })

  test('the token leaves the address once the page has read it', () => {
    const { injected } = buildPlugin()
    window.history.replaceState(
      { key: 'kept' },
      '',
      `/druxt/node/preview?vm=full#${ENDPOINT};token=cnpt.a.b`
    )
    expect(injected.value.token()).toBe('cnpt.a.b')
    expect(window.location.hash).toBe(`#${ENDPOINT}`)
    expect(window.location.search).toBe('?vm=full')
    expect(window.history.state).toEqual({ key: 'kept' })
    // The page reads it again when it comes back, such as after keep-alive.
    expect(injected.value.token()).toBe('cnpt.a.b')
    expect(injected.value.endpoint()).toBe(ENDPOINT)

    // A new preview address brings its own token, or none.
    window.location.hash = `#/jsonapi/node/article/${UUID}/preview`
    expect(injected.value.token()).toBe(null)
    window.location.hash = ''
  })

  test('the address keeps its encoding when the token leaves it', () => {
    const { injected } = buildPlugin()
    const encoded = `${ENDPOINT}?include=a%2526b`
    window.location.hash = `#${encoded};token=cnpt.a.b`
    const before = injected.value.endpoint()
    expect(injected.value.token()).toBe('cnpt.a.b')
    expect(window.location.hash).toBe(`#${encoded}`)
    expect(injected.value.endpoint()).toBe(before)

    // An encoded token mark leaves an encoded address that reads the same.
    window.location.hash = '#' + encodeURIComponent(`${encoded};token=cnpt.c.d`)
    const encodedBefore = injected.value.endpoint()
    expect(injected.value.token()).toBe('cnpt.c.d')
    expect(window.location.hash).not.toContain('token')
    expect(injected.value.endpoint()).toBe(encodedBefore)
    window.location.hash = ''
  })

  test('endpoint repairs a scheme the router collapsed', () => {
    const { injected } = buildPlugin()
    window.location.hash =
      '#https:/example.com/jsonapi/node/article/abc/preview'
    expect(injected.value.endpoint()).toBe(
      'https://example.com/jsonapi/node/article/abc/preview'
    )
    window.location.hash =
      '#http:/localhost:8080/jsonapi/node/article/abc/preview'
    expect(injected.value.endpoint()).toBe(
      'http://localhost:8080/jsonapi/node/article/abc/preview'
    )
    window.location.hash = '#https://example.com/p'
    expect(injected.value.endpoint()).toBe('https://example.com/p')
    window.location.hash = ''
  })

  test('fetch refuses an endpoint on an origin that is not allowed', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn()
    await expect(
      injected.value.fetch('https://evil.example/doc.json')
    ).rejects.toThrow('not on this site')
    await expect(
      injected.value.fetch('//evil.example/doc.json')
    ).rejects.toThrow('not on this site')
    expect(window.fetch).not.toHaveBeenCalled()
  })

  test("fetch takes a path on the page's own origin", async () => {
    const { injected } = buildPlugin()
    window.fetch = jest
      .fn()
      .mockResolvedValue(jsonApi({ data: { type: 'node--article', id: UUID } }))
    await injected.value.fetch(`/jsonapi/node/article/${UUID}/preview`)
    expect(window.fetch).toHaveBeenCalled()
  })

  test('fetch without the Druxt client keeps a path endpoint relative', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest
      .fn()
      .mockResolvedValue(jsonApi({ data: { type: 'node--article', id: UUID } }))
    await injected.value.fetch(`/jsonapi/node/article/${UUID}/preview`)
    expect(window.fetch.mock.calls[0][0]).toBe(
      `/jsonapi/node/article/${UUID}/preview?include=field_body`
    )
  })

  test('fetch throws on a failed response', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 403, text: async () => 'denied' })
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow(/403.*denied/)
  })

  test('a failed response whose body cannot be read still reports the status', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.reject(new Error('aborted')),
    })
    const error = await injected.value.fetch(ENDPOINT).catch((e) => e)
    expect(error.message).toBe(
      `Preview request failed with HTTP 502 for ${ENDPOINT}?include=field_body`
    )
  })

  test('a failed response that is an HTML page leaves the page out', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        '\n <!DOCTYPE html>\n<html lang="en"><body>Denied</body></html>',
    })
    const error = await injected.value.fetch(ENDPOINT).catch((e) => e)
    expect(error.message).toBe(
      `Preview request failed with HTTP 401 for ${ENDPOINT}?include=field_body`
    )
  })

  test('the token leaves the address as soon as the plugin starts', () => {
    window.history.replaceState(
      null,
      '',
      `/druxt/node/preview#https://evil.invalid/jsonapi/node/article/${UUID}/preview;token=cnpt.a.b`
    )
    const { injected } = buildPlugin()
    // Before anything checks or fetches the endpoint.
    expect(window.location.hash).not.toContain('token')
    expect(injected.value.token()).toBe('cnpt.a.b')
    window.location.hash = ''
  })

  test('the token leaves the address again once the router is ready', () => {
    const address = `/druxt/node/preview#${ENDPOINT};token=cnpt.a.b`
    window.history.replaceState(null, '', address)
    let ready
    const { injected } = buildPlugin({
      router: {
        beforeEach: () => {},
        onReady: (callback) => (ready = callback),
      },
    })
    // Its first navigation writes the address it started with back.
    window.history.replaceState(null, '', address)
    ready()
    expect(window.location.hash).toBe(`#${ENDPOINT}`)
    expect(injected.value.token()).toBe('cnpt.a.b')
    window.location.hash = ''
  })

  test('a client error without a body adds nothing after the address', async () => {
    const error = Object.assign(new Error('x'), { response: { status: 500 } })
    const get = jest.fn().mockRejectedValue(error)
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    const failed = await injected.value.fetch(ENDPOINT).catch((e) => e)
    expect(failed.message).toBe(
      `Preview request failed with HTTP 500 for ${ENDPOINT}?include=field_body`
    )
  })

  test('a malformed fragment does not stop the plugin starting', () => {
    window.location.hash = '#section%'
    const { injected } = buildPlugin()
    expect(injected.name).toBe('druxtNodePreview')
    expect(injected.value.token()).toBe(null)
    // The page then says the fragment has no preview endpoint.
    expect(injected.value.endpoint()).toBe(null)
    window.location.hash = ''
  })

  test('an expired token in the address is not used, and leaves it', () => {
    const exp = Math.floor(Date.now() / 1000) - 60
    const expired = [
      'e30',
      Buffer.from(JSON.stringify({ exp })).toString('base64url'),
      's',
    ].join('.')
    // The plugin started on another page, and the router opens the preview.
    window.history.replaceState(null, '', '/')
    const { injected } = buildPlugin()
    window.history.replaceState(
      null,
      '',
      `/druxt/node/preview#${ENDPOINT};token=${expired}`
    )
    expect(injected.value.token()).toBe(null)
    expect(window.location.hash).toBe(`#${ENDPOINT}`)
    expect(window.sessionStorage.getItem('druxtNodePreview.token')).toBe(null)
    window.location.hash = ''
  })

  test('a kept token that is not two strings is not used', () => {
    for (const planted of ['"x"', '{"endpoint":1,"token":2}', 'null']) {
      window.sessionStorage.setItem('druxtNodePreview.token', planted)
      window.location.hash = `#${ENDPOINT}`
      expect(buildPlugin().injected.value.token()).toBe(null)
    }
    window.sessionStorage.setItem(
      'druxtNodePreview.token',
      JSON.stringify({ endpoint: ENDPOINT, token: 7 })
    )
    expect(buildPlugin().injected.value.token()).toBe(null)
    window.location.hash = ''
  })

  test('the token survives a reload of the page, out of the address', () => {
    window.sessionStorage.clear()
    window.history.replaceState(
      null,
      '',
      `/druxt/node/preview#${ENDPOINT};token=cnpt.a.b`
    )
    buildPlugin()
    expect(window.location.hash).toBe(`#${ENDPOINT}`)
    // A reload starts a new page, with the address the token left.
    const { injected } = buildPlugin()
    expect(injected.value.token()).toBe('cnpt.a.b')
    // Another preview address gets no token from it.
    window.location.hash = `#/jsonapi/node/article/${UUID}/preview`
    expect(injected.value.token()).toBe(null)
    window.location.hash = ''
    window.sessionStorage.clear()
  })

  test('a kept token that has expired is dropped', () => {
    const jwt = (exp) =>
      [
        'e30',
        Buffer.from(JSON.stringify({ exp })).toString('base64url'),
        's',
      ].join('.')
    const expired = jwt(Math.floor(Date.now() / 1000) - 60)
    window.history.replaceState(
      null,
      '',
      `/druxt/node/preview#${ENDPOINT};token=${expired}`
    )
    buildPlugin()
    // A reload of the page would send the expired token. The session reads it.
    const { injected } = buildPlugin()
    expect(injected.value.token()).toBe(null)
    expect(window.sessionStorage.getItem('druxtNodePreview.token')).toBe(null)

    // A token that has not expired, or that has no expiry, is kept.
    const live = jwt(Math.floor(Date.now() / 1000) + 600)
    window.location.hash = `#${ENDPOINT};token=${live}`
    buildPlugin()
    expect(buildPlugin().injected.value.token()).toBe(live)
    window.location.hash = ''
  })

  test('the kept token matches an address whose scheme the router collapsed', () => {
    window.history.replaceState(
      null,
      '',
      `/druxt/node/preview#${ENDPOINT};token=cnpt.a.b`
    )
    const { injected } = buildPlugin()
    window.location.hash = '#' + ENDPOINT.replace('https://', 'https:/')
    expect(injected.value.endpoint()).toBe(ENDPOINT)
    expect(injected.value.token()).toBe('cnpt.a.b')
    window.location.hash = ''
  })

  test('seed stores the resource and every include', () => {
    const { injected, commits } = buildPlugin()
    const doc = {
      data: { type: 'node--article', id: UUID },
      included: [
        { type: 'paragraph--text', id: P1 },
        { type: 'paragraph--text', id: P2 },
      ],
    }

    const entity = injected.value.seed(doc)

    expect(entity).toEqual({ type: 'node--article', id: UUID })
    expect(commits).toHaveLength(4)
    expect(commits[3]).toEqual({
      name: 'druxtNodePreview/start',
      payload: UUID,
    })
    expect(commits[0]).toEqual({
      name: 'druxt/addResource',
      payload: { resource: { data: doc.data } },
    })
    expect(commits[2].payload.resource.data.id).toBe(P2)
  })

  // Any link can set the fragment, and an allowed origin can serve other
  // JSON, such as a private file an attacker uploaded. Only a node preview
  // document may reach the store, where DruxtEntity renders it.
  test('fetch refuses an endpoint that is not a node preview', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn()
    await expect(
      injected.value.fetch('https://example.com/system/files/x.txt')
    ).rejects.toThrow('not a node preview')
    await expect(
      injected.value.fetch(`${ENDPOINT}/../../../../system/files/x.txt`)
    ).rejects.toThrow('not a node preview')
    await expect(
      injected.value.fetch(
        'https://example.com/jsonapi/node/article/abc/preview'
      )
    ).rejects.toThrow('not a node preview')
    expect(window.fetch).not.toHaveBeenCalled()
  })

  test('fetch refuses a response that is not JSON:API', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonApi({ data: { type: 'node--article', id: UUID } }, 'text/plain')
      )
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow(
      'not a JSON:API document'
    )
  })

  test('fetch refuses a document for another node', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest
      .fn()
      .mockResolvedValue(jsonApi({ data: { type: 'node--article', id: P1 } }))
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow(
      'not a preview of'
    )
  })

  test('seed refuses an unsafe document before it stores anything', () => {
    const { injected, commits } = buildPlugin()
    const withInclude = (included) => ({
      data: { type: 'node--article', id: UUID },
      included: [included],
    })
    for (const doc of [
      withInclude({ type: 'node--page', id: '__proto__' }),
      withInclude({ type: '__proto__', id: P1 }),
      withInclude({ type: 'constructor', id: P1 }),
      withInclude({ type: 'paragraph--text', id: 'p1' }),
      withInclude({ id: P1 }),
      { data: { type: 'node--article', id: '__proto__' } },
      { data: null },
      'not a document',
    ]) {
      expect(() => injected.value.seed(doc)).toThrow(
        'not a node preview document'
      )
    }
    expect(commits).toHaveLength(0)
  })

  // DruxtEntity reads a resource under its language: its langcode prop, else
  // the route's langcode meta. The preview's DruxtEntity has no langcode prop.
  test("seed stores under the route's language, where DruxtEntity reads", () => {
    const router = {
      beforeEach: () => {},
      currentRoute: { name: 'druxt-node-preview', meta: { langcode: 'es' } },
    }
    const { injected, commits } = buildPlugin({ router })
    injected.value.seed({ data: { type: 'node--article', id: UUID } })
    expect(commits[0].payload.prefix).toBe('es')
  })

  describe('leaving the preview route', () => {
    let guard
    let preview

    beforeEach(() => {
      const router = {
        currentRoute: { name: 'druxt-node-preview' },
        beforeEach: (fn) => {
          guard = fn
        },
      }
      preview = buildPlugin({ router })
      preview.injected.value.seed({
        data: { type: 'node--article', id: UUID },
        included: [{ type: 'paragraph--text', id: P1 }],
      })
      preview.commits.length = 0
    })

    // The preview seeded unsaved resources into the Druxt store. The next
    // page must fetch the saved ones, and must not see the preview flag.
    test('flushes what the preview seeded and clears the flag', () => {
      const next = jest.fn()
      guard({ name: 'docs' }, { name: 'druxt-node-preview' }, next)

      expect(preview.commits).toEqual([
        {
          name: 'druxt/flushResource',
          payload: { type: 'node--article', id: UUID },
        },
        {
          name: 'druxt/flushResource',
          payload: { type: 'paragraph--text', id: P1 },
        },
        { name: 'druxtNodePreview/stop', payload: undefined },
      ])
      expect(next).toHaveBeenCalledWith()
    })

    test('flushes only once', () => {
      guard({ name: 'docs' }, { name: 'druxt-node-preview' }, jest.fn())
      preview.commits.length = 0
      guard({ name: 'index' }, { name: 'druxt-node-preview' }, jest.fn())
      expect(preview.commits).toEqual([])
    })

    test('leaves other navigation alone', () => {
      const next = jest.fn()
      guard({ name: 'docs' }, { name: 'index' }, next)
      guard(
        { name: 'druxt-node-preview' },
        { name: 'druxt-node-preview' },
        next
      )
      expect(preview.commits).toEqual([])
      expect(next.mock.calls).toEqual([[], []])
    })
  })

  describe('a fetch that ends while the editor is leaving', () => {
    let guard
    let preview

    // vue-router runs this guard before the next route's code loads, and
    // changes currentRoute only after that. So a fetch that ends in between
    // still sees the preview route.
    beforeEach(() => {
      const router = {
        currentRoute: { name: 'druxt-node-preview' },
        beforeEach: (fn) => {
          guard = fn
        },
      }
      preview = buildPlugin({ router })
    })

    test('seeds nothing', () => {
      guard({ name: 'docs' }, { name: 'druxt-node-preview' }, jest.fn())
      expect(
        preview.injected.value.seed({
          data: { type: 'node--article', id: UUID },
        })
      ).toBeNull()
      expect(preview.commits).toEqual([])
    })

    test('does not stop the next preview from seeding', () => {
      guard({ name: 'docs' }, { name: 'druxt-node-preview' }, jest.fn())
      guard({ name: 'druxt-node-preview' }, { name: 'docs' }, jest.fn())
      expect(
        preview.injected.value.seed({
          data: { type: 'node--article', id: UUID },
        })
      ).toEqual({ type: 'node--article', id: UUID })
    })
  })

  test('a per type include goes only on that type', async () => {
    const uuid = '0f8e7d6c-5b4a-4c3d-9e2f-1a0b9c8d7e6f'
    const get = jest
      .fn()
      .mockResolvedValue(
        axiosJsonApi({ data: { type: 'node--page', id: uuid } })
      )
    const { injected } = buildPlugin(
      { $druxt: { axios: { get } } },
      { 'node--page': ['field_content.field_media'] }
    )
    await injected.value.fetch(
      '/jsonapi/node/page/' + uuid + '/preview?include=field_content'
    )
    await injected.value.fetch(
      '/jsonapi/node/article/' + uuid + '/preview?include=field_body'
    )
    expect(get.mock.calls[0][0]).toBe(
      '/jsonapi/node/page/' +
        uuid +
        '/preview?include=field_content,field_content.field_media'
    )
    expect(get.mock.calls[1][0]).toBe(
      '/jsonapi/node/article/' + uuid + '/preview?include=field_body'
    )
  })

  test('a preview that resolves after leaving seeds nothing', () => {
    const { injected, commits } = buildPlugin({
      router: { currentRoute: { name: 'docs' }, beforeEach: () => {} },
    })
    expect(
      injected.value.seed({ data: { type: 'node--page', id: UUID } })
    ).toBe(null)
    expect(commits).toHaveLength(0)
  })

  // nuxt-i18n adds a language suffix to route names.
  describe('a preview route with a language suffix', () => {
    test('seeds', () => {
      const router = {
        currentRoute: { name: 'druxt-node-preview___en' },
        beforeEach: () => {},
      }
      const { injected } = buildPlugin({ router })
      expect(
        injected.value.seed({ data: { type: 'node--article', id: UUID } })
      ).toEqual({ type: 'node--article', id: UUID })
    })

    test('flushes when the editor leaves it', () => {
      let guard
      const router = {
        currentRoute: { name: 'druxt-node-preview___en' },
        beforeEach: (fn) => {
          guard = fn
        },
      }
      const { injected, commits } = buildPlugin({ router })
      injected.value.seed({ data: { type: 'node--article', id: UUID } })
      commits.length = 0
      guard(
        { name: 'docs___en' },
        { name: 'druxt-node-preview___en' },
        jest.fn()
      )
      expect(commits.map((commit) => commit.name)).toEqual([
        'druxt/flushResource',
        'druxtNodePreview/stop',
      ])
    })
  })
})
