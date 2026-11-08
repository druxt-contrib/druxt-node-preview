---
'@druxt-contrib/node-preview': patch
---

The preview route's server render sends `Cache-Control: no-store` and `X-Robots-Tag: noindex`, so a page cache, CDN or proxy doesn't keep an editor's draft, and the page has a `noindex` robots meta tag for a statically generated site.
