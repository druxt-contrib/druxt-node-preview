---
'@druxt-contrib/node-preview': patch
---

The preview page's server render sends `Cache-Control: no-store` and adds `noindex` to the site's `X-Robots-Tag`, so a page cache, CDN or proxy doesn't keep the page, and the page has a `noindex` robots meta tag for a statically generated site. The headers cover the page only: the preview itself comes from Drupal, with Drupal's cache headers. Purge a shared cache that stored the preview page before this change.
