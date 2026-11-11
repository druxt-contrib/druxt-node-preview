import { DruxtClient } from 'druxt'

/**
 * Registers the frontend as a preview target on its Drupal consumer.
 *
 * The site turns this on with the `register` option. When Nuxt is ready, the
 * module gets a token with Simple OAuth's client credentials grant, and sends
 * its target to Consumer Node Preview's targets API in a PATCH. Drupal replaces
 * the target with the same label, or adds it, and records the time. The module
 * sends the PATCH again on a timer, so a running frontend's target stays active.
 * A running frontend's target also expires soon after the frontend stops, and
 * a clean shutdown removes it with a DELETE.
 *
 * Every request goes through a DruxtClient, so the site's axios options apply.
 * Those are Nuxt's own `axios` option, as Druxt reads it, then `druxt.axios`.
 * A backend gets only their timeout and proxy, and nothing from the global
 * axios defaults. No request follows a redirect, so the secret never
 * goes to another host. A failure never stops Nuxt, and no message holds the
 * secret or the token.
 */

const PREFIX = '[druxt-node-preview] '
const TIMEOUT = 5000
// The longest a shutdown waits for each request, and for the whole removal.
const SHUTDOWN_TIMEOUT = 3000
const SHUTDOWN_LIMIT = 8000
const SIGNALS = ['SIGINT', 'SIGTERM']

/**
 * The default time between registrations, in milliseconds. Consumer Node
 * Preview marks a target inactive after a day by default, so a failed attempt
 * or two does no harm.
 */
export const HEARTBEAT = 6 * 60 * 60 * 1000

// The shortest time between registrations, in milliseconds.
const MIN_INTERVAL = 60 * 1000
// Node's timers take at most this, the largest 32-bit signed integer. A larger
// delay runs the timer every millisecond instead.
const MAX_INTERVAL = 2147483647

const warn = (message) => console.warn(PREFIX + message)
const info = (message) => console.info(PREFIX + message)

const fromEnv = (env, name) => (env[name] || '').trim() || undefined

/**
 * Returns a setting from the environment, or else the option.
 *
 * @param {object} env - The environment.
 * @param {string} name - The environment variable.
 * @param {*} option - The option's value.
 *
 * @returns {*} The setting, or undefined when neither is set.
 */
const setting = (env, name, option) => {
  const value = fromEnv(env, name)
  return value === undefined ? option : value
}

/**
 * Returns a number of milliseconds from the environment, or else the option.
 *
 * The environment holds only strings, so its value is read as a number. An
 * option must be a number already.
 *
 * @param {object} env - The environment.
 * @param {string} name - The environment variable.
 * @param {*} option - The option's value.
 *
 * @returns {*} The number, NaN when the environment's value is not a whole
 *   number, the option as it is, or undefined when neither is set.
 */
const milliseconds = (env, name, option) => {
  const value = fromEnv(env, name)
  if (value === undefined) return option
  return /^\d+$/.test(value) ? Number(value) : NaN
}

/**
 * Returns true or false, from the environment or an option.
 *
 * @param {*} value - The setting.
 *
 * @returns {boolean|undefined} The value, or undefined when it is neither.
 */
const toBoolean = (value) =>
  new Map([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ]).get(String(value))

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
 * Returns the backend that the register option names, or null.
 *
 * It needs no secret. The build makes the preview page, and the page must
 * accept previews from the backend even when only `nuxt start` has the secret.
 *
 * @param {*} value - The `register` option.
 * @param {object} env - The environment, such as process.env.
 *
 * @returns {string|null} The backend's base URL.
 */
export const resolveBackend = (value, env) => {
  const options = registerOptions(value)
  const raw = options && rawBackend(options, env)
  return raw ? toBaseUrl(raw) : null
}

/**
 * Returns the register option as an object, or null when it is not one.
 *
 * `true` takes every setting from the environment, so it is an empty object.
 *
 * @param {*} value - The `register` option.
 *
 * @returns {object|null} The options.
 */
const registerOptions = (value) => {
  if (value === true) return {}
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null
}

/**
 * Returns the backend as set, before it is checked. The environment wins.
 *
 * @param {object} options - The register options.
 * @param {object} env - The environment.
 *
 * @returns {*} The backend's URL as set, or undefined.
 */
const rawBackend = (options, env) =>
  fromEnv(env, 'DRUXT_NODE_PREVIEW_REGISTER_BACKEND') || options.backend

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
 * DRUXT_NODE_PREVIEW_REGISTER_INTERVAL, or `interval`, is the time between
 * registrations in milliseconds. A site whose Consumer Node Preview marks
 * targets inactive sooner than a day sets it lower.
 *
 * DRUXT_NODE_PREVIEW_REGISTER_EXPIRES_IN, or `expiresIn`, is how long Drupal
 * keeps the target after each registration, in milliseconds, or 0 for no
 * time of its own. DRUXT_NODE_PREVIEW_REGISTER_CLEANUP, or `cleanup`, says
 * whether a clean shutdown removes the target. A server that keeps running,
 * as with nuxt dev and nuxt start, registers again on the interval. So by
 * default its target expires after twice the interval, and goes when it
 * stops. A build registers once, so by default its target stays.
 *
 * @param {*} value - The `register` option.
 * @param {object} env - The environment, such as process.env.
 * @param {object} [process] - The Nuxt process.
 * @param {boolean} [process.server] - Whether it keeps running as a server.
 *
 * @returns {object|null} The url, label, consumer, secret, token, interval,
 *   expiresIn and cleanup, and the backend when there is one.
 */
export const resolveRegister = (value, env, { server = false } = {}) => {
  if (value === undefined || value === null || value === false) return null
  const options = registerOptions(value)
  if (!options) {
    warn('Ignored the register option. Use true or an object.')
    return null
  }

  // Say nothing about the value, so the message cannot give it away.
  if (options.secret !== undefined) {
    warn('Ignored register.secret. Never put the secret in nuxt.config.js.')
  }

  const url = toBaseUrl(fromEnv(env, 'DRUXT_NODE_PREVIEW_URL') || options.url)
  const consumer =
    fromEnv(env, 'DRUXT_NODE_PREVIEW_CLIENT_ID') || options.consumer
  const setBackend = rawBackend(options, env)
  const backend = setBackend ? toBaseUrl(setBackend) : null
  const secretName = setBackend
    ? 'DRUXT_NODE_PREVIEW_REGISTER_SECRET'
    : 'DRUXT_NODE_PREVIEW_CLIENT_SECRET'
  const secret = fromEnv(env, secretName)

  const rawToken = setting(
    env,
    'DRUXT_NODE_PREVIEW_REGISTER_TOKEN',
    options.token
  )
  const token = rawToken === undefined ? Boolean(backend) : toBoolean(rawToken)

  const problems = [
    !url &&
      "DRUXT_NODE_PREVIEW_URL or register.url must be the frontend's full http(s) URL, with no query or fragment.",
    (typeof consumer !== 'string' || !/^[\x21-\x7e]+$/.test(consumer)) &&
      "DRUXT_NODE_PREVIEW_CLIENT_ID or register.consumer must be the consumer's client ID.",
    setBackend &&
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

  // A bad interval, expiry or cleanup is not worth stopping registration for.
  const rawInterval = milliseconds(
    env,
    'DRUXT_NODE_PREVIEW_REGISTER_INTERVAL',
    options.interval
  )
  let interval = HEARTBEAT
  if (rawInterval !== undefined) {
    if (
      Number.isInteger(rawInterval) &&
      rawInterval >= MIN_INTERVAL &&
      rawInterval <= MAX_INTERVAL
    ) {
      interval = rawInterval
    } else {
      warn(
        `Ignored DRUXT_NODE_PREVIEW_REGISTER_INTERVAL or register.interval. Use a whole number of milliseconds, from ${MIN_INTERVAL} to ${MAX_INTERVAL}.`
      )
    }
  }

  // The target must outlast the time to the next registration, or it would
  // leave the picker while the frontend still runs.
  const rawExpiresIn = milliseconds(
    env,
    'DRUXT_NODE_PREVIEW_REGISTER_EXPIRES_IN',
    options.expiresIn
  )
  let expiresIn = server ? interval * 2 : 0
  if (rawExpiresIn !== undefined) {
    if (
      rawExpiresIn === 0 ||
      (Number.isSafeInteger(rawExpiresIn) && rawExpiresIn > interval)
    ) {
      expiresIn = rawExpiresIn
    } else {
      warn(
        `Ignored DRUXT_NODE_PREVIEW_REGISTER_EXPIRES_IN or register.expiresIn. Use 0 for no expiry, or a whole number of milliseconds above the interval, ${interval}.`
      )
    }
  }

  const rawCleanup = setting(
    env,
    'DRUXT_NODE_PREVIEW_REGISTER_CLEANUP',
    options.cleanup
  )
  let cleanup = server
  if (rawCleanup !== undefined) {
    if (toBoolean(rawCleanup) === undefined) {
      warn(
        'Ignored DRUXT_NODE_PREVIEW_REGISTER_CLEANUP or register.cleanup. Use true or false.'
      )
    } else {
      cleanup = toBoolean(rawCleanup)
    }
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
    interval,
    expiresIn,
    cleanup,
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
 *   the token after the endpoint.
 * @param {boolean} [backend] - Whether the target is on a Drupal site other
 *   than druxt.baseUrl. A path would name the wrong site, so the fragment
 *   holds the endpoint's full URL instead.
 *
 * @returns {string} The URL template.
 */
export const targetUrl = (url, path, layouts, token = false, backend = false) =>
  url +
  path +
  '?vm=[view_mode]' +
  (layouts.length ? '&layout=[layout]' : '') +
  (backend ? '#[jsonapi_node_preview]' : '#[jsonapi_node_preview_path]') +
  (token ? ';token=[preview_token]' : '')

const CREDENTIALS =
  'Check the secret, and that the consumer is confidential, allows the Client credentials grant, and has a Client credentials user.'

// What to check for each status, by request.
const TOKEN_HINTS = {
  400: CREDENTIALS,
  401: CREDENTIALS,
  404: 'Install and set up the Simple OAuth module on Drupal.',
}
const OWNER =
  'The consumer\'s Client credentials user must own the consumer, and the token\'s scope must give the "register consumer node preview targets" permission.'

const TARGET_HINTS = {
  401: OWNER,
  403: OWNER,
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
 * Returns the site's axios options for druxt.baseUrl.
 *
 * Druxt 0.25 takes them from Nuxt's own `axios` option, for @nuxtjs/axios,
 * and deprecates `druxt.axios`. So Nuxt's option wins, and `druxt.axios` fills
 * what it leaves out. Nuxt's `proxy` turns on @nuxtjs/proxy. It is not an
 * axios proxy, so it is left out.
 *
 * @param {*} nuxt - Nuxt's axios option.
 * @param {*} druxt - The druxt.axios option.
 *
 * @returns {object} The axios options.
 */
const siteAxios = (nuxt, druxt) => {
  const object = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  // eslint-disable-next-line no-unused-vars
  const { proxy, ...own } = object(nuxt)
  return { ...object(druxt), ...own }
}

/**
 * Sends a request, and returns the data of a 200 response.
 *
 * @param {object} client - The DruxtClient.
 * @param {object} config - The axios request.
 * @param {object} hints - What to check, keyed by status.
 * @param {string} site - What to set to the URL Drupal redirects to.
 *
 * @returns {Promise<*>} The response data.
 */
const send = async (client, config, hints, site) => {
  const { status, data, headers } = await client.axios.request({
    ...config,
    maxRedirects: 0,
    validateStatus: () => true,
  })
  if (status === 200) return data
  if (status >= 300 && status < 400) {
    const location = headers?.location ? ` to ${headers.location}` : ''
    throw new Error(
      `Drupal redirected ${config.url}${location} (HTTP ${status}). Set ${site} to the URL Drupal redirects to.`
    )
  }
  throw new Error(
    `${config.url} answered HTTP ${status}${reason(data)}. ${hints[status] || ''}`.trim()
  )
}

/**
 * Returns a client for the Drupal site the target is on, and a token for it.
 *
 * @param {object} settings - The settings, as for registerTarget().
 * @param {number} [cap] - The longest each request may take, in milliseconds.
 *
 * @returns {Promise<object>} The client, the base URL, the token, and what to
 *   set to the URL Drupal redirects to.
 */
const connect = async (
  { baseUrl, backend, druxt = {}, axios, consumer, secret },
  cap = Infinity
) => {
  if (!backend && !baseUrl) throw new Error('druxt.baseUrl is not set.')
  const base = (backend || baseUrl).replace(/\/+$/, '')
  const redirectTo = backend ? 'the register backend' : 'druxt.baseUrl'
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
  const site = siteAxios(axios, druxt.axios)
  const { proxy } = site
  const timeout = Math.min(site.timeout ?? TIMEOUT, cap)
  const client = new DruxtClient(base, {
    ...druxt,
    axios: backend ? { timeout } : { ...site, timeout },
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
    TOKEN_HINTS,
    redirectTo
  )
  const token = answer?.access_token
  if (!token) throw new Error(`${base}/oauth/token gave no access token.`)
  return { client, base, token, redirectTo }
}

/**
 * Returns an error's message without the secret, the token, or any user name
 * and password in a URL, such as druxt.baseUrl's.
 *
 * Drupal could echo the secret or the token in an answer.
 *
 * @param {Error} error - The error.
 * @param {string[]} values - The secret, and the token if there is one.
 *
 * @returns {string} The message.
 */
const hidden = (error, values) =>
  values
    .filter(Boolean)
    .reduce((text, value) => text.split(value).join('[hidden]'), error.message)
    // Up to the last "@" before the path, because a password can hold one.
    .replace(/(\/\/)[^/?#\s]*@/g, '$1')

/**
 * Returns the headers of a request to the targets API.
 *
 * @param {string} token - The access token.
 * @param {string} consumer - The consumer's client ID.
 *
 * @returns {object} The headers.
 */
const targetHeaders = (token, consumer) => ({
  Accept: 'application/json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-Consumer-ID': consumer,
})

/**
 * Registers the frontend's preview target on its consumer.
 *
 * It never throws. A failure prints a warning.
 *
 * @param {object} settings - The settings from resolveRegister(), with the
 *   baseUrl and druxt options, Nuxt's axios option, and the path and layouts
 *   options. A backend wins over baseUrl.
 *
 * @returns {Promise<string>} "registered" or "failed".
 */
export const registerTarget = async (settings) => {
  const { backend, token: useToken, url, label, consumer, secret } = settings
  const { path, layouts, expiresIn = 0 } = settings
  let token
  try {
    const connection = await connect(settings)
    token = connection.token
    const { client, base, redirectTo } = connection
    await send(
      client,
      {
        method: 'PATCH',
        url: `${base}/api/consumer-node-preview/targets`,
        headers: targetHeaders(token, consumer),
        // Without layouts, Drupal keeps the consumer's own. Drupal takes the
        // expiry in seconds, and a version without expiry ignores it.
        data: {
          target: {
            label,
            url: targetUrl(
              url,
              path,
              layouts,
              Boolean(useToken),
              Boolean(backend)
            ),
            ...(expiresIn > 0
              ? { expires_in: Math.ceil(expiresIn / 1000) }
              : {}),
          },
          ...(layouts.length ? { layouts: [...new Set(layouts)] } : {}),
        },
      },
      TARGET_HINTS,
      redirectTo
    )
    info(`Registered the preview target "${label}" on "${consumer}".`)
    return 'registered'
  } catch (error) {
    warn(
      `Could not register the preview target: ${hidden(error, [secret, token])}`
    )
    return 'failed'
  }
}

const REMOVE_HINTS = {
  ...TARGET_HINTS,
  405: 'This version of Consumer Node Preview cannot remove a target, so the target stays until Drupal deletes it. Update Consumer Node Preview.',
  422: 'Check the register label.',
}

/**
 * Removes the frontend's preview target from its consumer.
 *
 * A clean shutdown calls it. Each request has a short timeout, so it never
 * holds the shutdown up for long. It never throws. A failure prints a
 * warning, and the target then stays until it expires.
 *
 * @param {object} settings - The settings, as for registerTarget().
 *
 * @returns {Promise<string>} "removed" or "failed".
 */
export const removeTarget = async (settings) => {
  const { label, consumer, secret } = settings
  let token
  try {
    const connection = await connect(settings, SHUTDOWN_TIMEOUT)
    token = connection.token
    const { client, base, redirectTo } = connection
    await send(
      client,
      {
        method: 'DELETE',
        url: `${base}/api/consumer-node-preview/targets`,
        headers: targetHeaders(token, consumer),
        data: { target: { label } },
      },
      REMOVE_HINTS,
      redirectTo
    )
    info(`Removed the preview target "${label}" from "${consumer}".`)
    return 'removed'
  } catch (error) {
    warn(
      `Could not remove the preview target: ${hidden(error, [secret, token])}`
    )
    return 'failed'
  }
}

// The registration's state lives on the process. See registerOnce().
const RUN = Symbol.for('druxt-node-preview.register')
const TIMER = Symbol.for('druxt-node-preview.register.timer')
const PENDING = Symbol.for('druxt-node-preview.register.pending')
const CLEANUP = Symbol.for('druxt-node-preview.cleanup')
const REMOVE = Symbol.for('druxt-node-preview.cleanup.remove')
const REMOVING = Symbol.for('druxt-node-preview.removing')
const ATTEMPT = Symbol.for('druxt-node-preview.removing.attempt')

/**
 * Starts the registration once per process, and repeats it on an interval.
 *
 * Nuxt can run the module more than once in a process, such as when nuxt dev
 * restarts after a config change. The state lives on the process, so a fresh
 * copy of this file finds it too. The timer does not keep a build alive.
 *
 * @param {Function} run - Starts the registration, and returns its promise.
 * @param {number} [interval] - The milliseconds between registrations.
 *
 * @returns {Promise<string>} The first run's promise.
 */
export const registerOnce = (run, interval = HEARTBEAT) => {
  // A removal still under way, such as nuxt dev's close before a restart,
  // ends first, DELETE and all, so it can't remove this registration.
  if (process[ATTEMPT]) {
    return process[ATTEMPT].then(() => registerOnce(run, interval))
  }
  if (!process[RUN]) {
    // Every registration still running, so a removal can wait for them all.
    const pending = (process[PENDING] = new Set())
    const tracked = () => {
      const registration = Promise.resolve(run())
      pending.add(registration)
      const done = () => pending.delete(registration)
      registration.then(done, done)
      return registration
    }
    process[RUN] = tracked()
    process[TIMER] = setInterval(tracked, interval)
    process[TIMER].unref?.()
  }
  return process[RUN]
}

/**
 * Stops registering and removes the target, once.
 *
 * It waits for every registration that is still running, the first and
 * any repeat, so no PATCH lands after the DELETE. Its promise settles after
 * a few seconds at most, so a shutdown never waits long. A second call while
 * it runs gets the same promise. Once the DELETE itself has ended,
 * registerOnce() registers again, as a nuxt dev that restarts after a config
 * change needs.
 *
 * @param {Function} remove - Removes the target, and returns its promise.
 *
 * @returns {Promise<void>} Settles when the target is removed, or the time
 *   is up.
 */
export const removeRegistered = (remove) => {
  if (process[REMOVING]) return process[REMOVING]
  if (!process[RUN]) return Promise.resolve()
  clearInterval(process[TIMER])
  // removeTarget() never rejects, but a removal that did must still end, or
  // the next registration would never run.
  const attempt = Promise.allSettled([
    process[RUN],
    ...(process[PENDING] || []),
  ])
    .then(remove)
    .catch(() => {})
    .then(() => {
      for (const key of [RUN, TIMER, PENDING, REMOVING, ATTEMPT]) {
        delete process[key]
      }
    })
  process[ATTEMPT] = attempt
  let timer
  process[REMOVING] = Promise.race([
    attempt,
    new Promise((resolve) => {
      timer = setTimeout(resolve, SHUTDOWN_LIMIT)
    }),
  ]).then(() => clearTimeout(timer))
  return process[REMOVING]
}

/**
 * Removes the target when the process gets SIGINT or SIGTERM.
 *
 * It listens once per process, and removes with the latest copy's remove,
 * so a nuxt dev that restarted uses its new settings. A copy with cleanup
 * off passes null, and nothing is removed. On a signal, it removes the
 * target with removeRegistered(). Then it sends the signal again, so the
 * process stops as it would have. A server of the site's own that exits from
 * its own handler awaits nuxt.close() first, which removes the target too.
 *
 * @param {Function|null} remove - Removes the target, and returns its
 *   promise, or null for no removal.
 */
export const removeOnShutdown = (remove) => {
  process[REMOVE] = remove
  if (process[CLEANUP] || !remove) return
  const stop = async (signal) => {
    for (const name of SIGNALS) process.removeListener(name, stop)
    if (process[REMOVE]) await removeRegistered(process[REMOVE])
    // The signal goes out again, now that this listener has gone. With no
    // listener left, Node stops the process. signal-exit 3, which nuxt dev
    // loads, stops it only when its own listeners are the only ones, so it
    // needs this second signal. A site's own listener gets both.
    process.kill(process.pid, signal)
  }
  process[CLEANUP] = stop
  for (const name of SIGNALS) process.on(name, stop)
}
