---
'@druxt-contrib/node-preview': minor
---

Add automatic registration. With the new `register` option, the frontend adds its own preview target to its Drupal consumer when Nuxt starts, over Consumer Node Preview's targets API with a Simple OAuth client credentials token. The requests go through a `DruxtClient`, so the site's `druxt.axios` options apply, and they never follow a redirect. The target sends the preview's address as a path, `[jsonapi_node_preview_path]`, so it works for an editor on Drupal's host or on the frontend's. It keeps the consumer's other targets, and the secret comes only from the `DRUXT_NODE_PREVIEW_CLIENT_SECRET` environment variable.
