# Changelog

## 0.1.0

### Minor Changes

- 6b39690: Add the DruxtNodePreview module. It shows an unsaved Drupal node in a Druxt site, in Consumer Node Preview's Frontend tab, from the JSON:API Node Preview document.

  - Renders the unsaved node with the site's own Druxt components.
  - Includes unsaved paragraphs, and with `include`, the media they reference.
  - Lets the editor pick a Nuxt layout, such as a bare one for embedded content.
  - Wraps the preview in a component of your own, for a title or a container.
  - Reads the preview with a Simple OAuth token on a frontend on another domain.
  - Can add its own preview target to Drupal each time Nuxt starts up.
  - Lets a running frontend's target expire, and removes it when the server stops.
  - Keeps the preview page out of shared caches and search engines.
