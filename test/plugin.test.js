const fs = require('fs')
const path = require('path')

// The template placeholder is replaced by Nuxt at build time. Replace it the
// same way here, so the plugin source stays testable as-is. The only module
// syntax in the plugin is its default export.
const loadPlugin = () => {
  const source = fs
    .readFileSync(path.resolve(__dirname, '../templates/plugin.js'), 'utf8')
    .replace("'<%= JSON.stringify(options.include) %>'", '\'["field_body"]\'')
    .replace('export default', 'module.exports.default =')
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', source)(mod, mod.exports, require)
  return mod.exports
}

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

  test('endpoint repairs a scheme collapsed by the router', () => {
    const { injected } = buildPlugin()
    window.location.hash = '#http:/example.com/jsonapi/node/a/b/preview'
    expect(injected.value.endpoint()).toBe('http://example.com/jsonapi/node/a/b/preview')
    window.location.hash = '#https://example.com/ok'
    expect(injected.value.endpoint()).toBe('https://example.com/ok')
    window.location.hash = ''
  })

  test('fetch adds the include and credentials', async () => {
    const { injected } = buildPlugin()
    const doc = { data: { type: 'node--article', id: 'abc' } }
    window.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => doc })

    const result = await injected.value.fetch('https://example.com/preview')

    expect(window.fetch).toHaveBeenCalledWith(
      'https://example.com/preview?include=field_body',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(result).toBe(doc)
  })

  test('fetch throws on a failed response', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'denied' })
    await expect(injected.value.fetch('https://example.com/preview')).rejects.toThrow('403')
  })

  test('seed stores the resource and every include', () => {
    const { injected, commits } = buildPlugin()
    const doc = {
      data: { type: 'node--article', id: 'abc' },
      included: [
        { type: 'paragraph--text', id: 'p1' },
        { type: 'paragraph--text', id: 'p2' },
      ],
    }

    const entity = injected.value.seed(doc)

    expect(entity).toEqual({ type: 'node--article', id: 'abc' })
    expect(commits).toHaveLength(3)
    expect(commits[0]).toEqual({ name: 'druxt/addResource', payload: { resource: { data: doc.data } } })
    expect(commits[2].payload.resource.data.id).toBe('p2')
  })
})
