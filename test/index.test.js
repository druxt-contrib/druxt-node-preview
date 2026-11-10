import NuxtModule from '../src/index.js'
import { DruxtClient } from 'druxt'
import { routeDruxtClient } from './helpers/druxt-client.js'

jest.mock('druxt', () => ({
  ...jest.requireActual('druxt'),
  DruxtClient: jest.fn(),
}))

// Answers each request the module sends through its DruxtClient.
const request = jest.fn()

const buildContext = (druxtOptions = {}) => {
  const context = {
    addedTemplates: [],
    addedPlugins: [],
    routes: [],
    hooks: {},
    options: {
      buildDir: '/tmp/build',
      druxt: druxtOptions,
      store: false,
    },
  }
  context.addTemplate = (template) => {
    context.addedTemplates.push(template)
    return { dst: template.fileName }
  }
  context.addPlugin = (plugin) => context.addedPlugins.push(plugin)
  context.nuxt = {
    hook: (name, fn) => {
      context.hooks[name] = fn
    },
  }
  context.extendRoutes = (fn) =>
    fn(context.routes, (...parts) => parts.join('/'))
  return context
}

describe('DruxtNodePreview module', () => {
  test('registers the route, template and plugin', () => {
    const context = buildContext()
    NuxtModule.call(context)

    expect(context.options.store).toBe(true)
    expect(context.addedTemplates.map((t) => t.fileName)).toEqual([
      'components/druxt-node-preview.vue',
      'components/druxt-node-preview-page.vue',
    ])
    expect(context.addedPlugins).toHaveLength(1)
    expect(context.routes).toHaveLength(1)
    expect(context.routes[0].path).toBe('/druxt/node/preview')
    expect(context.routes[0].name).toBe('druxt-node-preview')
    expect(context.addedPlugins[0].options.include).toEqual([])
    expect(context.addedPlugins[0].options.origins).toEqual([])
    expect(context.addedPlugins[0].options.drupal).toBe(null)
    expect(context.addedPlugins[0].options.layouts).toEqual([])
  })

  test('the preview route goes before a site catch-all', () => {
    const context = buildContext()
    context.routes.push({ name: 'all', path: '/*' })
    NuxtModule.call(context)
    expect(context.routes[0].name).toBe('druxt-node-preview')
  })

  test('the plugin gets only plain include paths and http(s) origins', () => {
    const context = buildContext({
      baseUrl: 'https://drupal.example.com/',
      nodePreview: {
        include: ['field_media', "x'); alert(1); ('", 7],
        origins: [
          'https://cms.example.com/path',
          'javascript:alert(1)',
          'not a url',
        ],
      },
    })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.include).toEqual(['field_media'])
    expect(context.addedPlugins[0].options.origins).toEqual([
      'https://drupal.example.com',
      'https://cms.example.com',
    ])
  })

  test('module options override the defaults', () => {
    const context = buildContext()
    NuxtModule.call(context, {
      path: '/preview',
      include: ['field_body'],
      layouts: ['bare', 'not a name'],
    })

    expect(context.routes[0].path).toBe('/preview')
    expect(context.addedPlugins[0].options.include).toEqual(['field_body'])
    expect(context.addedPlugins[0].options.layouts).toEqual(['bare'])
  })

  test('nuxt.config druxt.nodePreview options are used', () => {
    const context = buildContext({
      nodePreview: {
        path: '/p',
        include: ['field_a'],
        layouts: ['default', 'preview'],
      },
    })
    NuxtModule.call(context)

    expect(context.routes[0].path).toBe('/p')
    expect(context.addedPlugins[0].options.include).toEqual(['field_a'])
    expect(context.addedPlugins[0].options.layouts).toEqual([
      'default',
      'preview',
    ])
  })

  // druxt-site sets druxt.baseUrl from its own module options, and Nuxt may
  // run it after this module.
  test('origins take a baseUrl set after this module', () => {
    const context = buildContext()
    NuxtModule.call(context)
    context.options.druxt = { baseUrl: 'https://late.example.com/' }
    context.hooks['modules:done']()
    expect(context.addedPlugins[0].options.origins).toEqual([
      'https://late.example.com',
    ])
    expect(context.addedPlugins[0].options.drupal).toBe(
      'https://late.example.com'
    )
  })

  test('an origin whose host has other characters is refused', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({
      baseUrl: "https://x'+alert(1)+'.example",
      nodePreview: {
        origins: [
          "https://y'+alert(2)+'.example",
          'https://cms.example.com:8443',
          'http://[::1]:3000',
          'http://drupal_web:8080',
          'https://fqdn.example.com.',
        ],
      },
    })
    NuxtModule.call(context)
    const { options } = context.addedPlugins[0]
    expect(options.origins).toEqual([
      'https://cms.example.com:8443',
      'http://[::1]:3000',
      'http://drupal_web:8080',
      'https://fqdn.example.com.',
    ])
    expect(options.drupal).toBe(null)
    // The warning names the host, not the URL's shape, which is fine.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Ignored the origin "https://y'+alert(2)+'.example". Its host, "y'+alert(2)+'.example", may only have`
      )
    )
    // A druxt.baseUrl the page can't use is reported too.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('druxt.baseUrl'))
    warn.mockRestore()
  })

  test('an unusable druxt.baseUrl is reported once', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({ baseUrl: "https://x'+y.example" })
    NuxtModule.call(context)
    // Nuxt runs modules:done after every module, and the origins are read again.
    context.hooks['modules:done']()
    const reported = warn.mock.calls.filter(([message]) =>
      message.includes('Ignored druxt.baseUrl')
    )
    expect(reported).toHaveLength(1)
    warn.mockRestore()
  })

  test('a warning never prints the user name or password in a URL', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({
      baseUrl: "https://admin:hunter2@x'+y.example/path",
      // A URL the parser refuses still loses its user name and password.
      nodePreview: {
        origins: [
          "https://bob:password@y'+z.example",
          'https://eve:pa55@host:8_0',
          // A password can hold an "@" of its own.
          'https://mal:p@ssw0rd@host:9_0',
        ],
      },
    })
    NuxtModule.call(context)
    const logged = warn.mock.calls.map(([message]) => message).join('\n')
    expect(logged).toContain("x'+y.example")
    expect(logged).toContain("y'+z.example")
    expect(logged).toContain('host:8_0')
    for (const secret of [
      'admin',
      'hunter2',
      'bob',
      'password',
      'eve',
      'pa55',
      'mal',
      'ssw0rd',
    ]) {
      expect(logged).not.toContain(secret)
    }
    warn.mockRestore()
  })

  test('an origin that is not an http(s) URL is reported, not dropped quietly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({
      nodePreview: { origins: ['https://cms.example.com', 'cms.example.com'] },
    })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.origins).toEqual([
      'https://cms.example.com',
    ])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"cms.example.com"')
    )
    warn.mockRestore()
  })

  test('an origins option that is not a list is reported, not dropped quietly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({
      nodePreview: { origins: 'https://cms.example.com' },
    })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.origins).toEqual([])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignored the origins option')
    )
    warn.mockRestore()
  })

  test('an include value that is not plain is reported, not dropped quietly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({
      nodePreview: {
        include: {
          'node--page': ['field_media', 'bad path'],
          page: ['field_x'],
        },
      },
    })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.include).toEqual({
      'node--page': ['field_media'],
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"bad path"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"page"'))
    warn.mockRestore()
  })

  test('an include option that is not a list is reported, not dropped quietly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({
      nodePreview: { include: { 'node--page': 'field_media' } },
    })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.include).toEqual({
      'node--page': [],
    })
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ignored the include option for node--page')
    )
    warn.mockRestore()
  })

  test('a layout name that is not plain is reported, not dropped quietly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({
      nodePreview: { layouts: ['preview', 'docs/bare', 7] },
    })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.layouts).toEqual(['preview'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"docs/bare"'))
    warn.mockRestore()
  })

  describe('preview target registration', () => {
    const KEY = Symbol.for('druxt-node-preview.register')
    const ENV = [
      'DRUXT_NODE_PREVIEW_CLIENT_SECRET',
      'DRUXT_NODE_PREVIEW_CLIENT_ID',
      'DRUXT_NODE_PREVIEW_URL',
    ]
    let saved
    let info
    beforeEach(() => {
      saved = Object.fromEntries(ENV.map((name) => [name, process.env[name]]))
      for (const name of ENV) delete process.env[name]
      delete process[KEY]
      request.mockReset()
      DruxtClient.mockReset()
      routeDruxtClient(DruxtClient, request)
      info = jest.spyOn(console, 'info').mockImplementation(() => {})
    })
    afterEach(() => {
      for (const name of ENV) {
        if (saved[name] === undefined) delete process.env[name]
        else process.env[name] = saved[name]
      }
      delete process[KEY]
      info.mockRestore()
    })

    test('is off by default', () => {
      process.env.DRUXT_NODE_PREVIEW_CLIENT_SECRET = 'secret'
      process.env.DRUXT_NODE_PREVIEW_CLIENT_ID = 'frontend'
      process.env.DRUXT_NODE_PREVIEW_URL = 'https://www.example.com'
      const context = buildContext({ baseUrl: 'https://cms.example.com' })
      NuxtModule.call(context)
      expect(context.hooks.ready).toBeUndefined()
      expect(request).not.toHaveBeenCalled()
    })

    test('registers on ready, with the baseUrl, path and layouts known then', async () => {
      process.env.DRUXT_NODE_PREVIEW_CLIENT_SECRET = 'secret'
      const context = buildContext({
        nodePreview: {
          path: '/preview',
          layouts: ['default', 'preview'],
          register: {
            url: 'https://www.example.com',
            consumer: 'frontend',
            label: 'Production',
          },
        },
      })
      NuxtModule.call(context)
      expect(request).not.toHaveBeenCalled()

      // druxt-site sets the baseUrl after this module runs.
      context.options.druxt.baseUrl = 'https://cms.example.com'
      request
        .mockResolvedValueOnce({
          status: 200,
          text: JSON.stringify({ access_token: 't' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          text: JSON.stringify({ targets: [], layouts: [] }),
        })
      await context.hooks.ready()

      expect(request.mock.calls.map(([method, url]) => [method, url])).toEqual([
        ['POST', 'https://cms.example.com/oauth/token'],
        ['PATCH', 'https://cms.example.com/api/consumer-node-preview/targets'],
      ])
      expect(JSON.parse(request.mock.calls[1][2].body)).toEqual({
        target: {
          label: 'Production',
          url: 'https://www.example.com/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]',
        },
        layouts: ['default', 'preview'],
      })
    })

    test("registers with Nuxt's axios options, on the interval set", async () => {
      process.env.DRUXT_NODE_PREVIEW_CLIENT_SECRET = 'secret'
      jest.useFakeTimers()
      const every = jest.spyOn(global, 'setInterval')
      try {
        const context = buildContext({
          baseUrl: 'https://cms.example.com',
          nodePreview: {
            register: {
              url: 'https://www.example.com',
              consumer: 'frontend',
              interval: 600000,
            },
          },
        })
        context.options.axios = { timeout: 60000 }
        NuxtModule.call(context)
        request
          .mockResolvedValueOnce({
            status: 200,
            text: JSON.stringify({ access_token: 't' }),
          })
          .mockResolvedValueOnce({
            status: 200,
            text: JSON.stringify({ targets: [], layouts: [] }),
          })
        await context.hooks.ready()
        expect(every.mock.calls[0][1]).toBe(600000)
        expect(DruxtClient.mock.results[0].value.axios.defaults.timeout).toBe(
          60000
        )
      } finally {
        every.mockRestore()
        jest.clearAllTimers()
        jest.useRealTimers()
      }
    })

    test('registers once per process, even when Nuxt runs the module again', async () => {
      process.env.DRUXT_NODE_PREVIEW_CLIENT_SECRET = 'secret'
      process.env.DRUXT_NODE_PREVIEW_CLIENT_ID = 'frontend'
      process.env.DRUXT_NODE_PREVIEW_URL = 'https://www.example.com'
      request
        .mockResolvedValueOnce({
          status: 200,
          text: JSON.stringify({ access_token: 't' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          text: JSON.stringify({ targets: [] }),
        })
      for (let run = 0; run < 2; run++) {
        const context = buildContext({
          baseUrl: 'https://cms.example.com',
          nodePreview: { register: true },
        })
        NuxtModule.call(context)
        await context.hooks.ready()
      }
      expect(request).toHaveBeenCalledTimes(2)
    })

    test('a registration that fails does not fail the hook', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      process.env.DRUXT_NODE_PREVIEW_CLIENT_SECRET = 'secret'
      const context = buildContext({
        baseUrl: 'https://cms.example.com',
        nodePreview: {
          register: { url: 'https://www.example.com', consumer: 'frontend' },
        },
      })
      NuxtModule.call(context)
      request.mockRejectedValueOnce(
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
      )
      await expect(context.hooks.ready()).resolves.toBe('failed')
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not register the preview target')
      )
      warn.mockRestore()
    })

    test('a backend is an allowed origin even when the build has no secret', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const context = buildContext({
        baseUrl: 'https://cms.example.com',
        nodePreview: {
          register: {
            url: 'https://www.example.com',
            consumer: 'frontend',
            backend: 'https://other.example.com/',
          },
        },
      })
      NuxtModule.call(context)
      // Registration waits for the secret at start, but the page is built now.
      expect(context.hooks.ready).toBeUndefined()
      const { options } = context.addedPlugins[0]
      expect(options.origins).toEqual([
        'https://cms.example.com',
        'https://other.example.com',
      ])
      expect(options.drupal).toBe('https://cms.example.com')
      warn.mockRestore()
    })

    test('nuxt start sends an expiry and cleans up, and a build does neither', async () => {
      const CLEANUP = Symbol.for('druxt-node-preview.cleanup')
      const TIMER = Symbol.for('druxt-node-preview.register.timer')
      const signals = ['SIGINT', 'SIGTERM']
      const before = Object.fromEntries(
        signals.map((name) => [name, process.listeners(name)])
      )
      process.env.DRUXT_NODE_PREVIEW_CLIENT_SECRET = 'secret'
      const ok = (data) => ({ status: 200, text: JSON.stringify(data) })
      let last
      const context = () => last
      const run = async (nuxtOptions) => {
        delete process[KEY]
        delete process[CLEANUP]
        delete process[Symbol.for('druxt-node-preview.removing')]
        delete process[Symbol.for('druxt-node-preview.removing.attempt')]
        request.mockReset()
        request
          .mockResolvedValueOnce(ok({ access_token: 't' }))
          .mockResolvedValueOnce(ok({ targets: [] }))
        const context = buildContext({
          baseUrl: 'https://cms.example.com',
          nodePreview: {
            register: { url: 'https://www.example.com', consumer: 'frontend' },
          },
        })
        Object.assign(context.options, nuxtOptions)
        last = context
        NuxtModule.call(context)
        await context.hooks.ready()
        clearInterval(process[TIMER])
        return JSON.parse(request.mock.calls[1][2].body).target
      }
      try {
        // Twice the 6 hour interval, in seconds, for nuxt dev and nuxt start.
        expect((await run({ dev: true, _build: true })).expires_in).toBe(43200)
        for (const name of signals)
          process.removeListener(name, process[CLEANUP])
        expect((await run({ _start: true })).expires_in).toBe(43200)
        expect(process[CLEANUP]).toEqual(expect.any(Function))
        expect(process.listeners('SIGTERM')).toContain(process[CLEANUP])

        // A SIGTERM removes the target, then sends the signal on.
        const kill = jest.spyOn(process, 'kill').mockImplementation(() => true)
        request.mockReset()
        request
          .mockResolvedValueOnce(ok({ access_token: 't' }))
          .mockResolvedValueOnce(ok({ targets: [] }))
        for (const name of signals) process.removeAllListeners(name)
        process.on('SIGTERM', process[CLEANUP])
        await process[CLEANUP]('SIGTERM')
        expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM')
        kill.mockRestore()
        expect(request.mock.calls[1].slice(0, 2)).toEqual([
          'DELETE',
          'https://cms.example.com/api/consumer-node-preview/targets',
        ])
        expect(JSON.parse(request.mock.calls[1][2].body)).toEqual({
          target: { label: 'www.example.com' },
        })

        // A custom server awaits nuxt.close() before it exits, and that
        // removes the target too.
        await run({ _start: true })
        request.mockReset()
        request
          .mockResolvedValueOnce(ok({ access_token: 't' }))
          .mockResolvedValueOnce(ok({ targets: [] }))
        await context().hooks.close()
        expect(request.mock.calls[1].slice(0, 2)).toEqual([
          'DELETE',
          'https://cms.example.com/api/consumer-node-preview/targets',
        ])
        for (const name of signals)
          process.removeListener(name, process[CLEANUP])

        expect(await run({ _build: true })).not.toHaveProperty('expires_in')
        expect(process[CLEANUP]).toBeUndefined()
        expect(context().hooks.close).toBeUndefined()
      } finally {
        for (const name of signals) {
          process.removeAllListeners(name)
          for (const listener of before[name]) process.on(name, listener)
        }
        delete process[CLEANUP]
      }
    })

    test('an unusable register option warns and adds no hook', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const context = buildContext({
        nodePreview: {
          register: { url: 'https://www.example.com', consumer: 'frontend' },
        },
      })
      NuxtModule.call(context)
      expect(context.hooks.ready).toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('DRUXT_NODE_PREVIEW_CLIENT_SECRET')
      )
      warn.mockRestore()
    })
  })
})
