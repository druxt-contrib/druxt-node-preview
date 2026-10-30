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
        .mockResolvedValueOnce({
          status: 200,
          text: JSON.stringify({ targets: [], layouts: [] }),
        })
      await context.hooks.ready()

      expect(request.mock.calls.map(([method, url]) => [method, url])).toEqual([
        ['POST', 'https://cms.example.com/oauth/token'],
        ['GET', 'https://cms.example.com/api/consumer-node-preview/targets'],
        ['PUT', 'https://cms.example.com/api/consumer-node-preview/targets'],
      ])
      expect(JSON.parse(request.mock.calls[2][2].body)).toEqual({
        targets: [
          {
            label: 'Production',
            url: 'https://www.example.com/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]',
          },
        ],
        layouts: ['default', 'preview'],
      })
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
          text: JSON.stringify({
            targets: [
              {
                label: 'www.example.com',
                url: 'https://www.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview_path]',
              },
            ],
          }),
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
        expect.stringContaining('DRUXT_NODE_PREVIEW_CLIENT_SECRET is not set')
      )
      warn.mockRestore()
    })
  })
})
