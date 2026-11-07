---
'@druxt-contrib/node-preview': minor
---

Read a preview with Consumer Node Preview's `[preview_token]` from the URL fragment, so a frontend on another domain or a tunnel previews without the editor's session. The new `register.token` option registers that form of the target URL, and `register.backend` registers on a Drupal site other than `druxt.baseUrl`, with its own secret.
