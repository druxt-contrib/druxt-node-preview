import NuxtModule from '../src/index.js'

const buildContext = (druxtOptions = {}) => {
  const context = {
    addedTemplates: [],
    addedPlugins: [],
    routes: [],
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
  context.extendRoutes = (fn) => fn(context.routes, (...parts) => parts.join('/'))
  return context
}

describe('DruxtNodePreview module', () => {
  test('registers the route, template and plugin', () => {
    const context = buildContext()
    NuxtModule.call(context)

    expect(context.options.store).toBe(true)
    expect(context.addedTemplates).toHaveLength(1)
    expect(context.addedPlugins).toHaveLength(1)
    expect(context.routes).toHaveLength(1)
    expect(context.routes[0].path).toBe('/druxt/node/preview')
    expect(context.routes[0].name).toBe('druxt-node-preview')
    expect(context.addedPlugins[0].options.include).toEqual([])
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
})
