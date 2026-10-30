/**
 * The $druxtNodePreview plugin.
 *
 * Fetches a JSON:API Node Preview document with the editor's Drupal session,
 * and seeds the Druxt store with it so DruxtEntity renders the unsaved data.
 *
 * It also registers the `druxtNodePreview` store module. Its `active` state is
 * true while a preview is seeded, so a site component that refetches its data
 * (for example paragraphs at a revision) can skip that and read the store.
 *
 * Leaving the preview route flushes the seeded resources from the Druxt store
 * and clears `active`, so the next page renders the saved content.
 */
export default ({ app, store }, inject) => {
  const include = JSON.parse('<%= JSON.stringify(options.include) %>')
  const layouts = JSON.parse('<%= JSON.stringify(options.layouts) %>')
  // Origins the preview may come from, besides this site's own.
  const origins = JSON.parse('<%= JSON.stringify(options.origins) %>')

  // Drupal gives every JSON:API resource a UUID, and a JSON:API Node Preview
  // URL ends in /{uuid}/preview.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const PREVIEW_PATH =
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/preview$/

  /**
   * Returns the node's UUID from a preview endpoint, or throws.
   *
   * The endpoint comes from the URL fragment, which any link can set. So it
   * must be on this site or an allowed origin, and it must be a node preview.
   * Without these checks, a crafted link could make the page fetch other JSON
   * with the editor's credentials, such as an uploaded file, and render it.
   *
   * @param {string} endpoint - The endpoint, a URL or a path.
   *
   * @returns {string} The previewed node's UUID.
   */
  const checkEndpoint = (endpoint) => {
    const { origin, pathname } = new URL(endpoint, window.location.origin)
    if (origin !== window.location.origin && !origins.includes(origin)) {
      throw new Error(
        'The preview endpoint is not on this site or its Drupal site: ' + origin
      )
    }
    const match = pathname.match(PREVIEW_PATH)
    if (!match) {
      throw new Error('The preview endpoint is not a node preview: ' + pathname)
    }
    return match[1]
  }

  /**
   * Throws unless a response's content type is JSON:API.
   *
   * @param {*} type - The Content-Type header.
   */
  const checkType = (type) => {
    if (!String(type || '').includes('application/vnd.api+json')) {
      throw new Error('The preview response is not a JSON:API document.')
    }
  }

  /**
   * Throws unless the document is safe to put in the Druxt store.
   *
   * Every resource needs a JSON:API type and a UUID. The store keys resources
   * by type and id, so a name such as `__proto__` would write to the object
   * prototype.
   *
   * @param {*} doc - The response.
   * @param {string} [uuid] - The UUID the main resource must have.
   */
  const checkDocument = (doc, uuid) => {
    const safe = (key) =>
      typeof key === 'string' &&
      /^[A-Za-z0-9_-]+$/.test(key) &&
      !(key in Object.prototype)
    const included = (doc || {}).included
    const resources =
      doc &&
      typeof doc === 'object' &&
      doc.data &&
      typeof doc.data === 'object' &&
      (included === undefined || Array.isArray(included))
        ? [doc.data, ...(included || [])]
        : []
    if (
      !resources.length ||
      !resources.every(
        (resource) => resource && safe(resource.type) && UUID.test(resource.id)
      )
    ) {
      throw new Error('The preview response is not a node preview document.')
    }
    if (uuid && doc.data.id !== uuid) {
      throw new Error('The preview response is not a preview of ' + uuid + '.')
    }
  }

  /**
   * Returns whether a route is the preview route.
   *
   * nuxt-i18n adds a language suffix to route names, such as
   * `druxt-node-preview___en`.
   *
   * @param {object} route - A route.
   *
   * @returns {boolean} True for the preview route.
   */
  const isPreview = (route) =>
    /^druxt-node-preview(___[A-Za-z0-9_-]+)?$/.test((route || {}).name || '')

  // The type and id of every resource the preview put in the Druxt store.
  const seeded = []

  if (!store.hasModule('druxtNodePreview')) {
    store.registerModule(
      'druxtNodePreview',
      {
        namespaced: true,
        state: () => ({ active: false, uuid: null }),
        mutations: {
          start(state, uuid) {
            state.active = true
            state.uuid = uuid
          },
          stop(state) {
            state.active = false
            state.uuid = null
          },
        },
      },
      { preserveState: !!(store.state || {}).druxtNodePreview }
    )
  }

  // True from when the editor leaves the preview route until a preview route
  // opens again. vue-router changes currentRoute only after the next route's
  // code loads, so a fetch that ends meanwhile still sees the preview route.
  // When that code fails to download, Nuxt reloads the page, which resets
  // this. A site guard that cancels the leave with next(false) leaves it set
  // until the next navigation, because vue-router has no hook for that.
  let left = false

  // Before the next route loads, so none of its components read a seeded
  // resource. Druxt then fetches the saved one.
  if (app.router) {
    app.router.beforeEach((to, from, next) => {
      if (isPreview(from) && !isPreview(to)) {
        left = true
        if (seeded.length) {
          for (const { type, id } of seeded.splice(0)) {
            store.commit('druxt/flushResource', { type, id })
          }
          store.commit('druxtNodePreview/stop')
        }
      } else if (isPreview(to)) {
        left = false
      }
      next()
    })
  }

  /**
   * Adds the configured includes to the include the URL already has.
   *
   * Consumer Node Preview already includes a node's paragraphs. A site adds
   * what those paragraphs reference, such as their media.
   *
   * @param {string} url - The endpoint.
   *
   * @returns {string} The URL to request.
   */
  const withInclude = (url) => {
    const configured = includeFor(url)
    if (!configured.length) return url
    const [base, query = ''] = url.split('?')
    const params = query
      .split('&')
      .filter((param) => param && !param.startsWith('include='))
    const current = (
      query.split('&').find((param) => param.startsWith('include=')) ||
      'include='
    )
      .slice('include='.length)
      .split(',')
      .filter(Boolean)
    const merged = [...new Set([...current, ...configured])]
    return base + '?' + [...params, 'include=' + merged.join(',')].join('&')
  }

  /**
   * Returns the configured include paths for an endpoint.
   *
   * The option is a list for every previewed type, or an object of lists
   * keyed by JSON:API type, such as `node--page`. JSON:API rejects a path
   * that the type does not have, so a path only some bundles have goes in
   * the object form.
   *
   * @param {string} url - The endpoint, from Consumer Node Preview:
   *   `.../{entity type}/{bundle}/{uuid}/preview`.
   *
   * @returns {string[]} The include paths.
   */
  function includeFor(url) {
    if (Array.isArray(include)) return include
    const match = url
      .split('?')[0]
      .match(/\/([^/]+)\/([^/]+)\/[0-9a-f-]{36}\/preview$/)
    return (match && include[match[1] + '--' + match[2]]) || []
  }

  /**
   * Builds an error that carries the status and the start of the body.
   *
   * @param {string} url - The requested URL.
   * @param {number} status - The HTTP status.
   * @param {string} body - The response body.
   *
   * @returns {Error} The error.
   */
  const failure = (url, status, body) =>
    new Error(
      'Preview request failed with HTTP ' +
        status +
        ' for ' +
        url +
        (body ? ': ' + String(body).slice(0, 300) : '')
    )

  const plugin = {
    /**
     * Returns the Nuxt layout for a requested layout name.
     *
     * Only a name in the `layouts` option is used, so a preview URL cannot
     * put the page in any other layout of the site.
     *
     * @param {*} name - The requested name, usually from `?layout=`.
     *
     * @returns {string|undefined} The layout, or undefined for the default.
     */
    layout: (name) =>
      typeof name === 'string' && layouts.includes(name) ? name : undefined,

    /**
     * Returns the preview endpoint from the URL fragment.
     *
     * The fragment never reaches any server, so the preview URL stays out of
     * request logs. It is only readable in the browser.
     *
     * @returns {string|null} The endpoint, or null when there is none.
     */
    endpoint: () => {
      const hash = (window.location.hash || '').slice(1)
      if (!hash) return null
      // vue-router normalises the URL, which collapses the double slash after
      // the scheme inside the fragment. Repair it.
      return decodeURIComponent(hash).replace(/^(https?):\/(?!\/)/, '$1://')
    },

    /**
     * Fetches the preview document with the editor's session.
     *
     * The request goes through the Druxt client, with credentials. The site's
     * request interceptors apply, and the editor's session cookie goes with
     * it. A path stays a path. The client resolves it against its own base
     * URL, and interceptors that decide by path still see it.
     *
     * @param {string} endpoint - The JSON:API Node Preview endpoint.
     *
     * @returns {object} The JSON:API document.
     */
    fetch: async (endpoint) => {
      const uuid = checkEndpoint(endpoint)
      const url = withInclude(endpoint)
      const headers = { Accept: 'application/vnd.api+json' }
      const client = (app.$druxt || {}).axios
      if (client) {
        let response
        try {
          response = await client.get(url, { headers, withCredentials: true })
        } catch (error) {
          const failed = error.response || {}
          if (!failed.status) throw error
          const body =
            typeof failed.data === 'string'
              ? failed.data
              : JSON.stringify(failed.data || '')
          throw failure(url, failed.status, body)
        }
        checkType((response.headers || {})['content-type'])
        checkDocument(response.data, uuid)
        return response.data
      }
      const response = await window.fetch(url, {
        credentials: 'include',
        headers,
      })
      if (!response.ok) {
        throw failure(
          url,
          response.status,
          await response.text().catch(() => '')
        )
      }
      checkType(response.headers && response.headers.get('content-type'))
      const doc = await response.json()
      checkDocument(doc, uuid)
      return doc
    },

    /**
     * Seeds the Druxt store with the preview document.
     *
     * The main resource and every included resource are stored, so a
     * DruxtEntity render finds the unsaved preview data instead of fetching
     * the saved data from the API.
     *
     * @param {object} doc - The JSON:API document.
     *
     * @returns {object|null} The type and id of the previewed resource, or null
     *   when the editor has left the preview.
     */
    seed: (doc) => {
      // A fetch can end after the editor has left the preview. Then nothing
      // is seeded, so nothing unsaved reaches the next page.
      if (left) return null
      if (app.router && !isPreview(app.router.currentRoute)) return null
      checkDocument(doc)
      // DruxtEntity reads a resource under its language: its langcode prop,
      // else the route's langcode meta. The preview's DruxtEntity has no
      // langcode prop, so the resources go under the route's.
      const prefix = (((app.router || {}).currentRoute || {}).meta || {})
        .langcode
      for (const data of [doc.data, ...(doc.included || [])]) {
        store.commit('druxt/addResource', { prefix, resource: { data } })
        seeded.push({ type: data.type, id: data.id })
      }
      store.commit('druxtNodePreview/start', doc.data.id)
      return { type: doc.data.type, id: doc.data.id }
    },
  }

  inject('druxtNodePreview', plugin)
}
