# DruxtNodePreview example

A paired Drupal and Nuxt setup for trying the preview flow end to end.
Each block of commands starts in this `example` directory.

The Nuxt app runs against either of two backends, and the choice decides what
you can see:

- The mock Drupal the app starts for itself needs only Node. It doesn't serve
  a preview endpoint, so this shows a Druxt site on a mock backend.
  [The Nuxt app](#the-nuxt-app) has it.
- The Drupal site below is what the preview flow needs.
  [Against the Drupal site](#against-the-drupal-site) has it, and the Drupal
  section is a prerequisite for that rather than for the mock.

## Drupal

`drupal/composer.json` builds a Drupal site with Consumer Node Preview,
Paragraphs, Druxt and Simple OAuth, from Drupal.org. Simple OAuth needs PHP's
`sodium` extension. Consumer Node Preview comes from its
`1.0.x-dev` release. JSON:API Node Preview gets the paragraph fixes from
<https://www.drupal.org/i/3367724> as a patch. Without them, a preview shows the
saved paragraphs, not the edited ones.

```sh
cd drupal
composer install
vendor/bin/drush site:install standard -y --db-url=sqlite://localhost//tmp/druxt-node-preview-example.sqlite
vendor/bin/drush recipe ../recipes/druxt_node_preview_example
# site:install makes sites/default read-only, and services.yml goes there.
chmod u+w web/sites/default
```

The `druxt_node_preview_example` recipe installs the modules, and lets
anonymous users read the site's schema, as the Druxt frontend does. It adds a
Text paragraph type, a Landing page content type with a Content field of
paragraphs, and a Landing page with two paragraphs to preview. Its Example
frontend consumer has a preview target for the Nuxt app below, and lists the
`default` and `preview` layouts. The first opens by default, and the example
app has a bare `preview` layout. The recipe also sets up the consumer for
automatic registration. It adds a Preview target registrar role and a
`preview_targets` scope. Its `preview_registrar` user is the consumer's owner
and its Client credentials user.

Then:

1. Allow the frontend origin with credentials, in
   `web/sites/default/services.yml`:

   ```yaml
   parameters:
     cors.config:
       enabled: true
       allowedHeaders: ['*']
       allowedMethods: ['GET']
       allowedOrigins: ['http://localhost:3000']
       supportsCredentials: true
   ```

   The preview sends Drupal's session cookie, which is `SameSite=Lax`, so the
   frontend and Drupal must share a site. Ports on localhost share one. A
   frontend on another domain needs Drupal behind a proxy on its own origin.

2. Serve Drupal on the port the Nuxt app expects, and open it at
   `http://localhost:8080`, not 127.0.0.1, so it shares a site with the
   frontend:

   ```sh
   cd drupal/web
   php -S 127.0.0.1:8080 .ht.router.php
   ```

## The Nuxt app

The Nuxt app runs on Node 16, as the repository's `.nvmrc` says.

```sh
cd nuxt
npm install
npm run dev
```

`npm run dev` starts the mock Drupal on port 3005 and points `druxt.baseUrl`
at it, so the app runs without installing Drupal. The mock answers JSON:API and
doesn't serve a preview endpoint, so what this shows is a Druxt site on a mock
backend. Seeing a preview needs the Drupal site above.

### Against the Drupal site

Set `DRUPAL_BASE_URL` and run Nuxt on its own. `npm run nuxt` is the Nuxt half
of `npm run dev` without the mock, which a real backend does not need:

```sh
cd nuxt
npm install
DRUPAL_BASE_URL=http://localhost:8080 npm run nuxt
```

The address is the one the Drupal section serves on, and `localhost` rather
than `127.0.0.1` so the preview's session cookie is sent.

Edit the Landing page in Drupal, press Preview, and pick the frontend.

To let the app register its own preview target, give the Example frontend
consumer a secret in its form, and make Simple OAuth's keys:

```sh
cd drupal
mkdir -p keys
vendor/bin/drush simple-oauth:generate-keys "$PWD/keys"
vendor/bin/drush config:set simple_oauth.settings public_key "$PWD/keys/public.key" -y
vendor/bin/drush config:set simple_oauth.settings private_key "$PWD/keys/private.key" -y
```

Stop the app if it is running, so the new one gets port 3000. Then start it
with the consumer's details in the environment:

```sh
cd nuxt
DRUPAL_BASE_URL=http://localhost:8080 \
DRUXT_NODE_PREVIEW_URL=http://localhost:3000 \
DRUXT_NODE_PREVIEW_CLIENT_ID=example_frontend \
DRUXT_NODE_PREVIEW_CLIENT_SECRET='<the consumer secret>' \
npm run nuxt
```

The build output says that it registered the target. The recipe's target has
the same label, so Drupal replaces it.
