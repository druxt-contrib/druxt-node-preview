---
'@druxt-contrib/node-preview': patch
---

The `origins` option now ignores an origin whose host has characters other than letters, digits, dots, hyphens and `_`, unless it is an IPv6 address in brackets. The page fetches from a listed origin without the Druxt client, whose headers and auth are for `druxt.baseUrl`, unless that origin is the page's own or `druxt.baseUrl`'s. A preview read with a token takes the token out of the page's address as soon as it starts. Where the browser allows session storage, the tab keeps the token there for a reload, until it expires.
