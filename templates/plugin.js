/**
 * The $druxtNodePreview plugin.
 *
 * Fetches a JSON:API Node Preview document and seeds the Druxt store with it,
 * so DruxtEntity renders the unsaved data. The request carries the editor's
 * Drupal session, or a preview token from the URL fragment for a frontend on
 * another site.
 *
 * It also registers the `druxtNodePreview` store module. Its `active` state is
 * true while a preview is seeded, so a site component that refetches its data
 * (for example paragraphs at a revision) can skip that and read the store.
 *
 * Leaving the preview route flushes the seeded resources from the Druxt store
 * and clears `active`, so the next page renders the saved content. It also
 * forgets the preview token.
 */
export default ({ app, store }, inject) => {
  const include = JSON.parse('<%= JSON.stringify(options.include) %>')
  const layouts = JSON.parse('<%= JSON.stringify(options.layouts) %>')
  // Origins the preview may come from, besides this site's own. The module
  // only passes origins with plain host names, so none can end the string.
  const origins = JSON.parse('<%= JSON.stringify(options.origins) %>')
  // Druxt's Drupal origin. The page fetches from any other origin without the
  // Druxt client, whose options are for druxt.baseUrl.
  const drupal = JSON.parse('<%= JSON.stringify(options.drupal) %>')

  // Separates the endpoint from a token in the URL fragment.
  const TOKEN_MARK = ';token='
  // The token, once read and taken out of the address, its endpoint, and
  // when it was read.
  let kept = null
  // The endpoint whose token the page dropped because it had expired.
  let stale = null
  // vue-router normalises the URL, which collapses the double slash after the
  // scheme inside the fragment. This repairs it.
  const repair = (endpoint) =>
    String(endpoint).replace(/^(https?):\/(?!\/)/, '$1://')

  /**
   * Returns the endpoint and the token from a raw URL fragment.
   *
   * It throws on a fragment that doesn't decode, such as "#section%".
   *
   * @param {string} raw - The fragment, without the "#".
   *
   * @returns {string[]} The endpoint, then the token if there is one.
   */
  const fragment = (raw) => decodeURIComponent(raw).split(TOKEN_MARK)

  // Where the tab keeps the token for a reload.
  const TOKEN_STORE = 'druxtNodePreview.token'
  // The longest the page keeps a token, in milliseconds. It matches the
  // default lifetime of a Consumer Node Preview token, and holds for a token
  // whose expiry the page can't read.
  const TOKEN_LIFETIME = 15 * 60 * 1000

  /**
   * Whether a token is a JWT whose expiry has passed.
   *
   * A token without a readable expiry counts as live here. The kept token's
   * age limit still applies to it.
   *
   * @param {string} token - The token.
   *
   * @returns {boolean} True when it has expired.
   */
  const expired = (token) => {
    try {
      const part = String(token)
        .split('.')[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/')
      const { exp } = JSON.parse(window.atob(part))
      return typeof exp === 'number' && exp * 1000 <= Date.now()
    } catch {
      return false
    }
  }

  /**
   * Runs a sessionStorage call, and ignores storage that is off.
   *
   * @param {Function} call - Gets the storage, and returns the result.
   *
   * @returns {*} The result, or null when storage is off.
   */
  const storage = (call) => {
    try {
      return call(window.sessionStorage)
    } catch {
      return null
    }
  }

  /**
   * Forgets the kept token, in this page and in the tab.
   */
  const forget = () => {
    kept = null
    storage((tab) => tab.removeItem(TOKEN_STORE))
  }

  /**
   * Whether a page that frames this one may hand it a token.
   *
   * Any link can put a token in the fragment. Only Drupal's preview screen
   * should, and it shows the page in a frame. So a token counts only when the
   * page is in a frame on this site, Druxt's Drupal site or an allowed origin.
   * The browser gives the framing origin in location.ancestorOrigins. A
   * browser without it gives the referrer, which the frame's first load gets
   * from the page that framed it.
   *
   * @returns {boolean} True when an allowed origin frames the page.
   */
  const framedByDrupal = () => {
    if (window.parent === window) return false
    const ancestors = window.location.ancestorOrigins
    let framer = ancestors && ancestors.length ? ancestors[0] : null
    if (!framer) {
      try {
        framer = new URL(document.referrer).origin
      } catch {
        return false
      }
    }
    return [window.location.origin, drupal, ...origins].includes(framer)
  }

  /**
   * Takes the token out of a raw fragment, and keeps it when it may be used.
   *
   * @param {string} raw - The fragment, without the "#".
   *
   * @returns {object|null} The fragment without the token, as `address`, and
   *   the token the page may use, or null when the fragment has no token.
   */
  const take = (raw) => {
    let endpoint
    let token
    try {
      ;[endpoint, token] = fragment(raw)
    } catch {
      // A fragment that is not a preview, such as "#section%", has no token.
      return null
    }
    if (!token) return null
    // The address keeps the endpoint as it was encoded, so it reads the same
    // when the page loads again.
    const at = raw.indexOf(TOKEN_MARK)
    const address = at === -1 ? encodeURIComponent(endpoint) : raw.slice(0, at)
    // A token from a page that isn't Drupal's is never kept or sent. The
    // page reads with the session instead.
    if (!framedByDrupal()) return { address, token: null }
    // An expired token would fail where the session might not, so the page
    // leaves it out.
    if (expired(token)) {
      stale = repair(endpoint)
      return { address, token: null }
    }
    stale = null
    kept = { endpoint, token, saved: Date.now() }
    // A reload starts a new page from the address without the token. The
    // tab's session storage keeps it for that, out of any logged address.
    // Without storage, the page reads the token only once.
    storage((tab) => tab.setItem(TOKEN_STORE, JSON.stringify(kept)))
    return { address, token }
  }

  /**
   * Returns the kept token for an endpoint, or null.
   *
   * @param {string} endpoint - The endpoint in the address.
   *
   * @returns {string|null} The token.
   */
  const keptFor = (endpoint) => {
    if (!kept) {
      kept = storage((tab) => JSON.parse(tab.getItem(TOKEN_STORE)))
      // Use only what this plugin stored: an endpoint, a token and a time.
      // Anything else leaves the tab's storage, as an expired token does.
      if (
        !kept ||
        typeof kept.endpoint !== 'string' ||
        typeof kept.token !== 'string' ||
        typeof kept.saved !== 'number'
      ) {
        forget()
      }
    }
    // A kept token that has expired, or is too old, would fail where the
    // session might not, so the page drops it. So does a time to come, which
    // this plugin never stores.
    const age = kept ? Date.now() - kept.saved : 0
    if (kept && (expired(kept.token) || age < 0 || age >= TOKEN_LIFETIME)) {
      stale = repair(kept.endpoint)
      forget()
    }
    return kept && repair(kept.endpoint) === repair(endpoint)
      ? kept.token
      : null
  }

  // Drupal gives every JSON:API resource a UUID, and a JSON:API Node Preview
  // URL ends in /{uuid}/preview.
  const UUID_PATTERN =
    '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  const UUID = new RegExp('^' + UUID_PATTERN + '$')
  const PREVIEW_PATH = new RegExp('/(' + UUID_PATTERN + ')/preview$')
  // The same, with the entity type and bundle before the UUID.
  const TYPED_PREVIEW_PATH = new RegExp(
    '/([^/]+)/([^/]+)/' + UUID_PATTERN + '/preview$'
  )

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
  let leaving = false

  // Before the next route loads, so none of its components read a seeded
  // resource. Druxt then fetches the saved one.
  if (app.router) {
    app.router.beforeEach((to, from, next) => {
      if (isPreview(from) && !isPreview(to)) {
        leaving = true
        // The token was for this preview only.
        forget()
        stale = null
        if (seeded.length) {
          for (const { type, id } of seeded.splice(0)) {
            store.commit('druxt/flushResource', { type, id })
          }
          store.commit('druxtNodePreview/stop')
        }
      } else if (isPreview(to)) {
        leaving = false
      }
      // Nuxt builds its first route from the address before this plugin
      // takes the token out. So the route keeps the token, and a page view
      // tracker on the router would log it. This takes it out of the route,
      // and the redirect takes it out of the address too.
      const taken = to.hash ? take(to.hash.slice(1)) : null
      if (taken) {
        next({
          path: to.path,
          query: to.query,
          hash: '#' + taken.address,
          replace: true,
        })
        return
      }
      next()
    })
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
  const includeFor = (url) => {
    if (Array.isArray(include)) return include
    const match = url.split('?')[0].match(TYPED_PREVIEW_PATH)
    return (match && include[match[1] + '--' + match[2]]) || []
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

  // The error when an expired token was dropped and the session failed too.
  const EXPIRED =
    'The preview token has expired. Press Preview in Drupal again.'

  /**
   * Builds an error that carries the status and the start of the body.
   *
   * @param {string} url - The requested URL.
   * @param {number} status - The HTTP status.
   * @param {string} body - The response body.
   *
   * @returns {Error} The error.
   */
  const failure = (url, status, body) => {
    // An HTML error page says nothing useful in a one-line message.
    const text = String(body || '').trim()
    const shown = text && !text.startsWith('<') ? ': ' + text.slice(0, 300) : ''
    return new Error(
      'Preview request failed with HTTP ' + status + ' for ' + url + shown
    )
  }

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
      try {
        return repair(fragment(hash)[0])
      } catch {
        // A fragment that doesn't decode, such as "#section%", has no
        // endpoint, so the page says so.
        return null
      }
    },

    /**
     * Takes the token out of the URL fragment, and returns the token to use.
     *
     * The token is for a frontend on another site, where the editor's session
     * doesn't reach. An error tracker or session recorder on the page can log
     * the address, so this takes the token out of it with replaceState, and
     * keeps it in the tab's session storage for a reload. A token comes only
     * from a page that Drupal frames. Without one in the address, this returns
     * the kept token for the address's endpoint.
     *
     * @returns {string|null} The token, or null when the preview reads with
     *   the editor's session.
     */
    takeToken: () => {
      const raw = (window.location.hash || '').slice(1)
      const taken = take(raw)
      if (taken) {
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname +
            window.location.search +
            '#' +
            taken.address
        )
        return taken.token
      }
      try {
        return keptFor(fragment(raw)[0])
      } catch {
        // A fragment that is not a preview, such as "#section%", has no token.
        return null
      }
    },

    /**
     * Fetches the preview document with the editor's session, or with the
     * fragment's token where the session can't reach this frontend. A token
     * goes without credentials, so CORS on Drupal stays as it is.
     *
     * The request goes through the Druxt client, with credentials. The site's
     * request interceptors apply, and the editor's session cookie goes with
     * it. A path stays a path. The client resolves it against its own base
     * URL, and interceptors that decide by path still see it. Only the
     * page's own origin and druxt.baseUrl's use the client, because its
     * options are for druxt.baseUrl. Any other origin, such as a register
     * backend or one in the origins option, gets a plain request.
     *
     * @param {string} endpoint - The JSON:API Node Preview endpoint.
     *
     * @returns {object} The JSON:API document.
     */
    fetch: async (endpoint) => {
      const uuid = checkEndpoint(endpoint)
      const url = withInclude(endpoint)
      const token = plugin.takeToken()
      // The page dropped this preview's token because it had expired. When
      // the session can't read the preview either, the editor needs a new
      // token, so the error says that.
      const renew = !token && stale !== null && stale === repair(endpoint)
      const headers = {
        Accept: 'application/vnd.api+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }
      // The Druxt client's defaults, such as its auth, are for druxt.baseUrl.
      // Any other origin gets a plain request instead.
      const { origin } = new URL(url, window.location.origin)
      const own = origin === window.location.origin || origin === drupal
      const client = own ? (app.$druxt || {}).axios : null
      if (client) {
        let response
        try {
          response = await client.get(url, {
            headers,
            withCredentials: !token,
          })
        } catch (error) {
          if (renew) throw new Error(EXPIRED)
          const failed = error.response || {}
          if (!failed.status) throw error
          const body =
            failed.data === undefined || failed.data === null
              ? ''
              : typeof failed.data === 'string'
                ? failed.data
                : JSON.stringify(failed.data)
          throw failure(url, failed.status, body)
        }
        checkType((response.headers || {})['content-type'])
        checkDocument(response.data, uuid)
        return response.data
      }
      let response
      try {
        // A path resolves against the page's origin, which checkEndpoint()
        // checked. window.fetch would resolve it against a base element.
        response = await window.fetch(
          new URL(url, window.location.origin).href,
          {
            credentials: token ? 'omit' : 'include',
            headers,
          }
        )
      } catch (error) {
        if (renew) throw new Error(EXPIRED)
        throw error
      }
      if (!response.ok) {
        if (renew) throw new Error(EXPIRED)
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
      if (leaving) return null
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

  // Take the token out of the address before anything on the page reads it,
  // such as an analytics page view. The plugin keeps it for the preview. The
  // router guard above then takes it out of the first route. A script that
  // runs before this plugin, such as one in the page head or an earlier
  // plugin, can still read the token.
  if (typeof window !== 'undefined') plugin.takeToken()

  inject('druxtNodePreview', plugin)
}
