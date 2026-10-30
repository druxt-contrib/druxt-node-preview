import NuxtModule from '../src/index.js'

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
  context.nuxt = { hook: (name, fn) => { context.hooks[name] = fn } }
  context.extendRoutes = (fn) => fn(context.routes, (...parts) => parts.join('/'))
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
        origins: ['https://cms.example.com/path', 'javascript:alert(1)', 'not a url'],
      },
    })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.include).toEqual(['field_media'])
    expect(context.addedPlugins[0].options.origins).toEqual(['https://drupal.example.com', 'https://cms.example.com'])
  })

  test('module options override the defaults', () => {
    const context = buildContext()
    NuxtModule.call(context, { path: '/preview', include: ['field_body'] })

    expect(context.routes[0].path).toBe('/preview')
    expect(context.addedPlugins[0].options.include).toEqual(['field_body'])
  })

  test('nuxt.config druxt.nodePreview options are used', () => {
    const context = buildContext({ nodePreview: { path: '/p', include: ['field_a'] } })
    NuxtModule.call(context)

    expect(context.routes[0].path).toBe('/p')
    expect(context.addedPlugins[0].options.include).toEqual(['field_a'])
  })

  // druxt-site sets druxt.baseUrl from its own module options, and Nuxt may
  // run it after this module.
  test('origins take a baseUrl set after this module', () => {
    const context = buildContext()
    NuxtModule.call(context)
    context.options.druxt = { baseUrl: 'https://late.example.com/' }
    context.hooks['modules:done']()
    expect(context.addedPlugins[0].options.origins).toEqual(['https://late.example.com'])
  })

  test('an origin that is not an http(s) URL is reported, not dropped quietly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({ nodePreview: { origins: ['https://cms.example.com', 'cms.example.com'] } })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.origins).toEqual(['https://cms.example.com'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"cms.example.com"'))
    warn.mockRestore()
  })

  test('an origins option that is not a list is reported, not dropped quietly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({ nodePreview: { origins: 'https://cms.example.com' } })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.origins).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ignored the origins option'))
    warn.mockRestore()
  })

  test('an include value that is not plain is reported, not dropped quietly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const context = buildContext({ nodePreview: { include: { 'node--page': ['field_media', 'bad path'], page: ['field_x'] } } })
    NuxtModule.call(context)
    expect(context.addedPlugins[0].options.include).toEqual({ 'node--page': ['field_media'] })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"bad path"'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"page"'))
    warn.mockRestore()
  })
})
