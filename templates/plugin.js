/**
 * The $druxtNodePreview plugin.
 *
 * Fetches a JSON:API Node Preview document with the editor's Drupal session,
 * and seeds the Druxt store with it so DruxtEntity renders the unsaved data.
 */
export default ({ store }, inject) => {
  const include = JSON.parse('<%= JSON.stringify(options.include) %>')

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
      // Routers like vue-router normalize the URL and collapse the double
      // slash after the scheme inside the fragment. Repair it.
      return decodeURIComponent(hash).replace(/^(https?):\/(?!\/)/, '$1://')
    },

    /**
     * Fetches the preview document with credentials.
     *
     * @param {string} endpoint - The JSON:API Node Preview endpoint.
     *
     * @returns {object} The JSON:API document.
     */
    fetch: async (endpoint) => {
      let url = endpoint
      if (include.length) {
        url += (url.includes('?') ? '&' : '?') + 'include=' + include.join(',')
      }
      const response = await window.fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/vnd.api+json' },
      })
      if (!response.ok) {
        // Carry the start of the body: a bare status is hard to act on.
        const body = (await response.text().catch(() => '')).slice(0, 300)
        throw new Error('Preview request failed with HTTP ' + response.status + ' for ' + url + (body ? ': ' + body : ''))
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
      return { type: doc.data.type, id: doc.data.id }
    },
  }

  inject('druxtNodePreview', plugin)
}
