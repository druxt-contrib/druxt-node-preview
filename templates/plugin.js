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
     * The request goes through the Druxt client, so the site's request
     * interceptors apply, with credentials, so the session cookie goes too.
     * A path is resolved against the frontend's own origin, which suits a
     * site that proxies Drupal.
     *
     * @param {string} endpoint - The JSON:API Node Preview endpoint.
     *
     * @returns {object} The JSON:API document.
     */
    fetch: async (endpoint) => {
      const url = new URL(withInclude(endpoint), window.location.origin).href
      const headers = { Accept: 'application/vnd.api+json' }
      const client = (app.$druxt || {}).axios
      if (client) {
        try {
          const response = await client.get(url, { headers, withCredentials: true })
          return response.data
        }
        catch (error) {
          const response = error.response || {}
          if (!response.status) throw error
          const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '')
          throw failure(url, response.status, body)
        }
      }
      const response = await window.fetch(url, { credentials: 'include', headers })
      if (!response.ok) {
        throw failure(url, response.status, await response.text().catch(() => ''))
      }
      return response.json()
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
