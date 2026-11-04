# Changelog

## 0.1.0

### Minor Changes

- 6b39690: Add the DruxtNodePreview module. It renders an unsaved Drupal node in a Druxt site, in Consumer Node Preview's Frontend tab, from the JSON:API Node Preview document.
- 2c2f5a4: Add automatic registration. With the new `register` option, the frontend adds its own preview target to its Drupal consumer when Nuxt starts, over Consumer Node Preview's targets API with a Simple OAuth client credentials token. The requests go through a `DruxtClient`, so the site's `druxt.axios` options apply, and they never follow a redirect. The target sends the preview's address as a path, `[jsonapi_node_preview_path]`, so it works for an editor on Drupal's host or on the frontend's. It sends a PATCH, so the consumer's other targets stay and Drupal records the time, and it sends it again every 6 hours while Nuxt runs, so a running frontend's target stays active. The secret comes only from the `DRUXT_NODE_PREVIEW_CLIENT_SECRET` environment variable.
