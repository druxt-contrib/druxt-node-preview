---
'@druxt-contrib/node-preview': patch
---

The `origins` option now ignores an origin whose host has characters other than letters, digits, dots, hyphens and `_`. The page fetches from a listed origin without the Druxt client, whose headers and auth are for `druxt.baseUrl`. A preview read with a token takes the token out of the page's address as soon as it starts, and keeps it in the tab's session storage for a reload.
