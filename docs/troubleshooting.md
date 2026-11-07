# Troubleshooting

For errors on the preview page, see the
[README](../README.md#troubleshooting).

## Automatic registration

Automatic registration prints a warning that starts with "Could not
register the preview target", then says what went wrong:

- **"druxt.baseUrl is not set".** Set `druxt.baseUrl` to the Drupal site's
  URL.
- **"connect ECONNREFUSED" or a similar network error.** Drupal is down, or
  `druxt.baseUrl` is wrong.
- **"timeout of 5000ms exceeded".** Drupal was too slow. Raise the `timeout` in
  `druxt.axios`.
- **"Drupal redirected ...".** Drupal sent the request to another URL, such
  as from `http` to `https`. Set `druxt.baseUrl` to the URL Drupal redirects
  to.
- **"/oauth/token answered HTTP 404".** Simple OAuth is not installed.
- **"/oauth/token answered HTTP 400" or "HTTP 401".** The secret is wrong, or
  the consumer is not confidential, does not allow the Client Credentials
  grant, or has no User.
- **"You need to set the OAuth2 private key".** Simple OAuth has no keys. See
  step 2 of the [Drupal setup](registration-drupal-setup.md#steps).
- **"/api/consumer-node-preview/targets answered HTTP 404".** Consumer Node
  Preview is not installed, or no consumer has that client ID.
- **"... answered HTTP 403".** The consumer's User does not own the consumer,
  or the token's scope does not give the register permission.
- **"... answered HTTP 422".** Drupal does not accept the target's URL. Check
  the `url` and `path` options, and that the host is in Consumer Node
  Preview's **Allowed target hosts**, if the site sets any.

A warning that starts with "Ignored the register option" means that an option
is missing or wrong, so the module did not try. It names the option or the
environment variable to set. A warning that says "druxt.baseUrl uses plain
HTTP" does not stop the registration, but the secret crosses the network
unencrypted.

## A missing schema

If `DruxtEntity` reports a missing schema:

1. Check that the content type has a display for the previewed view mode, on
   its **Manage display** tab.
2. Make sure Drupal is up, then restart the frontend. Nuxt builds the schema
   when it starts, and `.nuxt` can hold an old one.

## The test stack

The [end to end troubleshooting notes](../test/e2e/TROUBLESHOOTING.md) cover
the test stack.
