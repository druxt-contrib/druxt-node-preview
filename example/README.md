# DruxtNodePreview example

A paired Drupal and Nuxt setup for trying the preview flow end to end.

## Drupal

`drupal/composer.json` builds a Drupal site with the two required modules.
Until it is released, Consumer Node Preview comes from a branch of its GitHub
repository. Once it publishes, replace the vcs repository with a normal
release constraint.

```sh
cd drupal
composer install
# Install Drupal, then:
drush pm:install consumer_node_preview paragraphs
```

Then:

1. Add a paragraph reference field to a content type.
2. Add the frontend URL to a consumer's Preview targets:
   `http://localhost:3000/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview]`
3. Allow the frontend origin in `services.yml` CORS with credentials, and set
   `cookie_samesite: None`.

### Known pin

`drupal/decoupled_router` is pinned to 2.0.6: druxt 1.2.1 fatals against
2.0.7 (see https://www.drupal.org/i/3618675). Drop the pin when druxt 1.2.2
releases.

## Nuxt

```sh
cd nuxt
npm install
npm run dev
```

Edit a node in Drupal, press Preview, and pick the frontend.
