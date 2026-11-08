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
https://preview.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview_path];token=[preview_token]
```

With automatic registration, set `token: true`, or
`DRUXT_NODE_PREVIEW_REGISTER_TOKEN=true`, and the module registers that URL.
A `backend` target holds the full URL, `[jsonapi_node_preview]`, instead.

The page splits the token off and sends it as a bearer token with no cookie.
This works once Drupal has Simple OAuth installed. A path goes through the
Druxt client, so on a site with `druxt.proxy.api` the request goes through
the site's own proxy, and Drupal doesn't need CORS settings for it.

Otherwise, Drupal's CORS settings must allow the `Authorization` header. The
[Druxt module](https://www.drupal.org/project/druxt) already does this on a
site that leaves CORS off: it turns CORS on for any origin and header, without
credentials. Only a site with CORS settings of its own needs to change them, as
[Consumer Node Preview's "Previewing on another
site"](https://git.drupalcode.org/project/consumer_node_preview/-/blob/1.0.x/README.md#previewing-on-another-site)
shows.

The token gets the scopes in the consumer's **Authorization Code settings**.
Set them up on the target's consumer:

1. Add a scope at
   **Administration > Configuration > People > Simple OAuth > Scopes**. Turn
   on its **Authorization Code** grant type.
   <!-- vale ai-tells.OverusedVocabulary = NO -->
   <!-- Granularity is the name of the field in Simple OAuth's scope form. -->
   Under **Granularity**, pick **Role**, and then the role your editors have.
   <!-- vale ai-tells.OverusedVocabulary = YES -->
2. Edit the consumer. Under **Grant types**, turn on **Authorization Code**,
   and set a **Redirect URI**, such as the frontend's URL. The form needs one,
   but a preview never uses it.
3. Under **Authorization Code settings**, pick the scope from step 1 in
   **Scopes**.

The **Scopes** under **Client Credentials settings** do not reach the token.
A token without an Authorization Code scope has no scopes, and the preview
fails with HTTP 403, "The 'access content' permission is required". A script
that sets the consumer's grant types must keep **Authorization Code**, or the
token is empty.

Without Simple OAuth, the token is empty, and the page reads with the
editor's session.

## Server rendering and static sites

The page only works in the browser. A server render shows "Loading
preview..." and the browser fills it in. A statically generated page has the
default layout, so the page switches to the listed layout in the browser.
