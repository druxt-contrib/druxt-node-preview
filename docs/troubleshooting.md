# Troubleshooting

The preview page shows its errors under "Preview unavailable". Nuxt prints
the module's warnings in its output, after `[druxt-node-preview]`. Each
heading below is a message as the module shows it. A `...` stands for a part
that changes, such as a URL.

- [The preview page](#the-preview-page)
- [Options](#options)
- [Automatic registration](#automatic-registration)
- [A missing schema](#a-missing-schema)
- [The test stack](#the-test-stack)

## The preview page

### The Frontend tab stays blank

The frontend refused the frame. Nuxt doesn't send frame headers by default. If
your host or a module adds `X-Frame-Options`, exempt the preview path from it.
If it adds a `Content-Security-Policy`, add Drupal's origin to its
`frame-ancestors` directive, and keep the rest of the policy. Without one,
send `Content-Security-Policy: frame-ancestors 'self' https://cms.example.com`
on the preview path, with Drupal's origin, so other sites still can't frame
it.

### The frame stays on `Loading preview...`

The page shows this until the preview arrives, so either its script did not
start, or the preview request has not answered. Open the browser's network
panel in the frame. A request to the preview endpoint that stays pending
means Drupal or the network is slow. With no such request, the script did not
start: a page cache, CDN or proxy can hold an old copy of the page whose
script files are gone. Purge that copy. The editor's browser can hold one too.
Clear the browser's cache for the frontend, then press Preview in Drupal
again.

### `The URL fragment has no preview endpoint.`

The target URL has nothing after the `#`. Put `[jsonapi_node_preview_path]` or
`[jsonapi_node_preview]` after the `#`.

### `The preview endpoint is not on this site or its Drupal site: ...`

The page fetches only from its own origin, `druxt.baseUrl`, a register
`backend`, and the `origins` option. Add the preview's origin to `origins`.
With a `backend`, editors must open that Drupal site at exactly its origin:
the same scheme, host and port.

### `The preview endpoint is not a node preview: ...`

The address after the `#` does not end in `/{uuid}/preview`. Check that the
target URL uses `[jsonapi_node_preview_path]` or `[jsonapi_node_preview]`.

### `Preview request failed with HTTP 404 for ...`

Drupal has no preview of this node for the editor. Check that the editor
pressed Preview. A preview that reads with the editor's session also needs
the frontend and Drupal to share a parent domain and a scheme, or a proxy on
the frontend's origin that the editor signs in through. See [Paths and full
URLs](preview-request.md#paths-and-full-urls). On your own computer, use one
host name for both: `localhost` and `127.0.0.1` count as different. Otherwise,
a frontend on another domain needs [a
token](preview-request.md#previews-with-a-token). Then check the CORS
settings.

### `Preview request failed with HTTP 400 for ...`

The `include` option has a path that the previewed type does not have. Key
that path by type. See [Options](../README.md#options).

### `Preview request failed with HTTP 403 for ...: ... The 'access content' permission is required ...`

The request reached Drupal without the editor's permissions. With a session,
check that the editor's role has **View published content**. With a token,
the token has no role with that permission. It gets only the roles that both
its scopes and the editor have. Check that the consumer has a scope under
**Authorization Code settings**, as [Previews with a
token](preview-request.md#previews-with-a-token) shows. The **Scopes** under
**Client Credentials settings** do not reach the token. Then check that the
scope's role has **View published content**, and that the editor has the
role. A script that sets the consumer's grant types must keep **Authorization
Code**, or the token is empty.

### `Preview request failed with HTTP 401 for ...`

Drupal refused the token, most often because it expired. Press Preview in
Drupal again.

### `The preview token has expired. Press Preview in Drupal again.`

The page dropped the token, and the editor's session could not read the
preview either. The page keeps a token for 15 minutes at most, or less if the
token says it expires sooner. Press Preview in Drupal again for a new token.

### `The preview response is not a JSON:API document.`

The answer was not `application/vnd.api+json`. The address reached something
other than JSON:API, such as a sign-in page or a proxy's error page.

### `The preview response is not a node preview document.`

The answer has no `data`, or a resource in it has no JSON:API type or UUID.
Check that the address is a JSON:API Node Preview address.

### `The preview response is not a preview of ....`

The main resource's UUID differs from the one in the address. Something
between the page and Drupal, such as a proxy or cache, answered with another
document.

### `Network Error`, `Failed to fetch` or a similar network error

The browser blocked the request, or Drupal did not answer. The browser's
console says which. Check that Drupal is up, and then its CORS settings.

### `DruxtNodePreview could not load the layout: ...`

This shows in the browser's console. The layout file has a fault, so the
preview shows in the layout the page already had. Fix the layout file.

## Options

The module ignores an option value it cannot use, and Nuxt carries on.

### `Ignored the include option. Use a list of paths, such as ['field_content.field_media'].`

The `include` option, or its list for one type, is not a list.

### `Ignored the include path "...". Use field names joined by dots, such as "field_content.field_media".`

An include path has characters other than letters, digits, `_`, `-` and dots.

### `Ignored the include key "...". Key paths by JSON:API type, such as "node--page".`

A key in the `include` object is not a JSON:API type.

### `Ignored the layouts option. Use a list of layout names, such as ['preview'].`

The `layouts` option is not a list.

### `Ignored the layout "...". Use the name of a file in layouts/, such as "preview". A layout in a subfolder cannot be listed.`

A layout name has characters other than letters, digits, `_` and `-`.

### `Ignored the origins option. Use a list of full http(s) URLs, such as ['https://cms.example.com'].`

The `origins` option is not a list.

### `Ignored the origin "...". ...`

The rest of the message says why. Use a full `http` or `https` URL. Its host
may only have letters, digits, dots, hyphens and `_`, or be an IPv6 address in
brackets, such as `http://[::1]:3000`.

### `Ignored druxt.baseUrl "..." for previews. ...`

`druxt.baseUrl` is not a URL the page can use, for the same reasons as an
origin above. The page then refuses previews from that Drupal site. Fix
`druxt.baseUrl`.

## Automatic registration

### `Could not register the preview target: ...`

The module tried to register, and failed. Nuxt carries on. The rest of the
message says what went wrong.

#### `druxt.baseUrl is not set.`

Set `druxt.baseUrl` to the Drupal site's URL.

#### `connect ECONNREFUSED ...`

This, or another network error, means that Drupal is down, or that
`druxt.baseUrl`, or the `backend` if there is one, is wrong.

#### `timeout of 5000ms exceeded`

Drupal was too slow. Raise the `timeout` in Nuxt's `axios` option.

#### `Drupal redirected ... Set druxt.baseUrl to the URL Drupal redirects to.`

Drupal sent the request to another URL, such as from `http` to `https`. Set
`druxt.baseUrl` to the site's base URL from the message, without the endpoint
path. For `https://cms.example.com/oauth/token`, that is
`https://cms.example.com`. With a `backend`, the message ends
"Set the register backend to the URL Drupal redirects to." Then set the
`backend` instead.

#### `.../oauth/token answered HTTP 400 ... Check the secret, and that the consumer is confidential, allows the Client credentials grant, and has a Client credentials user.`

The same goes for HTTP 401. Check the consumer as the message says. See
step 6 of the [Drupal setup](registration-drupal-setup.md#steps). On
`druxt.baseUrl`, an `Authorization` header in Nuxt's `axios` option or in
`druxt.axios` goes with the token request too, and can cause this.

#### `.../oauth/token answered HTTP 404. Install and set up the Simple OAuth module on Drupal.`

Simple OAuth is not installed, or `druxt.baseUrl`, or the `backend`, names the
wrong site.

#### `.../oauth/token answered HTTP ...: You need to set the OAuth2 private key ...`

Simple OAuth has no keys. See step 2 of the [Drupal
setup](registration-drupal-setup.md#steps).

#### `.../oauth/token gave no access token.`

Drupal answered the token request, but without a token. Something other than
Simple OAuth answered at that path.

#### `.../api/consumer-node-preview/targets answered HTTP 403 ... The consumer's Client credentials user must own the consumer, and the token's scope must give the "register consumer node preview targets" permission.`

The same goes for HTTP 401. See steps 3 to 7 of the [Drupal
setup](registration-drupal-setup.md#steps).

#### `.../api/consumer-node-preview/targets answered HTTP 404. Check that Consumer Node Preview is installed, and that a consumer has this client ID.`

Consumer Node Preview is not installed, no consumer has that client ID, or
`druxt.baseUrl`, or the `backend`, names the wrong site.

#### `.../api/consumer-node-preview/targets answered HTTP 405. Update Consumer Node Preview. This module needs a version with the PATCH method.`

The installed Consumer Node Preview is too old to register targets this way.
Update it.

#### `.../api/consumer-node-preview/targets answered HTTP 422 ... Check the register url and the path option.`

Drupal does not accept the target's URL. Check the `url` and `path` options.
If Consumer Node Preview sets **Allowed target hosts** on its **Preview** tab,
add the frontend's host there.

### `Ignored the register option. ...`

The module did not try to register. The rest of the message names each option
or environment variable to fix:

- `Use true or an object.`
- `DRUXT_NODE_PREVIEW_URL or register.url must be the frontend's full http(s) URL, with no query or fragment.`
- `DRUXT_NODE_PREVIEW_CLIENT_ID or register.consumer must be the consumer's client ID.`
- `DRUXT_NODE_PREVIEW_REGISTER_BACKEND or register.backend must be the Drupal site's full http(s) URL.`
- `DRUXT_NODE_PREVIEW_REGISTER_TOKEN or register.token must be true or false.`
- `DRUXT_NODE_PREVIEW_CLIENT_SECRET must be the consumer's secret, in the environment that runs Nuxt.`
  With a `backend`, it names `DRUXT_NODE_PREVIEW_REGISTER_SECRET` instead.

### `Ignored register.secret. Never put the secret in nuxt.config.js.`

The module reads the secret only from the environment. Take it out of
`nuxt.config.js`. If it reached the repository, change the consumer's secret.

### `Ignored DRUXT_NODE_PREVIEW_REGISTER_INTERVAL or register.interval. Use a whole number of milliseconds, from 60000 to 2147483647.`

The module registers every 6 hours instead. Set a whole number, such as
`3600000` for an hour.

### `druxt.baseUrl uses plain HTTP, so the secret and the token cross the network unencrypted. Use https.`

Registration still runs. Use `https` for any Drupal site that is not on your
own computer. With a `backend`, the message starts "The register backend uses
plain HTTP".

## A missing schema

If `DruxtEntity` reports a missing schema:

1. Check that the content type has a display for the previewed view mode, on
   its **Manage display** tab.
2. Start Drupal. Delete `.nuxt` and restart `nuxt dev`. For production,
   rebuild and deploy.

## The test stack

The [end to end troubleshooting notes](../test/e2e/TROUBLESHOOTING.md) cover
the test stack.
