# E2E stack pitfalls

run.sh applies each fix below. This file says why.

## Drupal on `php -S`

- **drush `--db-url` takes the first path segment as a host.**
  `sqlite://sites/default/...` installs the database into the wrong
  directory. Use `sqlite://localhost/<absolute path>`.
- **A relative sqlite path resolves against the process's working directory,
  not the Drupal root.** drush changes into the root, and `php -S` does not.
  drush then reports a working site while the web server redirects to the
  installer. The page cache can hide this from anonymous pages. Use an
  absolute database path.
- **Serve from the web root.** A request served from another directory
  writes empty plugin discovery results into the persistent cache, and every
  later request reads them. From the web root, core's own
  `php -S localhost:8888 .ht.router.php` works, relative router path and all.
- **Bind `127.0.0.1`, and keep URLs on `localhost`.** `php -S localhost:...`
  binds only `::1` here. Browsers try both addresses, and Node resolves
  `localhost` to `127.0.0.1`, so the browser works while build time fetches
  get `ECONNREFUSED`. Do not mix `localhost` and `127.0.0.1` in URLs either.
  They are different sites for cookies, and the preview fetch needs the
  session cookie.
- **The `php -S` log has status lines for static files only.** Keep the log
  anyway, because PHP fatal errors go there.

## Drupal modules

- **jsonapi_resources decorates `jsonapi.include_resolver`.** druxt requires
  jsonapi_views, which requires jsonapi_resources, and the decorator does not
  pass on jsonapi_node_preview's preview argument. Previews then served saved
  data and dropped paragraphs that were never saved. The include resolver
  fixes from <https://www.drupal.org/i/3367724>, which the example applies, take
  the preview flag from the route, so the decorator cannot drop it.
- **Simple OAuth needs PHP's `sodium` extension.** Its JWT library lists
  `ext-sodium`, so composer refuses to install it on a PHP without sodium.
  Install the extension. The Druxt frontend uses Simple OAuth to register its
  preview target.
- **The standard profile's Article type breaks its own edit form** in this
  stack, with an image widget TypeError. The suite uses its own `e2e_article`
  type.

## Druxt frontend

- **The Druxt frontend registers its target before the stack counts as up.**
  Nuxt waits for the registration on its ready hook. If the registration
  spec fails, read `reports/nuxt-dev.log` for the warning that starts with
  "Could not register the preview target".
- **druxt-schema does not stop the build when it fails.** With the backend
  unreachable at build time, it logs the error and the build continues. The
  page then fails with a webpack error, `relative module ./schemas not found`,
  and `[DruxtEntity] Missing schema`. Check that `.nuxt/schemas/` exists and
  holds schema files.
- **The toolchain runs on Node 16** (`.nvmrc`). Schema generation does not
  work on newer Node. run.sh uses mise to run the frontend on Node 16.
- **Druxt makes a schema per view display.** Drupal previews in the `full`
  view mode by default. If the bundle has no full display, DruxtEntity
  reports a missing schema. Create the display.
- **A stale `.nuxt` keeps an old schema.** run.sh removes it on every run.
- **vue-router collapses `//` inside the URL fragment**, so `#http://...`
  becomes `#http:/...`. The plugin repairs the scheme after it reads the
  hash. Any other frontend that reads `[jsonapi_node_preview]` needs the same
  repair.

## Playwright

- **A one-time login link works once.** Global setup logs in once and shares
  the storage state.
