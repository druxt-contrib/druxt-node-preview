# DruxtNodePreview

Renders Drupal node previews in a [Druxt](https://druxtjs.org) frontend, so an
editor pressing Preview in Drupal sees the unsaved content rendered by the real
frontend, paragraphs included.

Works with two Drupal modules:

- [JSON:API Node Preview](https://www.drupal.org/project/jsonapi_node_preview)
  serves the unsaved preview over JSON:API.
- Consumer Node Preview lets each consumer register the frontend URLs that
  render previews, and adds the Frontend picker to Drupal's preview screen.

## How it works

1. The editor presses Preview in Drupal and picks this frontend.
2. Drupal renders an iframe at the registered target URL. The JSON:API preview
   endpoint travels in the URL fragment, so it never reaches any server log.
3. This module's page reads the fragment, fetches the endpoint with the
   editor's Drupal session, seeds the Druxt store with the document and its
   includes, and renders the node through `DruxtEntity`.

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
      // The preview page route. This is the default.
      path: '/druxt/node/preview',
      // Relationships to include in the preview request.
      include: ['field_body'],
    },
  },
}
```

Register the target on the Drupal consumer, on the consumer form or over the
Consumer Node Preview API:

```text
https://frontend.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview]
```

## Drupal requirements

- The editor's session must reach the JSON:API preview endpoint from the
  frontend origin: CORS with `supportsCredentials: true` for that origin, and
  `cookie_samesite: None` for the session cookie.
- The preview page only works in the browser. The fragment never reaches the
  server, so there is no server side rendering of previews, by design.

## Example

See `example/` for a paired Drupal and Nuxt setup.
