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

/** A JSON:API response, as window.fetch resolves it. */
const jsonApi = (doc, type = 'application/vnd.api+json') => ({
  ok: true,
  headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
  json: async () => doc,
})

const buildPlugin = () => {
  const commits = []
  const store = { commit: (name, payload) => commits.push({ name, payload }) }
  let injected
  loadPlugin().default({ store }, (name, value) => { injected = { name, value } })
  return { commits, injected }
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

  test('fetch adds the include and credentials', async () => {
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
    window.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 })
    await expect(injected.value.fetch(ENDPOINT)).rejects.toThrow('403')
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
    expect(commits).toHaveLength(3)
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
