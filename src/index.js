import { resolve } from 'path'

/**
 * Returns a URL's origin, or null when it is not an http(s) URL.
 *
 * @param {*} url - The URL.
 *
 * @returns {string|null} The origin.
 */
const toOrigin = (url) => {
  try {
    const { origin, protocol } = new URL(url)
    return ['http:', 'https:'].includes(protocol) ? origin : null
  }
  catch {
    return null
  }
}

/**
 * Reports an option value the module drops.
 *
 * @param {string} message - What was dropped, and what to use instead.
 */
const warn = (message) => console.warn('[druxt-node-preview] ' + message)

/**
 * Returns the include option as plain values.
 *
 * The option is a list of include paths, or lists keyed by JSON:API type.
 * Any other value is dropped with a warning, so the plugin template only gets
 * plain values.
 *
 * @param {*} value - The option value.
 *
 * @returns {string[]|object} The include option.
 */
const toInclude = (value) => {
  const paths = (list, where) => {
    if (!Array.isArray(list)) {
      warn(`Ignored the include option${where}. Use a list of paths, such as ['field_content.field_media'].`)
      return []
    }
    return list.filter((path) => {
      if (typeof path === 'string' && /^[A-Za-z0-9_.-]+$/.test(path)) return true
      warn(`Ignored the include path ${JSON.stringify(path)}${where}. Use field names joined by dots, such as "field_content.field_media".`)
      return false
    })
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([type]) => {
        if (/^[A-Za-z0-9_]+--[A-Za-z0-9_]+$/.test(type)) return true
        warn(`Ignored the include key "${type}". Key paths by JSON:API type, such as "node--page".`)
        return false
      })
      .map(([type, list]) => [type, paths(list, ` for ${type}`)]))
  }
  return paths(value, '')
}

/**
 * Returns the layouts option as plain layout names.
 *
 * A name that is not a plain file name is dropped with a warning, so the
 * plugin template only gets plain values.
 *
 * @param {*} value - The option value.
 *
 * @returns {string[]} The layout names.
 */
const toLayouts = (value) => {
  if (!Array.isArray(value)) {
    warn('Ignored the layouts option. Use a list of layout names, such as [\'preview\'].')
    return []
  }
  return value.filter((name) => {
    if (typeof name === 'string' && /^[A-Za-z0-9_-]+$/.test(name)) return true
    warn(`Ignored the layout ${JSON.stringify(name)}. Use the name of a file in layouts/, such as "preview". A layout in a subfolder cannot be listed.`)
    return false
  })
}

/**
 * The DruxtNodePreview Nuxt module.
 *
 * Registers a client side page that renders a Drupal node preview. The page
 * reads the JSON:API Node Preview endpoint from the URL fragment, fetches it
 * with the editor's Drupal session, seeds the Druxt store with the preview
 * document, and renders the node through DruxtEntity.
 *
 * The Drupal site points a Consumer Node Preview target at the page:
 *
 *   https://frontend.example.com/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview]
 *
 * The page renders in the Nuxt layout named by `?layout=`, when that name is
 * in the `layouts` option. Any other name, or none, gives the default layout.
 *
 * The route name, `druxt-node-preview`, is public. Sites hook it, so do not
 * change it.
 *
 * @param {object} moduleOptions - Nuxt module options.
 */
const NuxtModule = function (moduleOptions = {}) {
  const druxt = (this.options || {}).druxt || {}
  const options = {
    path: '/druxt/node/preview',
    include: [],
    origins: [],
    layouts: [],
    ...druxt.nodePreview || {},
    ...moduleOptions,
  }

  // Enable the Vuex store, required by the Druxt store.
  this.options.store = true

  // Add the themeable preview component. The page imports it by this name.
  this.addTemplate({
    src: resolve(__dirname, '../templates/DruxtNodePreview.vue'),
    fileName: 'components/druxt-node-preview.vue',
  })

  // Add the page component template.
  const { dst } = this.addTemplate({
    src: resolve(__dirname, '../templates/DruxtNodePreviewPage.vue'),
    fileName: 'components/druxt-node-preview-page.vue',
  })

  // Register the preview route first, so a site's catch-all or dynamic page
  // cannot shadow it.
  this.extendRoutes((routes, resolveRoute) => {
    routes.unshift({
      name: 'druxt-node-preview',
      path: options.path,
      component: resolveRoute(this.options.buildDir, dst),
    })
  })

  // An origin the site lists must be a full http(s) URL. Say so, rather than
  // leave the site to find out from a refused preview.
  if (!Array.isArray(options.origins)) {
    warn('Ignored the origins option. Use a list of full http(s) URLs, such as [\'https://cms.example.com\'].')
  }
  const listed = (Array.isArray(options.origins) ? options.origins : []).filter((url) => {
    if (toOrigin(url)) return true
    warn(`Ignored the origin "${url}". Use a full http(s) URL, such as "https://cms.example.com".`)
    return false
  })

  const pluginOptions = {
    include: toInclude(options.include),
    origins: [],
    layouts: toLayouts(options.layouts),
  }

  // The page fetches a preview only from its own origin, Druxt's Drupal site,
  // or an origin the site lists. druxt-site sets druxt.baseUrl from its own
  // module options, and Nuxt can run it after this module. So the origins are
  // read again once every module has run. The template reads them at build.
  const setOrigins = () => {
    const baseUrl = ((this.options || {}).druxt || {}).baseUrl
    pluginOptions.origins = [...new Set([baseUrl, ...listed].map(toOrigin).filter(Boolean))]
  }
  setOrigins()
  if (this.nuxt) this.nuxt.hook('modules:done', setOrigins)

  // Add the plugin that fetches and seeds the preview.
  this.addPlugin({
    src: resolve(__dirname, '../templates/plugin.js'),
    fileName: 'druxt-node-preview.js',
    options: pluginOptions,
  })
}

export default NuxtModule
