/**
 * The $druxtNodePreview plugin.
 *
 * Fetches a JSON:API Node Preview document with the editor's Drupal session,
 * and seeds the Druxt store with it so DruxtEntity renders the unsaved data.
 *
 * It also registers the `druxtNodePreview` store module. Its `active` state is
 * true once a preview is seeded, so a site component that refetches its data
 * (for example paragraphs at a revision) can skip that and read the store.
 */
export default ({ app, store }, inject) => {
  const include = JSON.parse('<%= JSON.stringify(options.include) %>')
  // Origins the preview may come from, besides this site's own.
  const origins = JSON.parse('<%= JSON.stringify(options.origins) %>')

  // Drupal gives every JSON:API resource a UUID, and a JSON:API Node Preview
  // URL ends in /{uuid}/preview.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  const PREVIEW_PATH = /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/preview$/

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
      throw new Error('The preview endpoint is not on this site or its Drupal site: ' + origin)
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
    const safe = (key) => typeof key === 'string' && /^[A-Za-z0-9_-]+$/.test(key) && !(key in Object.prototype)
    const included = (doc || {}).included
    const resources = doc && typeof doc === 'object' && doc.data && typeof doc.data === 'object'
      && (included === undefined || Array.isArray(included))
      ? [doc.data, ...(included || [])]
      : []
    if (!resources.length || !resources.every((resource) => resource && safe(resource.type) && UUID.test(resource.id))) {
      throw new Error('The preview response is not a node preview document.')
    }
    if (uuid && doc.data.id !== uuid) {
      throw new Error('The preview response is not a preview of ' + uuid + '.')
    }
  }

  if (!store.hasModule('druxtNodePreview')) {
    store.registerModule('druxtNodePreview', {
      namespaced: true,
      state: () => ({ active: false, uuid: null }),
      mutations: {
        start(state, uuid) {
          state.active = true
          state.uuid = uuid
        },
      },
    }, { preserveState: !!(store.state || {}).druxtNodePreview })
  }

  /**
   * Adds the configured includes, unless the URL already has an include.
   *
   * Consumer Node Preview already includes a node's paragraphs.
   *
   * @param {string} url - The endpoint.
   *
   * @returns {string} The URL to request.
   */
  const withInclude = (url) => {
    if (!include.length || /[?&]include=/.test(url)) return url
    return url + (url.includes('?') ? '&' : '?') + 'include=' + include.join(',')
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
  const failure = (url, status, body) => new Error(
    'Preview request failed with HTTP ' + status + ' for ' + url + (body ? ': ' + String(body).slice(0, 300) : '')
  )

  const plugin = {
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
     * it.
     * A path is resolved against the frontend's own origin, which suits a
     * site that proxies Drupal.
     *
     * @param {string} endpoint - The JSON:API Node Preview endpoint.
     *
     * @returns {object} The JSON:API document.
     */
    fetch: async (endpoint) => {
      const uuid = checkEndpoint(endpoint)
      const url = new URL(withInclude(endpoint), window.location.origin).href
      const headers = { Accept: 'application/vnd.api+json' }
      const client = (app.$druxt || {}).axios
      if (client) {
        let response
        try {
          response = await client.get(url, { headers, withCredentials: true })
        }
        catch (error) {
          const failed = error.response || {}
          if (!failed.status) throw error
          const body = typeof failed.data === 'string' ? failed.data : JSON.stringify(failed.data || '')
          throw failure(url, failed.status, body)
        }
        checkType((response.headers || {})['content-type'])
        checkDocument(response.data, uuid)
        return response.data
      }
      const response = await window.fetch(url, { credentials: 'include', headers })
      if (!response.ok) {
        throw failure(url, response.status, await response.text().catch(() => ''))
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
     * @returns {object} The type and id of the previewed resource.
     */
    seed: (doc) => {
      checkDocument(doc)
      store.commit('druxt/addResource', { resource: { data: doc.data } })
      for (const included of doc.included || []) {
        store.commit('druxt/addResource', { resource: { data: included } })
      }
      store.commit('druxtNodePreview/start', doc.data.id)
      return { type: doc.data.type, id: doc.data.id }
    },
  }

  inject('druxtNodePreview', plugin)
}
