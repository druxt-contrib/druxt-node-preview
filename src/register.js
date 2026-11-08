import { DruxtClient } from 'druxt'

/**
 * Registers the frontend as a preview target on its Drupal consumer.
 *
 * The site turns this on with the `register` option. When Nuxt is ready, the
 * module gets a token with Simple OAuth's client credentials grant, and sends
 * its target to Consumer Node Preview's targets API in a PATCH. Drupal replaces
 * the target with the same label, or adds it, and records the time. The module
 * sends the PATCH again on a timer, so a running frontend's target stays active.
 *
 * Every request goes through a DruxtClient, so the site's `druxt.axios` options
 * apply, but a backend gets only their timeout and proxy, and nothing from the
 * global axios defaults. No request follows a redirect, so the secret never
 * goes to another host. A failure never stops Nuxt, and no message holds the
 * secret or the token.
 */

const PREFIX = '[druxt-node-preview] '
const TIMEOUT = 5000

/**
 * The time between registrations, in milliseconds. Consumer Node Preview marks
 * a target inactive after a day, so a failed attempt or two does no harm.
 */
export const HEARTBEAT = 6 * 60 * 60 * 1000

const warn = (message) => console.warn(PREFIX + message)
const info = (message) => console.info(PREFIX + message)

const fromEnv = (env, name) => (env[name] || '').trim() || undefined

/**
 * Returns the frontend's base URL without a trailing slash, or null.
 *
 * The URL must be a full http(s) URL with no query and no fragment. It can have
 * a path, for a site under a sub path.
 *
 * @param {*} value - The URL.
 *
 * @returns {string|null} The base URL.
 */
const toBaseUrl = (value) => {
  try {
    const url = new URL(value)
    return typeof value === 'string' &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.search &&
      !url.hash
      ? (url.origin + url.pathname).replace(/\/+$/, '')
      : null
  } catch {
    return null
  }
}

/**
 * Returns the registration settings, or null when registration is off.
 *
 * The environment wins over the options, so one nuxt.config.js serves each
 * environment. The secret comes only from the environment.
 *
 * DRUXT_NODE_PREVIEW_REGISTER_BACKEND, or `backend`, is a Drupal site other
 * than druxt.baseUrl to register on. Its secret is the separate
 * DRUXT_NODE_PREVIEW_REGISTER_SECRET, so a frontend never sends its own
 * backend's secret to another site.
 *
 * DRUXT_NODE_PREVIEW_REGISTER_TOKEN, or `token`, says whether the target
 * reads the preview with a token instead of the editor's session. It is on
 * with a backend, and off otherwise.
 *
 * @param {*} value - The `register` option.
 * @param {object} env - The environment, such as process.env.
 *
 * @returns {object|null} The url, label, consumer, secret and token, and
 *   the backend when there is one.
 */
export const resolveRegister = (value, env) => {
  if (value === undefined || value === null || value === false) return null
  if (value !== true && (typeof value !== 'object' || Array.isArray(value))) {
    warn('Ignored the register option. Use true or an object.')
    return null
  }
  const options = value === true ? {} : value

  // Say nothing about the value, so the message cannot give it away.
  if (options.secret !== undefined) {
    warn(
      'Ignored druxt.nodePreview.register.secret. Never put the secret in nuxt.config.js.'
    )
  }

  const url = toBaseUrl(fromEnv(env, 'DRUXT_NODE_PREVIEW_URL') || options.url)
  const consumer =
    fromEnv(env, 'DRUXT_NODE_PREVIEW_CLIENT_ID') || options.consumer
  const rawBackend =
    fromEnv(env, 'DRUXT_NODE_PREVIEW_REGISTER_BACKEND') || options.backend
  const backend = rawBackend ? toBaseUrl(rawBackend) : null
  const secretName = rawBackend
    ? 'DRUXT_NODE_PREVIEW_REGISTER_SECRET'
    : 'DRUXT_NODE_PREVIEW_CLIENT_SECRET'
  const secret = fromEnv(env, secretName)

  const envToken = fromEnv(env, 'DRUXT_NODE_PREVIEW_REGISTER_TOKEN')
  const rawToken = envToken !== undefined ? envToken : options.token
  const token =
    rawToken === undefined
      ? Boolean(backend)
      : new Map([
          ['true', true],
          ['1', true],
          ['false', false],
          ['0', false],
        ]).get(String(rawToken))

  const problems = [
    !url &&
      "DRUXT_NODE_PREVIEW_URL or register.url must be the frontend's full http(s) URL, with no query or fragment.",
    (typeof consumer !== 'string' || !/^[\x21-\x7e]+$/.test(consumer)) &&
      "DRUXT_NODE_PREVIEW_CLIENT_ID or register.consumer must be the consumer's client ID.",
    rawBackend &&
      !backend &&
      "DRUXT_NODE_PREVIEW_REGISTER_BACKEND or register.backend must be the Drupal site's full http(s) URL.",
    token === undefined &&
      'DRUXT_NODE_PREVIEW_REGISTER_TOKEN or register.token must be true or false.',
    !secret &&
      `${secretName} must be the consumer's secret, in the environment that runs Nuxt.`,
  ].filter(Boolean)
  if (problems.length) {
    warn(`Ignored the register option. ${problems.join(' ')}`)
    return null
  }

  // The default label is the frontend's host, so local, staging and production
  // each keep their own target on a shared consumer.
  const label =
    (typeof options.label === 'string' && options.label.trim()) ||
    new URL(url).host

  return {
    url,
    label,
    consumer,
    secret,
    token,
    ...(backend ? { backend } : {}),
  }
}

/**
 * Returns the URL template of the frontend's preview target.
 *
 * Drupal replaces the tokens in square brackets for each preview. The endpoint
 * goes in as a path, which the Druxt client resolves against its own base URL.
 * So the preview works for an editor on Drupal's host or on the frontend's, and
 * through a proxy that serves Drupal on the frontend's origin.
 *
 * @param {string} url - The frontend's base URL.
 * @param {string} path - The preview page's path.
 * @param {string[]} layouts - The layouts option.
 * @param {boolean} [token] - Whether the preview reads with a token, for an
 *   editor whose session doesn't reach this frontend. The fragment then holds
 *   the endpoint's full URL and the token. A path would name the wrong site
 *   when the target is on a Drupal site other than druxt.baseUrl.
 *
 * @returns {string} The URL template.
 */
export const targetUrl = (url, path, layouts, token = false) =>
  url +
  path +
  '?vm=[view_mode]' +
  (layouts.length ? '&layout=[layout]' : '') +
  (token
    ? '#[jsonapi_node_preview];token=[preview_token]'
    : '#[jsonapi_node_preview_path]')

const CREDENTIALS =
  'Check the secret, and that the consumer is confidential, allows the Client credentials grant, and has a Client credentials user.'

// What to check for each status, by request.
const TOKEN_HINTS = {
  400: CREDENTIALS,
  401: CREDENTIALS,
  404: 'Install and set up the Simple OAuth module on Drupal.',
}
const TARGET_HINTS = {
  401: 'The consumer\'s Client credentials user must own the consumer, and the token\'s scope must give the "register consumer node preview targets" permission.',
  403: 'The consumer\'s Client credentials user must own the consumer, and the token\'s scope must give the "register consumer node preview targets" permission.',
  404: 'Check that Consumer Node Preview is installed, and that a consumer has this client ID.',
  405: 'Update Consumer Node Preview. This module needs a version with the PATCH method.',
  422: 'Check the register url and the path option.',
}

/**
 * Returns the reason Drupal or OAuth gave, after a colon, or an empty string.
 *
 * @param {*} data - The response data.
 *
 * @returns {string} The reason.
 */
const reason = (data) => {
  const text = [data?.error_description, data?.message, data?.error].find(
    (value) => typeof value === 'string' && value.trim()
  )
  return text ? `: ${text.trim().slice(0, 300)}` : ''
}

/**
 * Replaces an axios instance's defaults with ones made here.
 *
 * A new axios instance starts with a copy of the global axios defaults, and
 * axios falls back to the global adapter. Their headers, auth, params and
 * transforms can all add a credential for druxt.baseUrl. So a register backend
 * gets none of them: only an http adapter, JSON in and out, and the timeout
 * and proxy. Each request sets the headers it needs.
 *
 * @param {object} defaults - The axios instance's defaults.
 * @param {object} options - The timeout, and the proxy if there is one.
 */
const forBackend = (defaults, options) => {
  // axios 0.x gives each instance its http adapter as a function, and has no
  // adapter names. axios 1.x gives a list of names, so the backend asks for
  // its http adapter by name.
  const adapter =
    typeof defaults.adapter === 'function' ? defaults.adapter : 'http'
  for (const name of Object.keys(defaults)) delete defaults[name]
  Object.assign(defaults, {
    ...options,
    adapter,
    headers: {},
    transformRequest: [
      (data) =>
        data === undefined || typeof data === 'string'
          ? data
          : JSON.stringify(data),
    ],
    transformResponse: [
      (data) => {
        try {
          return JSON.parse(data)
        } catch {
          return data
        }
      },
    ],
  })
}

/**
 * Sends a request, and returns the data of a 200 response.
 *
 * @param {object} client - The DruxtClient.
 * @param {object} config - The axios request.
 * @param {object} hints - What to check, keyed by status.
 *
 * @returns {Promise<*>} The response data.
 */
const send = async (client, config, hints) => {
  const { status, data, headers } = await client.axios.request({
    ...config,
    maxRedirects: 0,
    validateStatus: () => true,
  })
  if (status === 200) return data
  if (status >= 300 && status < 400) {
    const location = headers?.location ? ` to ${headers.location}` : ''
    throw new Error(
      `Drupal redirected ${config.url}${location} (HTTP ${status}). Set druxt.baseUrl to the URL Drupal redirects to.`
    )
  }
  throw new Error(
    `${config.url} answered HTTP ${status}${reason(data)}. ${hints[status] || ''}`.trim()
  )
}

/**
 * Registers the frontend's preview target on its consumer.
 *
 * It never throws. A failure prints a warning.
 *
 * @param {object} settings - The settings from resolveRegister(), with the
 *   baseUrl and druxt options, and the path and layouts options. A backend
 *   wins over baseUrl.
 *
 * @returns {Promise<string>} "registered" or "failed".
 */
export const registerTarget = async ({
  baseUrl,
  backend,
  token: useToken,
  druxt = {},
  url,
  label,
  consumer,
  secret,
  path,
  layouts,
}) => {
  let token
  try {
    if (!backend && !baseUrl) throw new Error('druxt.baseUrl is not set.')
    const base = (backend || baseUrl).replace(/\/+$/, '')
    const { protocol, hostname } = new URL(base)
    if (
      protocol === 'http:' &&
      !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$|\.localhost$/.test(hostname)
    ) {
      warn(
        `${backend ? 'The register backend' : 'druxt.baseUrl'} uses plain HTTP, so the secret and the token cross the network unencrypted. Use https.`
      )
    }
    // The site's axios options are for druxt.baseUrl, so a backend gets only
    // the timeout and proxy. Its client starts from axios's own defaults, so
    // its adapter is the one axios chose.
    const { timeout = TIMEOUT, proxy } = druxt.axios || {}
    const client = new DruxtClient(base, {
      ...druxt,
      axios: backend ? { timeout } : { timeout: TIMEOUT, ...druxt.axios },
    })
    if (backend) {
      forBackend(client.axios.defaults, {
        timeout,
        ...(proxy === undefined ? {} : { proxy }),
      })
    }

    const answer = await send(
      client,
      {
        method: 'POST',
        url: `${base}/oauth/token`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        data: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: consumer,
          client_secret: secret,
        }).toString(),
      },
      TOKEN_HINTS
    )
    token = answer?.access_token
    if (!token) throw new Error(`${base}/oauth/token gave no access token.`)

    await send(
      client,
      {
        method: 'PATCH',
        url: `${base}/api/consumer-node-preview/targets`,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Consumer-ID': consumer,
        },
        // Without layouts, Drupal keeps the consumer's own.
        data: {
          target: {
            label,
            url: targetUrl(url, path, layouts, Boolean(useToken)),
          },
          ...(layouts.length ? { layouts: [...new Set(layouts)] } : {}),
        },
      },
      TARGET_HINTS
    )
    info(`Registered the preview target "${label}" on "${consumer}".`)
    return 'registered'
  } catch (error) {
    // Hides the secret and the token, should Drupal ever echo one of them.
    const message = [secret, token]
      .filter(Boolean)
      .reduce(
        (text, value) => text.split(value).join('[hidden]'),
        error.message
      )
    warn(`Could not register the preview target: ${message}`)
    return 'failed'
  }
}

/**
 * Starts the registration once per process, and repeats it on the heartbeat.
 *
 * Nuxt can run the module more than once in a process, such as when nuxt dev
 * restarts after a config change. The state lives on the process, so a fresh
 * copy of this file finds it too. The timer does not keep a build alive.
 *
 * @param {Function} run - Starts the registration, and returns its promise.
 *
 * @returns {Promise<string>} The first run's promise.
 */
export const registerOnce = (run) => {
  const key = Symbol.for('druxt-node-preview.register')
  if (!process[key]) {
    process[key] = run()
    setInterval(run, HEARTBEAT).unref?.()
  }
  return process[key]
}
