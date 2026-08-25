# E2E stack pitfalls

Every one of these was hit for real while building this suite. run.sh encodes
the fixes; this file explains them so nobody retraces the path.

## Drupal on `php -S`

- **drush `--db-url` eats the first path segment.** `sqlite://sites/default/…`
  parses `sites` as a host and installs the database into the wrong directory.
  Use `sqlite://localhost/<absolute path>`.
- **Relative sqlite paths resolve against the process cwd, not the Drupal
  root.** drush chdir's into the root; `php -S` does not. Symptom: drush says
  the site is fine while the web server redirects to the installer, and the
  page cache makes anonymous pages look healthy either way. Use an absolute
  database path.
- **Serve with an absolute router path, from the web root.** Drupal chdir's
  during boot, so a relative `.ht.router.php` argument stops resolving after
  the first request. A request served from the wrong directory is worse: its
  empty plugin discovery results are written into the persistent cache and
  poison every later request, even correct ones.
- **Bind `0.0.0.0`, keep URLs on `localhost`.** `php -S localhost:…` binds
  only `::1` here, browsers try both, and Node resolves `localhost` to
  `127.0.0.1`. Symptom: the browser works while build time fetches get
  `ECONNREFUSED`. Do not mix `localhost` and `127.0.0.1` in URLs either: they
  are different sites for cookies, and the preview fetch needs the session.
- **Dynamic requests do not get status lines in the `php -S` log.** Only
  static files do. Capture the log anyway: fatals land there.

## Drupal module interplay

- **jsonapi_resources decorates `jsonapi.include_resolver`.** druxt requires
  jsonapi_views, which requires jsonapi_resources, and the decorator does not
  forward jsonapi_node_preview's extra preview argument. Previews then serve
  saved data and silently drop never saved paragraphs. This stack removes the
  decorator via the e2e_support module. Reported upstream.
- **druxt 1.2.1 fatals against decoupled_router 2.0.7**
  (https://www.drupal.org/i/3618675). The example pins 2.0.6 until druxt
  1.2.2 releases.
- **The standard profile's article type breaks its own edit form** in this
  stack (image widget TypeError). The suite uses its own `e2e_article` type.

## Druxt frontend

- **druxt-schema fails without failing.** With the backend unreachable at
  build time, the FATAL is logged mid stream, the build continues, and the
  runtime error is a cryptic webpack `relative module ./schemas not found`,
  then `[DruxtEntity] Missing schema` in the page. Check that
  `.nuxt/schemas/` exists and is populated.
- **The toolchain is frozen on Node 16** (`.nvmrc`). Schema generation does
  not work on newer Node. run.sh uses mise to pin the frontend tier.
- **Schemas exist per actual view display.** Drupal previews default to the
  `full` view mode; if the bundle has no full display, DruxtEntity reports a
  missing schema. Create the display.
- **A stale `.nuxt` keeps an old schema.** run.sh removes it every run.
- **vue-router collapses `//` inside the URL fragment**, turning
  `#http://…` into `#http:/…`. The plugin repairs the scheme after reading
  the hash; any other frontend consuming `[jsonapi_node_preview]` needs the
  same guard.

## Playwright

- **One time login links are single use.** Log in once in global setup and
  share the storage state.
- **Drupal's autosubmit behavior can lose the race** on a freshly loaded
  page. Select, wait briefly for the navigation, then submit the form
  explicitly.
