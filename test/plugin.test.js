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

  test('endpoint repairs a scheme collapsed by the router', () => {
    const { injected } = buildPlugin()
    window.location.hash = '#http:/example.com/jsonapi/node/a/b/preview'
    expect(injected.value.endpoint()).toBe('http://example.com/jsonapi/node/a/b/preview')
    window.location.hash = '#https://example.com/ok'
    expect(injected.value.endpoint()).toBe('https://example.com/ok')
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
    const doc = { data: { type: 'node--article', id: 'abc' } }
    const get = jest.fn().mockResolvedValue({ data: doc })
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })

    const result = await injected.value.fetch('https://example.com/jsonapi/node/article/abc/preview')

    expect(get).toHaveBeenCalledWith(
      'https://example.com/jsonapi/node/article/abc/preview?include=field_body',
      expect.objectContaining({ withCredentials: true }),
    )
    expect(result).toBe(doc)
  })

  // A site's request interceptors often decide by path, for example to add
  // a workspace header to its own API requests. An absolute URL on the
  // frontend's origin would slip past them.
  test('fetch hands a path endpoint to the Druxt client as a path', async () => {
    const get = jest.fn().mockResolvedValue({ data: {} })
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await injected.value.fetch('/jsonapi/node/article/abc/preview')
    expect(get.mock.calls[0][0]).toBe('/jsonapi/node/article/abc/preview?include=field_body')
  })

  test('fetch merges the configured include into the endpoint\'s include', async () => {
    const get = jest.fn().mockResolvedValue({ data: {} })
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })

    await injected.value.fetch('https://example.com/preview?include=field_content')
    await injected.value.fetch('https://example.com/preview?include=field_body,field_content')
    await injected.value.fetch('/preview?resourceVersion=rel%3Alatest-version&include=field_content')

    expect(get.mock.calls.map((call) => call[0])).toEqual([
      'https://example.com/preview?include=field_content,field_body',
      'https://example.com/preview?include=field_body,field_content',
      '/preview?resourceVersion=rel%3Alatest-version&include=field_content,field_body',
    ])
  })

  test('fetch through the client reports the status and body', async () => {
    const error = Object.assign(new Error('x'), { response: { status: 403, data: { errors: [{ title: 'denied' }] } } })
    const get = jest.fn().mockRejectedValue(error)
    const { injected } = buildPlugin({ $druxt: { axios: { get } } })
    await expect(injected.value.fetch('https://example.com/preview')).rejects.toThrow(/403.*denied/)
  })

  test('fetch without the Druxt client adds the include and credentials', async () => {
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

  test('fetch without the Druxt client keeps a path endpoint relative', async () => {
    const { injected } = buildPlugin()
    window.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    await injected.value.fetch('/jsonapi/node/article/abc/preview')
    expect(window.fetch.mock.calls[0][0]).toBe('/jsonapi/node/article/abc/preview?include=field_body')
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
    expect(commits).toHaveLength(4)
    expect(commits[3]).toEqual({ name: 'druxtNodePreview/start', payload: 'abc' })
    expect(commits[0]).toEqual({ name: 'druxt/addResource', payload: { resource: { data: doc.data } } })
    expect(commits[2].payload.resource.data.id).toBe('p2')
  })


  describe('leaving the preview route', () => {
    let guard
    let preview

    beforeEach(() => {
      const router = { beforeEach: (fn) => { guard = fn } }
      preview = buildPlugin({ router })
      preview.injected.value.seed({
        data: { type: 'node--article', id: 'abc' },
        included: [{ type: 'paragraph--text', id: 'p1' }],
      })
      preview.commits.length = 0
    })

    // The preview seeded unsaved resources into the Druxt store. The next
    // page must fetch the saved ones, and must not see the preview flag.
    test('flushes what the preview seeded and clears the flag', () => {
      const next = jest.fn()
      guard({ name: 'docs' }, { name: 'druxt-node-preview' }, next)

      expect(preview.commits).toEqual([
        { name: 'druxt/flushResource', payload: { type: 'node--article', id: 'abc' } },
        { name: 'druxt/flushResource', payload: { type: 'paragraph--text', id: 'p1' } },
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
      guard({ name: 'druxt-node-preview' }, { name: 'druxt-node-preview' }, next)
      expect(preview.commits).toEqual([])
      expect(next.mock.calls).toEqual([[], []])
    })
  })
})
