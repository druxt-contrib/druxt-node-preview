---
'@druxt-contrib/node-preview': minor
---

Add automatic registration. With the new `register` option, the frontend adds its own preview target to its Drupal consumer when Nuxt starts, over Consumer Node Preview's targets API with a Simple OAuth client credentials token. The requests go through a `DruxtClient`, so the site's `druxt.axios` options apply, and they never follow a redirect. It keeps the consumer's other targets. The client ID can come from druxt-auth's settings, and the secret comes only from the `DRUXT_NODE_PREVIEW_CLIENT_SECRET` environment variable.
