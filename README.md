# DruxtNodePreview

Renders Drupal node previews in a [Druxt](https://druxtjs.org) frontend, so an
editor pressing Preview in Drupal sees the unsaved content rendered by the real
frontend, paragraphs included.

Works with two Drupal modules:

- [JSON:API Node Preview](https://www.drupal.org/project/jsonapi_node_preview)
  serves the unsaved preview over JSON:API.
- Consumer Node Preview turns Drupal's preview screen into Frontend, Drupal and
  JSON:API tabs, and frames this module's page in the Frontend tab.

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

## Install

```sh
npm install @druxt-contrib/node-preview
```

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
      // reference, for example 'field_content.field_media'.
      include: [],
      // Origins the preview may come from, besides this site and the
      // baseUrl above, each a full URL such as 'https://cms.example.com'.
      // The endpoint arrives in the URL fragment, which any link can set, so
      // the page refuses every other origin.
      origins: [],
    },
  },
}
```

The page's route name is `druxt-node-preview`. It is stable, so a site can
hook the route.

In Drupal, add a Consumer Node Preview target that points at the page:

```text
https://frontend.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview]
```

`vm` holds the view mode, and the endpoint goes in the fragment.

## Theming the preview

A live page often adds a title or a container around the node. The preview
gets the same through a wrapper component, picked like any Druxt wrapper. For a `node--doc_page` previewed in
`full`, the first of these that exists is used:

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

## The request

The page fetches through the Druxt client, `$druxt.axios`, with credentials.
The site's request interceptors apply, such as one that adds a workspace
header, and the editor's session cookie goes with the request. Without the
Druxt client, the page uses `window.fetch`.

An endpoint given as a path stays a path. The Druxt client resolves it against
its own base URL, and interceptors that decide by path still match it. That
suits a frontend that serves Drupal through a proxy on its own origin. The
editor must then sign in through that proxy too, because the session cookie
belongs to the host the editor signed in on.

With an absolute endpoint on another origin, Drupal needs CORS with
`supportsCredentials: true` for the frontend origin. Drupal's session cookie
is `SameSite=Lax`, so the frontend and Drupal must share a site, such as
`www.example.com` and `cms.example.com`.

JSON:API Node Preview 1.0.0-beta5 and earlier serve stale or missing
paragraphs. Until a release includes them, apply the fixes from
https://www.drupal.org/i/3367724. `example/drupal/composer.json` applies them
with composer-patches.

## Server rendering

The page only works in the browser. The fragment never reaches the server, so
a server render shows "Loading preview..." and the browser fills it in.

## Vendoring

The package contains its built `dist`. A site that vendors a copy instead of
installing it must commit `dist` too, even when the site ignores `dist`
folders.

## Example

See `example/` for a paired Drupal and Nuxt setup.
