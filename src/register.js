import { DruxtClient } from 'druxt'

/**
 * Registers the frontend as a preview target on its Drupal consumer.
 *
 * The site turns this on with the `register` option. When Nuxt is ready, the
 * module gets a token with Simple OAuth's client credentials grant. It reads
 * the consumer's targets from Consumer Node Preview's targets API. It adds or
 * replaces its own target, by label, and keeps every other target. It writes
 * the targets back only when something changed.
 *
 * Every request goes through a DruxtClient, so the site's `druxt.axios`
 * options apply. No request follows a redirect, so the secret never goes to
 * another host.
 *
 * A failure never stops Nuxt. It prints a warning that says what to fix.
 * No message ever holds the secret or the token.
 */

const PREFIX = '[druxt-node-preview] '
const DEFAULT_TIMEOUT = 5000
const MAX_TIMEOUT = 120000
const PERMISSION = 'register consumer node preview targets'

/**
 * Prints a warning.
 *
 * @param {string} message - The message.
 */
const warn = (message) => console.warn(PREFIX + message)

/**
 * Prints a notice.
 *
 * @param {string} message - The message.
 */
const info = (message) => console.info(PREFIX + message)

/**
 * Returns a value from the environment, or undefined when it is empty.
 *
 * @param {object} env - The environment.
 * @param {string} name - The variable name.
 *
 * @returns {string|undefined} The value.
 */
const fromEnv = (env, name) =>
  typeof env[name] === 'string' && env[name].trim() !== ''
    ? env[name].trim()
    : undefined

/**
 * Returns the frontend's base URL without a trailing slash, or null.
 *
 * The URL must be a full http(s) URL with no query and no fragment. It can
 * have a path, for a site under a sub path.
 *
 * @param {*} value - The URL.
 *
 * @returns {string|null} The base URL.
 */
const toBaseUrl = (value) => {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.search ||
      url.hash ||
      typeof value !== 'string'
    )
      return null
    return (url.origin + url.pathname).replace(/\/+$/, '')
  } catch {
    return null
  }
}

/**
 * Returns the registration settings, or null when registration is off.
 *
 * Registration is off unless the `register` option is true or an object.
 * The environment wins over the options, so one nuxt.config.js serves each
 * environment:
 *
 * - DRUXT_NODE_PREVIEW_URL over `url`.
 * - The consumer's client ID comes from the first of these that is set:
 *   DRUXT_NODE_PREVIEW_CLIENT_ID, `consumer`, druxt-auth's
 *   `druxt.auth.clientId`, and then DRUXT_AUTH_CLIENT_ID. druxt-auth is
 *   not needed. It only saves setting the client ID twice.
 * - DRUXT_NODE_PREVIEW_CLIENT_SECRET is the only source of the secret.
 *   druxt-auth's secret is never read.
 *
 * A value the module cannot use gives a warning. Without a URL, a consumer
 * or a secret, registration is off.
 *
 * @param {*} value - The `register` option.
 * @param {object} env - The environment, such as process.env.
 * @param {object} [druxt] - The druxt options, for druxt-auth's client ID.
 *
 * @returns {object|null} The url, label, consumer, secret and timeout.
 */
export const resolveRegister = (value, env, druxt = {}) => {
  if (value === undefined || value === null || value === false) return null
  if (value !== true && (typeof value !== 'object' || Array.isArray(value))) {
    warn(
      "Ignored the register option. Use true, or an object such as { url: 'https://www.example.com', consumer: 'frontend' }."
    )
    return null
  }
  const options = value === true ? {} : value

  // Never print the secret from the options. Its length is enough to give it
  // away in a short message, so say nothing about it.
  if (options.secret !== undefined) {
    warn(
      'Ignored druxt.nodePreview.register.secret. Never put the secret in nuxt.config.js. Set DRUXT_NODE_PREVIEW_CLIENT_SECRET in the environment instead.'
    )
  }

  const envUrl = fromEnv(env, 'DRUXT_NODE_PREVIEW_URL')
  const rawUrl = envUrl !== undefined ? envUrl : options.url
  if (rawUrl === undefined) {
    warn(
      'Ignored the register option: it has no URL. Set druxt.nodePreview.register.url or DRUXT_NODE_PREVIEW_URL to the frontend\'s public URL, such as "https://www.example.com".'
    )
    return null
  }
  const url = toBaseUrl(rawUrl)
  if (!url) {
    const where = envUrl !== undefined ? ' from DRUXT_NODE_PREVIEW_URL' : ''
    warn(
      `Ignored the register option: the URL ${JSON.stringify(rawUrl)}${where} is not a full http(s) URL. Use the frontend's public URL with no query or fragment, such as "https://www.example.com".`
    )
    return null
  }

  const auth = (druxt && druxt.auth) || {}
  const consumer = [
    fromEnv(env, 'DRUXT_NODE_PREVIEW_CLIENT_ID'),
    options.consumer,
    auth.clientId,
    fromEnv(env, 'DRUXT_AUTH_CLIENT_ID'),
  ].find((id) => id !== undefined && id !== null && id !== '')
  if (typeof consumer !== 'string' || !/^[\x21-\x7e]+$/.test(consumer)) {
    warn(
      "Ignored the register option: it has no usable consumer. Set druxt.nodePreview.register.consumer or DRUXT_NODE_PREVIEW_CLIENT_ID to the consumer's client ID."
    )
    return null
  }

  const secret = fromEnv(env, 'DRUXT_NODE_PREVIEW_CLIENT_SECRET')
  if (!secret) {
    warn(
      "Ignored the register option: DRUXT_NODE_PREVIEW_CLIENT_SECRET is not set. Set it to the consumer's secret in the environment that runs Nuxt."
    )
    return null
  }

  // The default label is the frontend's host, so local, staging and
  // production each keep their own target on a shared consumer.
  let label = new URL(url).host
  if (options.label !== undefined) {
    if (typeof options.label === 'string' && options.label.trim() !== '')
      label = options.label.trim()
    else
      warn(
        `Ignored the register label. Use a non-empty string. The label is "${label}".`
      )
  }

  let timeout = DEFAULT_TIMEOUT
  if (options.timeout !== undefined) {
    if (
      typeof options.timeout === 'number' &&
      options.timeout > 0 &&
      options.timeout <= MAX_TIMEOUT
    )
      timeout = options.timeout
    else
      warn(
        `Ignored the register timeout. Use a number of milliseconds up to ${MAX_TIMEOUT}. The timeout is ${DEFAULT_TIMEOUT}.`
      )
  }

  return { url, label, consumer, secret, timeout }
}

/**
 * Returns the URL template of the frontend's preview target.
 *
 * Drupal replaces the tokens in square brackets for each preview. The
 * endpoint goes in as a path, [jsonapi_node_preview_path]. The page fetches
 * it through the Druxt client, which resolves it against its own base URL.
 * So the preview works for an editor on Drupal's host or on the frontend's,
 * and through a proxy that serves Drupal on the frontend's origin. The
 * target is on the Drupal site at druxt.baseUrl, so the path always names
 * that site.
 *
 * @param {string} url - The frontend's base URL.
 * @param {string} path - The preview page's path.
 * @param {string[]} layouts - The layouts option.
 *
 * @returns {string} The URL template.
 */
export const targetUrl = (url, path, layouts) =>
  url +
  path +
  '?vm=[view_mode]' +
  (layouts.length ? '&layout=[layout]' : '') +
  '#[jsonapi_node_preview_path]'

/**
 * Adds a target to a list, or replaces the first one with its label.
 *
 * Every other target stays as it was, in its place.
 *
 * @param {object[]} targets - The consumer's targets.
 * @param {object} target - The frontend's target, with a label and a URL.
 *
 * @returns {{targets: object[], changed: boolean}} The new list, and whether
 *   it differs from the old one.
 */
export const mergeTargets = (targets, target) => {
  const index = targets.findIndex((item) => item.label === target.label)
  if (index === -1) return { targets: [...targets, target], changed: true }
  if (targets[index].url === target.url) return { targets, changed: false }
  const merged = [...targets]
  merged[index] = target
  return { targets: merged, changed: true }
}

/**
 * Returns the JSON in a response body, or undefined.
 *
 * @param {string} text - The body.
 *
 * @returns {*} The data.
 */
const parse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * An error with a message for the site builder.
 */
class RegisterError extends Error {}

/**
 * Returns whether an axios error is a timeout.
 *
 * axios gives ECONNABORTED for its own timeout, or ETIMEDOUT when the site
 * sets `transitional.clarifyTimeoutError`.
 *
 * @param {Error} error - The error.
 *
 * @returns {boolean} True for a timeout.
 */
const isTimeout = (error) =>
  error.code === 'ETIMEDOUT' ||
  (error.code === 'ECONNABORTED' && /timeout/i.test(String(error.message)))

/**
 * Sends a request, and turns a network failure into a RegisterError.
 *
 * Every status comes back as a response, so the callers can name the cause.
 * A redirect is not followed. It comes back as a 3xx response.
 *
 * @param {object} client - The DruxtClient.
 * @param {string} method - The HTTP method.
 * @param {string} url - The full URL.
 * @param {object} options - The headers and the body.
 *
 * @returns {Promise<{status: number, data: *}>} The response.
 */
const send = async (client, method, url, { headers, data }) => {
  let response
  try {
    response = await client.axios.request({
      method,
      url,
      headers,
      data,
      maxRedirects: 0,
      validateStatus: () => true,
    })
  } catch (error) {
    if (isTimeout(error)) {
      const seconds = client.axios.defaults.timeout / 1000
      throw new RegisterError(
        `Drupal did not answer at ${url} within ${seconds} seconds. Check that Drupal is up, or raise the register timeout.`
      )
    }
    const code = error.code ? ` (${error.code})` : `: ${error.message}`
    throw new RegisterError(
      `Drupal did not answer at ${url}${code}. Check druxt.baseUrl, and that Drupal is up.`
    )
  }
  const { status, headers: answered = {} } = response
  if (status >= 300 && status < 400) {
    const location = answered.location ? ` to ${answered.location}` : ''
    throw new RegisterError(
      `Drupal redirected ${url}${location} (HTTP ${status}). The module does not follow redirects, so the secret stays on one host. Set druxt.baseUrl to the URL Drupal redirects to.`
    )
  }
  const body = response.data
  return { status, data: typeof body === 'string' ? parse(body) : body }
}

/**
 * Returns the reason Drupal gave, after a colon, or an empty string.
 *
 * Drupal and Consumer Node Preview give a "message". OAuth gives an
 * "error_description" or an "error". An HTML page gives nothing.
 *
 * @param {*} data - The response data.
 *
 * @returns {string} The reason.
 */
const reason = (data) => {
  const text =
    data &&
    typeof data === 'object' &&
    [data.error_description, data.message, data.error].find(
      (value) => typeof value === 'string' && value.trim() !== ''
    )
  return text ? ': ' + text.trim().slice(0, 300) : ''
}

/**
 * Gets an access token with the client credentials grant.
 *
 * @param {object} client - The DruxtClient.
 * @param {string} base - Drupal's base URL.
 * @param {object} settings - The registration settings.
 *
 * @returns {Promise<string>} The access token.
 */
const getToken = async (client, base, { consumer, secret }) => {
  const url = `${base}/oauth/token`
  const { status, data } = await send(client, 'POST', url, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    data: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: consumer,
      client_secret: secret,
    }).toString(),
  })
  if (status === 404) {
    throw new RegisterError(
      `${url} answered HTTP 404. Install and set up the Simple OAuth module on Drupal.`
    )
  }
  if (status === 400 || status === 401) {
    throw new RegisterError(
      `Drupal refused the client credentials (HTTP ${status}${reason(data)}). Check that DRUXT_NODE_PREVIEW_CLIENT_SECRET is the secret of the consumer "${consumer}", and that the consumer is confidential, allows the Client credentials grant, and has a Client credentials user.`
    )
  }
  if (status !== 200) {
    throw new RegisterError(
      `The token request answered HTTP ${status}${reason(data)}. Check Simple OAuth's settings and keys on Drupal.`
    )
  }
  if (!data || typeof data.access_token !== 'string' || !data.access_token) {
    throw new RegisterError(
      `The token request at ${url} gave no access token. Check that it is Simple OAuth's token endpoint.`
    )
  }
  return data.access_token
}

/**
 * Throws for a targets API response that is not a success.
 *
 * @param {string} url - The URL.
 * @param {object} response - The response.
 * @param {string} consumer - The consumer's client ID.
 */
const checkTargets = (url, { status, data }, consumer) => {
  if (status === 404) {
    throw new RegisterError(
      `The targets API at ${url} answered HTTP 404${reason(data)}. Check that Consumer Node Preview is installed, and that a consumer has the client ID "${consumer}".`
    )
  }
  if (status === 401 || status === 403) {
    throw new RegisterError(
      `The targets API answered HTTP ${status}${reason(data)}. The consumer's Client credentials user must own the consumer "${consumer}", and the token's scope must give the "${PERMISSION}" permission.`
    )
  }
  if (status === 422) {
    throw new RegisterError(
      `Drupal refused the target (HTTP 422${reason(data)}). Check the register url and the path option.`
    )
  }
  if (status !== 200) {
    throw new RegisterError(
      `The targets API at ${url} answered HTTP ${status}${reason(data)}.`
    )
  }
  const plain = (target) =>
    target && typeof target.label === 'string' && typeof target.url === 'string'
  if (!data || !Array.isArray(data.targets) || !data.targets.every(plain)) {
    throw new RegisterError(
      `The targets API at ${url} did not answer with a targets list. Check druxt.baseUrl.`
    )
  }
}

/**
 * Registers the frontend's preview target on its consumer.
 *
 * It never throws. A failure prints a warning.
 *
 * @param {object} settings - The registration settings.
 * @param {string} [settings.baseUrl] - Drupal's base URL, druxt.baseUrl.
 * @param {object} [settings.druxt] - The druxt options. The client gets them,
 *   so the site's `druxt.axios` options apply.
 * @param {string} settings.url - The frontend's base URL.
 * @param {string} settings.label - The target's label.
 * @param {string} settings.consumer - The consumer's client ID.
 * @param {string} settings.secret - The consumer's secret.
 * @param {string} settings.path - The preview page's path.
 * @param {string[]} settings.layouts - The layouts option.
 * @param {number} settings.timeout - The timeout of each request, in
 *   milliseconds. It wins over a timeout in `druxt.axios`.
 *
 * @returns {Promise<string>} "registered", "unchanged" or "failed".
 */
export const registerTarget = async (settings) => {
  const {
    baseUrl,
    druxt = {},
    url,
    label,
    consumer,
    secret,
    path,
    layouts,
    timeout,
  } = settings
  let token
  // Hides the secret and the token, should Drupal ever echo one of them.
  const hide = (message) =>
    [secret, token]
      .filter(Boolean)
      .reduce((text, value) => text.split(value).join('[hidden]'), message)
  try {
    if (typeof baseUrl !== 'string' || !baseUrl) {
      throw new RegisterError(
        "druxt.baseUrl is not set. Set it to the Drupal site's URL."
      )
    }
    const base = baseUrl.replace(/\/+$/, '')
    const client = new DruxtClient(base, {
      ...druxt,
      axios: { ...(druxt.axios || {}), timeout },
    })
    token = await getToken(client, base, settings)

    const api = `${base}/api/consumer-node-preview/targets`
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Consumer-ID': consumer,
    }
    const current = await send(client, 'GET', api, { headers })
    checkTargets(api, current, consumer)

    const target = { label, url: targetUrl(url, path, layouts) }
    const merged = mergeTargets(current.data.targets, target)
    const wanted = [...new Set(layouts)]
    const layoutsChanged =
      wanted.length > 0 &&
      JSON.stringify(wanted) !== JSON.stringify(current.data.layouts || [])
    if (!merged.changed && !layoutsChanged) {
      info(
        `The preview target "${label}" on the consumer "${consumer}" is up to date.`
      )
      return 'unchanged'
    }

    // Without the layouts option, the body has no layouts, so Drupal keeps
    // the consumer's own.
    const body = {
      targets: merged.targets,
      ...(wanted.length ? { layouts: wanted } : {}),
    }
    const saved = await send(client, 'PUT', api, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: body,
    })
    checkTargets(api, saved, consumer)
    info(
      `Registered the preview target "${label}" on the consumer "${consumer}".`
    )
    return 'registered'
  } catch (error) {
    const message =
      error instanceof RegisterError ? error.message : `${error.message}.`
    warn(
      hide(
        `Could not register the preview target: ${message} The site keeps its current targets.`
      )
    )
    return 'failed'
  }
}

/**
 * Runs the registration once per process.
 *
 * Nuxt can run the module more than once in a process, such as when nuxt dev
 * restarts after a config change. The state lives on the process, so a fresh
 * copy of this file finds it too.
 *
 * @param {Function} run - Starts the registration, and returns its promise.
 *
 * @returns {Promise<string>} The first run's promise.
 */
export const registerOnce = (run) => {
  const key = Symbol.for('druxt-node-preview.register')
  if (!process[key]) process[key] = run()
  return process[key]
}
