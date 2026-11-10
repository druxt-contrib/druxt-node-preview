---
'@druxt-contrib/node-preview': patch
---

The preview page's server render adds `no-store` to the site's `Cache-Control` and `noindex` to its `X-Robots-Tag`, so a page cache, CDN or proxy doesn't keep the page, and the page has a `noindex` robots meta tag for a statically generated site. The headers cover the page only: the preview itself comes from Drupal, with Drupal's cache headers. Purge a shared cache that stored the preview page before this change.
