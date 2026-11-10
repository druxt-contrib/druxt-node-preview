# The preview request

## The Druxt client and window.fetch

The page sends the request through the Druxt client, `$druxt.axios`, when the
preview's address is on the frontend's own origin or on `druxt.baseUrl`'s.
The client's settings apply, including its request interceptors: functions
that change each request before it goes, such as one that adds a workspace
header.

Any other origin, such as a register `backend` or one in the `origins`
option, gets `window.fetch` instead, because the client's headers and auth are
for `druxt.baseUrl`. So does any request on a site without the Druxt client.
`window.fetch` resolves a path against the frontend's own origin, not
`druxt.baseUrl`. So a site without the Druxt client or a proxy needs the full
URL, `[jsonapi_node_preview]`, with Drupal's origin in the `origins` option.

## Paths and full URLs

`[jsonapi_node_preview_path]` gives the preview's address as a path, and a path
stays a path. The Druxt client resolves it against its own base URL, and
interceptors that match by path still match it. This suits a frontend that
reaches Drupal through a proxy on its own origin. The editor must then sign in
through that proxy too, because the session cookie belongs to the host the
editor signed in on. Druxt's `proxy: { api: true }` forwards the API but not
Drupal's sign-in pages, so it is not enough on its own.

Without a proxy, the request goes to Drupal's origin, so Drupal needs CORS that
allows the frontend's origin with credentials. Drupal's session cookie is
`SameSite=Lax` by default, so the frontend and Drupal need one parent domain and the same
scheme, `https` for both.

`[jsonapi_node_preview]`, the full URL, names the Drupal host the editor is
on. Unless that host has the frontend's own scheme, host and port, the request
is cross-origin, and Drupal needs CORS settings for it, even on a site that
proxies JSON:API.

## The checks

Before it sends a request, the page checks the preview's address. It must be
on the frontend's own origin, `druxt.baseUrl`, a register `backend`, or an
origin in the `origins` option, and it must end in `/{uuid}/preview`. The
response must be `application/vnd.api+json`. Each resource in it must have a
JSON:API type and a UUID, and the main resource's UUID must be the one in the
address. If a check fails, the page shows an error and puts nothing in the
store. [Troubleshooting](troubleshooting.md#the-preview-page) lists the errors.

## Previews with a token

A frontend on another domain, or on a tunnel, never gets the editor's session.
It can read the preview with a token instead. Use Consumer Node Preview's
`[preview_token]` token in the target URL:

```text
https://preview.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview_path];token=[preview_token]
```

With automatic registration, set `register.token: true`, or
`DRUXT_NODE_PREVIEW_REGISTER_TOKEN=true`, and the module registers that URL.
A `backend` target holds the full URL, `[jsonapi_node_preview]`, instead.

### Frames, and how long the page keeps a token

The page uses a token only inside a frame from an allowed origin: its own,
`druxt.baseUrl`'s, or one in the `origins` option, which includes a register
`backend`. Drupal's preview screen is such a frame. Opened any other way, such
as from a link, the page takes the token out and ignores it. It then reads the
preview with the editor's session.

As soon as the page starts, it takes the token out of its address and its
route. So an error tracker, session recorder or analytics page view on the
page doesn't log it. The page keeps the token for 15 minutes at most, in the
tab's session storage where the browser allows it, so a reload of the frame
still previews. It forgets the token when the editor leaves the preview. After
that, a reload needs a fresh preview from Drupal.

A script that runs before the page's plugins, such as one in the page head,
can still read the token. Keep such scripts off the preview route, or stop
them recording its address.

A site's own code can call `$druxtNodePreview.takeToken()`. It returns the
token the page would send, or `null` when the page reads with the session.

### Sending the token

The page sends the token as a bearer token, without credentials, so a request
to another origin doesn't send a cookie. A path through the site's own proxy
is a same-origin request, so the Druxt client still sends the frontend's own
cookies with it. `window.fetch` sends none. A request interceptor must keep
an `Authorization` header that is already set, or Drupal gets the wrong
token. This works once Drupal has Simple OAuth installed. On a site
with `druxt.proxy.api`, a path goes through the site's own proxy, and Drupal
doesn't need CORS settings for it.

Otherwise, Drupal's CORS settings must allow the `Authorization` header. The
[Druxt module](https://www.drupal.org/project/druxt) already does this on a
site that leaves CORS off: it turns CORS on for any origin and header, without
credentials. A site without the Druxt module, or with CORS settings of its
own, must allow the frontend's origin and the header itself. See [Consumer
Node Preview's "Previewing on another
site"](https://git.drupalcode.org/project/consumer_node_preview/-/blob/1.0.x/README.md#previewing-on-another-site).

### The token's scope

The token acts for the editor, with the permissions of the scopes in the
consumer's **Authorization Code settings**. It gets only the roles that both
the scope and the editor have. So give the scope a role made for previews,
rather than your editors' own role. Then a token that leaks can read previews,
and nothing else the editors can do.

1. Add a role, such as Previewer, with only what previews need. That is
   **View published content**, and the create and edit permissions for each content
   type editors preview, because Drupal lets only an editor who can create or
   edit a node preview it. Add **View own unpublished content** for drafts, and **View
   media** if previews show media. Give the role to your editors.
2. Add a scope at
   **Administration > Configuration > People > Simple OAuth > Scopes**. Turn
   on its **Authorization Code** grant type.
   <!-- vale ai-tells.OverusedVocabulary = NO -->
   <!-- Granularity is the name of the field in Simple OAuth's scope form. -->
   Under **Granularity**, pick **Role**, and then the role from step 1.
   <!-- vale ai-tells.OverusedVocabulary = YES -->
3. Edit the consumer. Under **Grant types**, turn on **Authorization Code**,
   and set a **Redirect URI**, such as the frontend's URL. The form needs one,
   but a preview never uses it.
4. Under **Authorization Code settings**, pick the scope from step 2 in
   **Scopes**.

Keep the token's lifetime short, on Consumer Node Preview's **Preview** tab.
It is 15 minutes by default, and anyone who has the token can use it until
then. The page still keeps a token 15 minutes at most, so a longer lifetime
doesn't let a reload of the frame preview for longer.

The **Scopes** under **Client Credentials settings** do not reach the token.
A token without an Authorization Code scope fails with HTTP 403. See
[Troubleshooting](troubleshooting.md#preview-request-failed-with-http-403-for---the-access-content-permission-is-required-).

Without Simple OAuth, the token is empty, and the page reads with the
editor's session.

## Server rendering and static sites

The page only works in the browser. A server render shows "Loading
preview..." and the browser fills it in. A statically generated page has the
default layout, so the page switches to the listed layout in the browser.

Each preview is one editor's unsaved draft, so the preview page's server
render adds `no-store` to any `Cache-Control` directives the site has set,
and `noindex` to any `X-Robots-Tag` directives. A page cache, CDN or proxy in
front of Nuxt then doesn't store the page, and search engines don't index it.
The headers cover the page only. The preview itself comes from Drupal in a
request of its own, with Drupal's cache headers. The page sets the headers in
its middleware, a function Nuxt runs on the server before it renders the page.

On a statically generated site, files have no headers, so the page has a
`<meta name="robots" content="noindex">` tag instead, beside any robots tag of
the site's own. Set the headers for the preview path on the static host as
well, `Cache-Control: no-store` and `X-Robots-Tag: noindex`. A site with
`ssr: false` needs them most, even when Nuxt serves it. Its middleware runs
only in the browser, and its HTML doesn't have the tag, which the page adds
only once its script runs.

A custom server that sends headers before Nuxt renders must set both itself.
A host's `render:route` hook that sets `Cache-Control` must keep `no-store`.

A cache or browser can still hold an old copy of the page. If the frame stays
on "Loading preview...", see
[Troubleshooting](troubleshooting.md#the-frame-stays-on-loading-preview).
