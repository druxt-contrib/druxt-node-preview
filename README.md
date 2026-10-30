# @druxt-contrib/node-preview

Renders Drupal node previews in a [Druxt](https://druxtjs.org) frontend. An
editor who presses Preview in Drupal sees the unsaved content rendered by the
real frontend, paragraphs included.

Works with two Drupal modules:

- [JSON:API Node Preview](https://www.drupal.org/project/jsonapi_node_preview)
  serves the unsaved preview over JSON:API.
- [Consumer Node Preview](https://www.drupal.org/project/consumer_node_preview)
  turns Drupal's preview screen into Frontend, Drupal and JSON:API tabs, and
  frames this module's page in the Frontend tab.

## How it works

1. The editor presses Preview in Drupal. The Frontend tab frames this
   module's page, with the JSON:API preview endpoint in the URL fragment, so
   it never reaches any server log.
2. The page reads the fragment and fetches the endpoint with the editor's
   Drupal session.
3. It seeds the Druxt store with the document and its includes, then renders
   the node through a themeable `DruxtNodePreview` wrapper and `DruxtEntity`.

Because the store is seeded before `DruxtEntity` resolves, the unsaved preview
data renders through the same components as the live site.

## Requirements

- Druxt 0.25 and Druxt Entity 0.29 or later, through `druxt-site` 0.15.
- Node 16 to build the site. Druxt's schema tools do not work on newer Node.
- Drupal with Consumer Node Preview and JSON:API Node Preview. JSON:API Node
  Preview 1.0.0-beta5 and earlier serve stale or missing paragraphs. Until a
  release includes them, apply the fixes from
  https://www.drupal.org/i/3367724. `example/drupal/composer.json` applies
  them with composer-patches.
- A frontend on the same site as Drupal, such as `www.example.com` and
  `cms.example.com`. See [The request](#the-request).

## Install

```sh
npm install druxt-site @druxt-contrib/node-preview
```

A site without `druxt-site` lists `druxt-entity` in `modules` instead.

```js
// nuxt.config.js
export default {
  modules: [
    '@druxt-contrib/node-preview',
    'druxt-site',
  ],
  druxt: {
    baseUrl: 'https://drupal.example.com',
    nodePreview: {
      // The preview page's path. This is the default.
      path: '/druxt/node/preview',
      // Relationships to add to the endpoint's own include. Consumer Node
      // Preview already includes a node's paragraphs, so add what they
      // reference, such as 'field_content.field_media'. JSON:API rejects a
      // path the previewed type does not have, so key paths that only some
      // bundles have by type: { 'node--page': ['field_content.field_media'] }.
      include: [],
      // Origins the preview may come from, besides this site and the
      // baseUrl above, each a full URL such as 'https://cms.example.com'.
      // The endpoint arrives in the URL fragment, which any link can set, so
      // the page refuses every other origin.
      origins: [],
      // Nuxt layouts the preview may render in, picked with ?layout=.
      layouts: [],
    },
  },
}
```

The module reports an option value it cannot use in the build output, and
leaves it out.

The page's route name is `druxt-node-preview`. It is stable, so a site can
hook the route.

## Drupal setup

1. Install Consumer Node Preview and JSON:API Node Preview, with the fixes
   under [Requirements](#requirements).
2. Edit a consumer at **Administration > Configuration > Web services >
   Consumers**, and add a preview target that points at the page:

   ```text
   https://frontend.example.com/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview]
   ```

   `vm` holds the view mode, and `layout` the layout picked in the preview's
   Layout select. The endpoint goes in the fragment.
3. List the consumer's Preview layouts, if the site uses
   [preview layouts](#preview-layouts). The first one opens by default, so
   list `default` first.
4. Allow the frontend's origin in the site's `services.yml`, with
   credentials. `cors.config` goes under `parameters`:

   ```yaml
   parameters:
     cors.config:
       enabled: true
       allowedHeaders: ['*']
       allowedMethods: ['GET']
       allowedOrigins: ['https://frontend.example.com']
       supportsCredentials: true
   ```

5. Let Drupal show the frontend in a frame. An `X-Frame-Options` header, or a
   `frame-ancestors` rule that leaves out Drupal's origin, blocks the
   Frontend tab. A `frame-ancestors` rule that names only Drupal's origin
   also stops other sites framing the preview.

Consumer Node Preview's README covers the other tokens, and targets in
settings.php.

## Preview layouts

The page uses the layout that `?layout=` names, if `layouts` lists it.
Otherwise it uses the default layout, so a preview URL cannot put the page in
another of the site's layouts. Each listed layout must be a file in the site's
`layouts/` that renders `<Nuxt />`. A bare layout, with the site's type and
spacing but no header or footer, suits a preview of content that sits inside
other pages. `$druxtNodePreview.layout(name)` makes the same check, for a site
that picks layouts elsewhere.

## Theming the preview

A live page often adds a title or a container around the node. The preview
gets the same through a wrapper component, picked like any Druxt wrapper. For
a `node--doc_page` previewed in `full`, the first of these that exists is
used:

1. `DruxtNodePreviewDocPageFull`
2. `DruxtNodePreviewDocPage`
3. `DruxtNodePreviewDefault`

If none of them exists, the node renders in Druxt's plain wrapper.

A wrapper receives whichever of these props it declares:

- `document`: the whole JSON:API preview document.
- `entity`: the previewed resource, with `attributes` such as the title.
- `mode`, `type` and `uuid`.

Its default slot renders the node with `DruxtEntity`:

```vue
<!-- components/druxt/node-preview/DocPageFull.vue -->
<template>
  <article class="prose">
    <h1>{{ entity.attributes.title }}</h1>
    <slot />
  </article>
</template>

<script>
export default {
  // The props it does not declare would otherwise land on <article>.
  inheritAttrs: false,
  props: {
    entity: { type: Object, required: true },
  },
}
</script>
```

A wrapper named by bundle alone, such as `DruxtNodePreviewDocPage`, applies
to every view mode. So page chrome such as a title belongs in the
`<Bundle>Full` wrapper, as above, or behind the `mode` prop.

## Components that fetch their own data

The preview seeds the store, so a component that reads the store renders the
unsaved data. A component that fetches its data again, such as paragraphs
at a revision, would replace the preview with saved content. The plugin
registers a `druxtNodePreview` store module for this. Skip the refetch while a
preview is active:

```js
if ((this.$store.state.druxtNodePreview || {}).active) return
```

When the editor leaves the preview, the plugin removes the resources it
seeded from the Druxt store and clears the flag, before the next page loads.
That page then fetches the saved content.

The resources go under the route's `langcode` meta, which is where
`DruxtEntity` reads them when it has no `langcode` prop.

## The request

The page fetches through the Druxt client, `$druxt.axios`, with credentials.
The site's request interceptors apply, such as one that adds a workspace
header, and the editor's session cookie goes with the request. Without the
Druxt client, the page uses `window.fetch`.

An endpoint given as a path stays a path. The Druxt client resolves it against
its own base URL, and interceptors that decide by path still match it. That
suits a frontend that serves Drupal through a proxy on its own origin. The
editor must then sign in through that proxy too, because the session cookie
belongs to the host the editor signed in on. Druxt's `proxy: { api: true }`
forwards the API but not Drupal's sign-in pages, so it is not enough on its
own.

Without a proxy, the Druxt client sends a path to Drupal's origin, as it does
an absolute endpoint. Then Drupal needs CORS with `supportsCredentials: true`
for the frontend origin. Drupal's session cookie is `SameSite=Lax`, so the
frontend and Drupal must share a site, such as `www.example.com` and
`cms.example.com`.

The page fetches only a node preview, from an endpoint whose path ends in
`/{uuid}/preview`. It checks that the response is `application/vnd.api+json`,
and that each resource in it has a JSON:API type and a UUID. Anything else
shows an error and reaches nothing in the store.

## Server rendering

The page only works in the browser. A server render shows "Loading
preview..." and the browser fills it in. On a statically generated site, the
page sets the listed layout once it is in the browser, because the generated
page has the default one.

## Troubleshooting

The page shows "Preview unavailable" and a message.

- **HTTP 404.** Drupal has no preview of this node for the editor. The
  editor may not have pressed Preview, or may not have access to the node.
  Otherwise, the editor's session cookie did not reach Drupal. The frontend
  and Drupal must share a site. Use one host name for each: on localhost,
  `localhost` and `127.0.0.1` are different sites. Check the CORS settings
  too.
- **"The preview endpoint is not on this site or its Drupal site".** The
  endpoint's origin is not the frontend's, `druxt.baseUrl`'s or one in
  `origins`. Add it to `origins`.
- **"No preview endpoint was provided in the URL fragment".** The target URL
  has no `#[jsonapi_node_preview]`.
- **HTTP 400.** An `include` path that the previewed type does not have. Key
  that path by type.

A missing schema from `DruxtEntity` usually means the bundle has no view
display for the previewed view mode. Create the display. Drupal can also have
been unreachable when Nuxt built the schema, or `.nuxt` can hold an old one.
Restart the frontend after Drupal is up. `test/e2e/TROUBLESHOOTING.md` covers
the end to end stack.

## Writing another frontend

Consumer Node Preview's README shows how a frontend reads the document URL
from the fragment, including the `https:/` repair that some routers need.
Any link can set the fragment, so a frontend checks these before it renders
anything:

- the endpoint's origin, against its own and Drupal's;
- that the endpoint is a node preview, ending in `/{uuid}/preview`;
- that the response is JSON:API, and that each resource has a JSON:API type
  and a UUID.

This module reads `[view_mode]` and `[layout]` from the `vm` and `layout`
query parameters. They change only the presentation. The JSON:API document is
the same for each.

## Vendoring

The package contains its built `dist`. A site that vendors a copy instead of
installing it must commit `dist` too, even when the site ignores `dist`
folders.

## Example

See `example/` for a paired Drupal and Nuxt setup.

## Licence

MIT.
