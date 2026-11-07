# The preview request

The page fetches through the Druxt client, `$druxt.axios`, with credentials.
The site's request interceptors apply, such as one that adds a workspace
header. Without the Druxt client, the page uses `window.fetch`.

`[jsonapi_node_preview_path]` gives the preview's address as a path, and a path
stays a path. The Druxt client resolves it against its own base URL, and
interceptors that match by path still match it. This suits a frontend that
reaches Drupal through a proxy on its own origin. The editor must then sign in
through that proxy too, because the session cookie belongs to the host the
editor signed in on. Druxt's `proxy: { api: true }` forwards the API but not
Drupal's sign-in pages, so it is not enough on its own.

Without a proxy, the request goes to Drupal's origin, so Drupal needs CORS that
allows the frontend's origin with credentials. The session cookie is
`SameSite=Lax`, so the frontend and Drupal need one parent domain.

`[jsonapi_node_preview]`, the full URL, names the host the editor is on. On a
site that proxies JSON:API and has no CORS settings, that request is
cross-origin, and the browser blocks it.

The page only fetches a node preview, from an address that ends in
`/{uuid}/preview`. The response must be `application/vnd.api+json`, and each
resource in it must have a JSON:API type and a UUID. If a check fails, the
page shows an error and puts nothing in the store.

## Previews with a token

A frontend on another domain, or on a tunnel, never gets the editor's session.
It can read the preview with a token instead. Use Consumer Node Preview's
`[preview_token]` token in the target URL:

```text
https://preview.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview];token=[preview_token]
```

With automatic registration, set `token: true`, or
`DRUXT_NODE_PREVIEW_REGISTER_TOKEN=true`, and the module registers that URL.

The page splits the token off and sends it as a bearer token, with no cookie.
Drupal needs Simple OAuth, the Authorization Code grant on the target's
consumer, and CORS that allows the `Authorization` header.
[Consumer Node Preview's "Previewing on another
site"](https://git.drupalcode.org/project/consumer_node_preview/-/blob/1.0.x/README.md#previewing-on-another-site)
covers the scopes and the CORS settings.

Without Simple OAuth, the token is empty, and the page reads with the
editor's session.

## Server rendering and static sites

The page only works in the browser. A server render shows "Loading
preview..." and the browser fills it in. A statically generated page has the
default layout, so the page switches to the listed layout in the browser.
