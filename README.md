<!-- vale off -->
<!-- The alt text describes what the banner shows: the @druxt-contrib/node-preview mark, name and description. The name-colon-description form trips ColonUsage. -->
<a href="https://druxtjs.org">
  <img src="https://raw.githubusercontent.com/druxt-contrib/druxt-node-preview/0.x/.github/banner.svg" alt="@druxt-contrib/node-preview: Node Preview module for Druxt">
</a>
<!-- vale on -->

# @druxt-contrib/node-preview

[![npm](https://img.shields.io/npm/v/@druxt-contrib/node-preview)](https://www.npmjs.com/package/@druxt-contrib/node-preview)
[![npm@dev](https://img.shields.io/npm/v/@druxt-contrib/node-preview/dev)](https://www.npmjs.com/package/@druxt-contrib/node-preview/v/dev)
[![CI](https://github.com/druxt-contrib/druxt-node-preview/actions/workflows/ci.yml/badge.svg?branch=0.x)](https://github.com/druxt-contrib/druxt-node-preview/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/druxt-contrib/druxt-node-preview/branch/0.x/graph/badge.svg)](https://codecov.io/gh/druxt-contrib/druxt-node-preview)
[![Known Vulnerabilities](https://snyk.io/test/github/druxt-contrib/druxt-node-preview/badge.svg?targetFile=package.json)](https://snyk.io/test/github/druxt-contrib/druxt-node-preview?targetFile=package.json)
[![Discord](https://img.shields.io/discord/753866667590680587?label=discord&logo=discord&logoColor=white)](https://discord.druxtjs.org)

> Node Preview module for Druxt

Shows an unsaved Drupal node in your [Druxt](https://druxtjs.org) frontend.
The editor presses Preview in Drupal and sees the node as the live site will
show it, paragraphs included.

![The Frontend tab of a Drupal preview, showing an unsaved node rendered by the Druxt frontend](https://raw.githubusercontent.com/druxt-contrib/druxt-node-preview/0.x/.github/preview.png)

It works with two Drupal modules:

- [JSON:API Node Preview](https://www.drupal.org/project/jsonapi_node_preview)
  serves the unsaved node over JSON:API.
- [Consumer Node Preview](https://www.drupal.org/project/consumer_node_preview)
  adds Frontend, Drupal and JSON:API tabs to Drupal's preview. The Frontend tab
  shows this module's page.

## Links

- [DruxtJS](https://druxtjs.org)
- [Community Discord server](https://discord.druxtjs.org)

## Requirements

The frontend needs:

- Druxt 0.25 and Druxt Entity 0.29 or later, through `druxt-site` 0.15.
- Node 16 for the build. Druxt's schema build fails on newer Node.

Drupal needs:

- Consumer Node Preview and JSON:API Node Preview.
- The fixes from <https://www.drupal.org/i/3367724> for JSON:API Node Preview.
  Version 1.0.0-beta5 and earlier show stale or missing paragraphs without
  them. The [example's
  `composer.json`](https://github.com/druxt-contrib/druxt-node-preview/blob/0.x/example/drupal/composer.json)
  applies them with composer-patches.

Both need one parent domain, such as `www.example.com` for the frontend and
`cms.example.com` for Drupal. The editor's Drupal session cookie does not
reach a frontend on another domain.

## Install

```sh
npm install druxt-site @druxt-contrib/node-preview
```

```js
// nuxt.config.js
export default {
  modules: ['@druxt-contrib/node-preview', 'druxt-site'],
  druxt: {
    baseUrl: 'https://cms.example.com',
    nodePreview: {
      include: { 'node--page': ['field_content.field_media'] },
      origins: ['https://cms.example.com'],
      layouts: ['default', 'preview'],
    },
  },
}
```

A site without `druxt-site` lists `druxt-entity` in `modules` instead.

## Options

All options are optional.

| Option                       | Type                  | Default                 | Description                                                                                                                   |
| ---------------------------- | --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `druxt.nodePreview.path`     | `string`              | `'/druxt/node/preview'` | The preview page's path.                                                                                                      |
| `druxt.nodePreview.include`  | `array` or `object`   | `[]`                    | Relationships to add to the preview request.                                                                                  |
| `druxt.nodePreview.origins`  | `array`               | `[]`                    | More origins the preview may come from. Each is a full URL.                                                                   |
| `druxt.nodePreview.layouts`  | `array`               | `[]`                    | Nuxt layouts the preview may use. See [Preview layouts](#preview-layouts).                                                    |
| `druxt.nodePreview.register` | `boolean` or `object` | `false`                 | Adds the frontend's preview target to its Drupal consumer at start up. See [Automatic registration](#automatic-registration). |

**include.** Consumer Node Preview already includes a node's paragraphs. Add
what the paragraphs reference, such as `field_content.field_media`. JSON:API
refuses a path that the previewed type does not have. Key a path by type when
only some bundles have it, as in the example above.

**origins.** Any link can put an endpoint in the page's URL. So the page only
fetches from this site, from `druxt.baseUrl`, and from `origins`. The editor's
session cookie goes with each request to those origins.

A value the module cannot use shows a warning in the build output, and the
module ignores it. The page's route name is `druxt-node-preview`.

## Drupal setup

1. Install Consumer Node Preview and JSON:API Node Preview, with the fixes
   from [Requirements](#requirements).
2. Go to **Administration > Configuration > Web services > Consumers** and
   edit the frontend's consumer. Under **Preview targets**, add a label and
   this URL template, with your frontend's host:

   ```text
   https://www.example.com/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview]
   ```

   Drupal fills in the parts in square brackets when the editor presses
   Preview. Keep them as they are.

   The frontend can add this target itself instead. See [Automatic
   registration](#automatic-registration).

3. Optional: under **Preview layouts**, add one layout name in each box. Put
   `default` first, because the preview opens in the first one. See
   [Preview layouts](#preview-layouts).
4. In the site's `services.yml`, such as `sites/default/services.yml`, allow
   the frontend's origin with credentials. Name the origin. Do not use `'*'`.

   ```yaml
   parameters:
     cors.config:
       enabled: true
       allowedHeaders: ['*']
       allowedMethods: ['GET']
       allowedOrigins: ['https://www.example.com']
       supportsCredentials: true
   ```

   Then rebuild the caches with `drush cr`.

5. Let the frontend show in Drupal's frame. Remove any `X-Frame-Options`
   header from the frontend's responses. If the frontend sends a
   `frame-ancestors` rule, add Drupal's origin to it. Name only Drupal's
   origin, so other sites cannot frame the preview.

To check it, edit a node, change something and press Preview. The Frontend
tab shows the change.

[Consumer Node Preview's
README](https://www.drupal.org/project/consumer_node_preview) lists the other
URL tokens, and how to set targets in `settings.php`.

## Automatic registration

The frontend can add its own preview target to its Drupal consumer when Nuxt
starts. Then nobody copies the URL template into the consumer form by hand.
It is off until you turn it on.

```js
// nuxt.config.js
export default {
  druxt: {
    baseUrl: 'https://cms.example.com',
    nodePreview: {
      layouts: ['default', 'preview'],
      register: {
        url: 'https://www.example.com',
        consumer: 'frontend',
      },
    },
  },
}
```

```sh
DRUXT_NODE_PREVIEW_CLIENT_SECRET='<the consumer secret>' npm run start
```

| Option     | Environment variable               | Default                                      | Description                                                                                                                               |
| ---------- | ---------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `url`      | `DRUXT_NODE_PREVIEW_URL`           | None                                         | The frontend's public URL, such as `https://www.example.com`. Nuxt cannot know it from a build. Add the router base, if the site has one. |
| `consumer` | `DRUXT_NODE_PREVIEW_CLIENT_ID`     | druxt-auth's client ID                       | The consumer's client ID. See [The client ID](#the-client-id).                                                                            |
| None       | `DRUXT_NODE_PREVIEW_CLIENT_SECRET` | None                                         | The consumer's secret. The module reads it only from the environment.                                                                     |
| `label`    | None                               | The host of `url`, such as `www.example.com` | The target's name in Drupal's Frontend picker.                                                                                            |
| `timeout`  | None                               | `5000`                                       | The longest time each request to Drupal can take, in milliseconds. It wins over a `timeout` in `druxt.axios`.                             |

An environment variable wins over the option in `nuxt.config.js`. So one
config serves local, staging and production, and each host sets its own
values. `register: true` takes all of them from the environment. Never put
the secret in `nuxt.config.js`, and keep it out of the repository.

### The client ID

The module uses the first client ID it finds, in this order:

1. `DRUXT_NODE_PREVIEW_CLIENT_ID`.
2. The `consumer` option.
3. `druxt.auth.clientId`, the client ID of
   [druxt-auth](https://www.npmjs.com/package/druxt-auth).
4. `DRUXT_AUTH_CLIENT_ID`, druxt-auth's environment variable.

The module does not need druxt-auth. A site that has it can use one consumer
for both, if that consumer is confidential and allows the Client
Credentials grant. The module never reads druxt-auth's secret. The secret
comes only from `DRUXT_NODE_PREVIEW_CLIENT_SECRET`. A client ID in
druxt-auth's own module options, not in `druxt.auth`, is not used.

### What happens when Nuxt starts

When Nuxt is ready, in `nuxt dev`, `nuxt build`, `nuxt generate` and
`nuxt start`, the module:

1. Gets a token from `/oauth/token` on `druxt.baseUrl`, with Simple OAuth's
   client credentials grant.
2. Reads the consumer's targets from Consumer Node Preview's
   `/api/consumer-node-preview/targets`.
3. Replaces the target that has the same label, or adds a new one. The other
   targets stay as they are.
4. Writes the targets back. If nothing changed, it skips this step and says
   that the target is up to date.

The target URL is the one from [Drupal setup](#drupal-setup): `url`, then
the `path` option, then `?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview]`.
Without the `layouts` option, the URL has no `&layout=[layout]`.

If the `layouts` option is set, the module also writes it as the consumer's
Preview layouts. If not, Drupal keeps the consumer's layouts.

The module registers once for each Nuxt process. A failure never stops the
build or the server. The module shows a warning and Nuxt carries on. The
consumer keeps the targets it had.

The default label is the frontend's host. So local, staging and production
each keep their own target on one consumer. Frontends that share a label
replace each other's target.

The module sends each request with a `DruxtClient` from Druxt, so the site's
`druxt.axios` options, such as its headers, apply. It never follows a
redirect, so the secret goes only to `druxt.baseUrl`.

The requests go from Nuxt's server, not from a browser, so they don't need
CORS settings. They don't send a session cookie, so Drupal does not ask for a
CSRF token. Use `https` for `druxt.baseUrl`, because the token request sends
the secret.

### Drupal setup for automatic registration

1. Install [Simple OAuth](https://www.drupal.org/project/simple_oauth) 6.1 or
   later. Its JWT library needs PHP's `sodium` extension.

   ```sh
   composer require drupal/simple_oauth:^6.1
   drush en simple_oauth
   ```

2. Make Simple OAuth's keys in a folder outside the web root, and set their
   paths. The paths are also at **Administration > Configuration > People >
   Simple OAuth**.

   ```sh
   mkdir -p /var/www/keys
   drush simple-oauth:generate-keys /var/www/keys
   drush config:set simple_oauth.settings public_key /var/www/keys/public.key -y
   drush config:set simple_oauth.settings private_key /var/www/keys/private.key -y
   ```

3. Add a role, such as Preview target registrar. Give it the permission
   **Register node preview targets for own consumers**, and nothing else.
4. Add a user for the frontend, such as `frontend_registrar`, and give it
   that role. Nobody signs in as this user.
5. Add a scope at
   **Administration > Configuration > People > Simple OAuth > Scopes**. Turn
   on its **Client Credentials** grant type.
   <!-- vale ai-tells.OverusedVocabulary = NO -->
   <!-- Granularity is the name of the field in Simple OAuth's scope form. -->
   Under **Granularity**, pick **Role**, and then the role from step 3.
   <!-- vale ai-tells.OverusedVocabulary = YES -->
6. Edit the frontend's consumer:
   - Set a **Secret**, and keep **Is Confidential?** on.
   - Under **Grant types**, turn on **Client Credentials**.
   - Set **User** to the user from step 4. The token acts as this user.
   - Under **Scopes**, pick the scope from step 5.
7. Make the user from step 4 the consumer's owner. Consumer Node Preview
   lets a user change only the targets of a consumer it owns. The consumer
   form has no owner field, so use Drush:

   ```sh
   drush php:eval '$c = \Drupal::entityTypeManager()->getStorage("consumer")->loadByProperties(["client_id" => "frontend"]); $u = user_load_by_name("frontend_registrar"); reset($c)->setOwnerId($u->id())->save();'
   ```

   A recipe can set the owner in the consumer's default content instead, as
   the [example's
   recipe](https://github.com/druxt-contrib/druxt-node-preview/tree/0.x/example/drupal/recipes/druxt_node_preview_example)
   does.

8. Set `DRUXT_NODE_PREVIEW_CLIENT_SECRET` to the consumer's secret where Nuxt
   runs. Then start Nuxt. The build output says that it registered the
   target.

You still need steps 4 and 5 of [Drupal setup](#drupal-setup), for CORS and
the frame.

## How it works

1. The editor presses Preview in Drupal. The Frontend tab opens this module's
   page in a frame.
2. The page reads the preview's JSON:API address from the part of its URL
   after the `#`. Browsers do not send that part to the frontend's server.
3. The page fetches the preview with the editor's Drupal session. It puts the
   document in the Druxt store.
4. `DruxtEntity` renders the node from the store, inside a `DruxtNodePreview`
   wrapper. The unsaved content goes through the same components as the live
   site.

## Preview layouts

The page uses the layout that `?layout=` names, but only if `layouts` lists
it. If not, the page uses the default layout. A preview URL cannot pick any
other layout.

Each listed layout must be a file in the site's `layouts/` folder that renders
`<Nuxt />`. A bare layout suits content that sits inside other pages. It has
the site's type and spacing, but no header or footer.

A site that picks layouts somewhere else can call
`$druxtNodePreview.layout(name)`. It makes the same check.

## Theming the preview

A live page often adds a title or a container around the node. The preview
gets the same from a wrapper component, picked like any Druxt wrapper. For a
`node--doc_page` previewed in `full`, the page uses the first of these that
exists:

1. `DruxtNodePreviewDocPageFull`
2. `DruxtNodePreviewDocPage`
3. `DruxtNodePreviewDefault`

If none of them exists, the node renders in Druxt's plain wrapper.

A wrapper gets any of these props that it declares:

- `document`: the whole JSON:API preview document.
- `entity`: the previewed resource, with `attributes` such as the title.
- `mode`, `type` and `uuid`.

Its default slot renders the node with `DruxtEntity`:

```vue
<!-- components/druxt/node-preview/DocPageFull.vue -->
<template>
  <article class="prose">
    <h1>{{ entity.attributes.title }}</h1>
    <slot />
  </article>
</template>

<script>
export default {
  // The props it does not declare would otherwise land on <article>.
  inheritAttrs: false,
  props: {
    entity: { type: Object, required: true },
  },
}
</script>
```

A wrapper named by bundle alone, such as `DruxtNodePreviewDocPage`, applies to
every view mode. Put page parts such as a title in the `<Bundle>Full` wrapper,
as above, or check the `mode` prop.

## Components that fetch their own data

A component that reads the Druxt store shows the unsaved data. A component
that fetches its data again, such as paragraphs at a revision, shows the saved
content instead. Skip that fetch while a preview is active:

```js
if ((this.$store.state.druxtNodePreview || {}).active) return
```

When the editor leaves the preview, the module removes the preview data from
the store. The next page loads the saved content.

The module stores the data under the route's `langcode` meta. `DruxtEntity`
reads it there when it has no `langcode` prop.

## The preview request

The page fetches through the Druxt client, `$druxt.axios`, with credentials.
The site's request interceptors apply, such as one that adds a workspace
header. Without the Druxt client, the page uses `window.fetch`.

A preview address that is a path stays a path. The Druxt client resolves it
against its own base URL, and interceptors that match by path still match it.
This suits a frontend that reaches Drupal through a proxy on its own origin.
The editor must then sign in through that proxy too, because the session
cookie belongs to the host the editor signed in on. Druxt's
`proxy: { api: true }` forwards the API but not Drupal's sign-in pages, so it
is not enough on its own.

Without a proxy, the request goes to Drupal's origin. Drupal then needs the
CORS settings from [Drupal setup](#drupal-setup). The session cookie is
`SameSite=Lax`, so the frontend and Drupal need one parent domain.

The page only fetches a node preview, from an address that ends in
`/{uuid}/preview`. The response must be `application/vnd.api+json`, and each
resource in it must have a JSON:API type and a UUID. If a check fails, the
page shows an error and puts nothing in the store.

## Server rendering and static sites

The page only works in the browser. A server render shows "Loading
preview..." and the browser fills it in. A statically generated page has the
default layout, so the page switches to the listed layout in the browser.

## Troubleshooting

The page shows "Preview unavailable" and a message.

- **HTTP 404.** Drupal has no preview of this node for the editor. Check, in
  this order:
  1. The editor pressed Preview, and can view the node.
  2. The frontend and Drupal share a parent domain. On your own computer,
     use one host name for both: `localhost` and `127.0.0.1` count as
     different.
  3. The CORS settings in `services.yml` name the frontend's origin.
- **"The preview endpoint is not on this site or its Drupal site".** Add the
  preview's origin to the `origins` option.
- **"The URL fragment has no preview endpoint".** The preview target's URL
  template has no `#[jsonapi_node_preview]` at the end.
- **HTTP 400.** An `include` path that the previewed type does not have. Key
  that path by type.

Automatic registration prints a warning that starts with "Could not
register the preview target", then says what went wrong:

- **"druxt.baseUrl is not set".** Set `druxt.baseUrl` to the Drupal site's
  URL.
- **"Drupal did not answer at ...".** Drupal is down, or `druxt.baseUrl` is
  wrong. A message that ends in "within 5 seconds" means Drupal was too
  slow. Raise the `timeout` option.
- **"Drupal redirected ...".** Drupal sent the request to another URL, such
  as from `http` to `https`. Set `druxt.baseUrl` to the URL Drupal redirects
  to.
- **"/oauth/token answered HTTP 404".** Simple OAuth is not installed.
- **"Drupal refused the client credentials".** The secret is wrong, or the
  consumer is not confidential, does not allow the Client credentials grant,
  or has no User.
- **"You need to set the OAuth2 private key".** Simple OAuth has no keys. See
  step 2 of [Drupal setup for automatic
  registration](#drupal-setup-for-automatic-registration).
- **"The targets API ... answered HTTP 404".** Consumer Node Preview is not
  installed, or no consumer has that client ID.
- **"The targets API answered HTTP 403".** The consumer's User does not own
  the consumer, or the token's scope does not give the register permission.
- **"Drupal refused the target (HTTP 422 ...)".** Drupal does not accept the
  target's URL. Check the `url` and `path` options.

A warning that starts with "Ignored the register option" means that an
option is missing or wrong, so the module did not try. It names the option
or the environment variable to set.

If `DruxtEntity` reports a missing schema:

1. Check that the content type has a display for the previewed view mode, on
   its **Manage display** tab.
2. Make sure Drupal is up, then restart the frontend. Nuxt builds the schema
   when it starts, and `.nuxt` can hold an old one.

The [end to end troubleshooting
notes](https://github.com/druxt-contrib/druxt-node-preview/blob/0.x/test/e2e/TROUBLESHOOTING.md)
cover the test stack.

## Writing another frontend

[Consumer Node Preview's
README](https://www.drupal.org/project/consumer_node_preview) shows how a
frontend reads the preview address from the URL, including the `https:/`
repair that some routers need. Before it renders anything, a frontend makes
the same checks as this module. See [The preview request](#the-preview-request).

This module reads `[view_mode]` and `[layout]` from the `vm` and `layout`
query parameters. They change only how the preview looks. The JSON:API
document is the same for each.

## Example

See the [example](https://github.com/druxt-contrib/druxt-node-preview/tree/0.x/example)
for a paired Drupal and Nuxt setup.

## Licence

MIT.
