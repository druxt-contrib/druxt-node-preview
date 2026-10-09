const fs = require('fs')
const path = require('path')

// The template placeholder is replaced by Nuxt at build time. Replace it the
// same way here, so the plugin source stays testable as-is. The only module
// syntax in the plugin is its default export.
const loadPlugin = () => {
  const source = fs
    .readFileSync(path.resolve(__dirname, '../templates/plugin.js'), 'utf8')
    .replace("'<%= JSON.stringify(options.include) %>'", '\'["field_body"]\'')
    .replace("'<%= JSON.stringify(options.origins) %>'", '\'["https://example.com"]\'')
    .replace('export default', 'module.exports.default =')
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', source)(mod, mod.exports, require)
  return mod.exports
}

// Drupal gives every JSON:API resource a UUID, and Consumer Node Preview
// points at /{entity type}/{bundle}/{uuid}/preview.
const UUID = '8a0b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const P1 = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'
const P2 = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f'
const ENDPOINT = `https://example.com/jsonapi/node/article/${UUID}/preview`

/** A JSON:API response, as the Druxt client resolves it. */
const axiosJsonApi = (doc, type = 'application/vnd.api+json') => ({ data: doc, headers: { 'content-type': type } })

/** A JSON:API response, as window.fetch resolves it. */
const jsonApi = (doc, type = 'application/vnd.api+json') => ({
  ok: true,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
  json: async () => doc,
})

const buildPlugin = (app = {}) => {
  const commits = []
  const modules = {}
  const store = {
    state: {},
    commit: (name, payload) => commits.push({ name, payload }),
    hasModule: (name) => !!modules[name],
    registerModule: (name, module) => { modules[name] = module },
  }
  let injected
  loadPlugin().default({ app, store }, (name, value) => { injected = { name, value } })
  return { commits, injected, modules }
}

describe('$druxtNodePreview plugin', () => {
  test('injects the plugin', () => {
    const { injected } = buildPlugin()
    expect(injected.name).toBe('druxtNodePreview')
    expect(typeof injected.value.fetch).toBe('function')
  })

  test('endpoint comes from the fragment', () => {
    const { injected } = buildPlugin()
    window.location.hash = '#https%3A%2F%2Fexample.com%2Fjsonapi%2Fnode%2Farticle%2Fabc%2Fpreview'
    expect(injected.value.endpoint()).toBe('https://example.com/jsonapi/node/article/abc/preview')
    window.location.hash = ''
    expect(injected.value.endpoint()).toBe(null)
  })

  test('registers the preview store module', () => {
    const { modules } = buildPlugin()
    const state = modules.druxtNodePreview.state()
    expect(state).toEqual({ active: false, uuid: null })
    modules.druxtNodePreview.mutations.start(state, 'abc')
    expect(state).toEqual({ active: true, uuid: 'abc' })
  })

  test('fetch goes through the Druxt client with credentials', async () => {
    const doc = { data: { type: 'node--article', id: UUID } }
    const get = jest.fn().mockResolvedValue(axiosJsonApi(doc))
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })

    const result = await injected.value.fetch(`/jsonapi/node/article/${UUID}/preview`)

    expect(get).toHaveBeenCalledWith(
      window.location.origin + `/jsonapi/node/article/${UUID}/preview?include=field_body`,
      expect.objectContaining({ withCredentials: true }),
    )
    expect(result).toBe(doc)
  })

  test('fetch through the client refuses an origin that is not allowed', async () => {
    const get = jest.fn()
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await expect(injected.value.fetch('https://evil.example/doc.json')).rejects.toThrow('not on this site')
    expect(get).not.toHaveBeenCalled()
  })

  test('fetch keeps an include the endpoint already has', async () => {
    const get = jest.fn().mockResolvedValue(axiosJsonApi({ data: { type: 'node--article', id: UUID } }))
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await injected.value.fetch(`${ENDPOINT}?include=field_content`)
    expect(get.mock.calls[0][0]).toBe(`${ENDPOINT}?include=field_content`)
  })

  test('fetch through the client refuses a response that is not JSON:API', async () => {
    const get = jest.fn().mockResolvedValue(axiosJsonApi({ data: { type: 'node--article', id: UUID } }, 'text/plain'))
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow('not a JSON:API document')
  })

  test('fetch through the client reports the status and body', async () => {
    const error = Object.assign(new Error('x'), { response: { status: 403, data: { errors: [{ title: 'denied' }] } } })
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
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(result).toBe(doc)
  })

  test('endpoint repairs a scheme the router collapsed', () => {
    const { injected } = buildPlugin()
    window.location.hash = '#https:/example.com/jsonapi/node/article/abc/preview'
    expect(injected.value.endpoint()).toBe('https://example.com/jsonapi/node/article/abc/preview')
    window.location.hash = '#http:/localhost:8080/jsonapi/node/article/abc/preview'
    expect(injected.value.endpoint()).toBe('http://localhost:8080/jsonapi/node/article/abc/preview')
    window.location.hash = '#https://example.com/p'
    expect(injected.value.endpoint()).toBe('https://example.com/p')
    window.location.hash = ''
  })

  test('fetch refuses an endpoint on an origin that is not allowed', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn()
    await expect(injected.value.fetch('https://evil.example/doc.json')).rejects.toThrow('not on this site')
    await expect(injected.value.fetch('//evil.example/doc.json')).rejects.toThrow('not on this site')
    expect(window.fetch).not.toHaveBeenCalled()
  })

  test('fetch takes a path on the page\'s own origin', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn().mockResolvedValue(jsonApi({ data: { type: 'node--article', id: UUID } }))
    await injected.value.fetch(`/jsonapi/node/article/${UUID}/preview`)
    expect(window.fetch).toHaveBeenCalled()
  })

  test('fetch throws on a failed response', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'denied' })
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow(/403.*denied/)
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
    expect(commits[3]).toEqual({ name: 'druxtNodePreview/start', payload: UUID })
    expect(commits[0]).toEqual({ name: 'druxt/addResource', payload: { resource: { data: doc.data } } })
    expect(commits[2].payload.resource.data.id).toBe(P2)
  })

  // Any link can set the fragment, and an allowed origin can serve other
  // JSON, such as a private file an attacker uploaded. Only a node preview
  // document may reach the store, where DruxtEntity renders it.
  test('fetch refuses an endpoint that is not a node preview', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn()
    await expect(injected.value.fetch('https://example.com/system/files/x.txt')).rejects.toThrow('not a node preview')
    await expect(injected.value.fetch(`${ENDPOINT}/../../../../system/files/x.txt`)).rejects.toThrow('not a node preview')
    await expect(injected.value.fetch('https://example.com/jsonapi/node/article/abc/preview')).rejects.toThrow('not a node preview')
    expect(window.fetch).not.toHaveBeenCalled()
  })

  test('fetch refuses a response that is not JSON:API', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn().mockResolvedValue(jsonApi({ data: { type: 'node--article', id: UUID } }, 'text/plain'))
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow('not a JSON:API document')
  })

  test('fetch refuses a document for another node', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn().mockResolvedValue(jsonApi({ data: { type: 'node--article', id: P1 } }))
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow('not a preview of')
  })

  test('seed refuses an unsafe document before it stores anything', () => {
    const { injected, commits } = buildPlugin()
    const withInclude = (included) => ({ data: { type: 'node--article', id: UUID }, included: [included] })
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
      expect(() => injected.value.seed(doc)).toThrow('not a node preview document')
    }
    expect(commits).toHaveLength(0)
  })
})
