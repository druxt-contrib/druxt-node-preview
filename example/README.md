# DruxtNodePreview example

A paired Drupal and Nuxt setup for trying the preview flow end to end.

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
   cd web
   php -S 127.0.0.1:8080 .ht.router.php
   ```

## Nuxt

The Nuxt app runs on Node 16, as the repository's `.nvmrc` says.

```sh
cd nuxt
npm install
npm run dev
```

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

Then start the app with the consumer's details in the environment:

```sh
cd nuxt
DRUXT_NODE_PREVIEW_URL=http://localhost:3000 \
DRUXT_NODE_PREVIEW_CLIENT_ID=example_frontend \
DRUXT_NODE_PREVIEW_CLIENT_SECRET='<the consumer secret>' \
npm run dev
```

The recipe's target already matches, so the build output says that the target
is up to date.
