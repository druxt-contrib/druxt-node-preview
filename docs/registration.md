# Automatic registration

The frontend can add its own preview target to its Drupal consumer when Nuxt
starts. Then nobody copies the URL template into the consumer form by hand.
It is off until you turn it on.

Drupal needs Simple OAuth and a consumer set up for it first. See [Drupal
setup for automatic registration](registration-drupal-setup.md).

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

| Option     | Environment variable                  | Default                                      | Description                                                                                                                               |
| ---------- | ------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `url`      | `DRUXT_NODE_PREVIEW_URL`              | None                                         | The frontend's public URL, such as `https://www.example.com`. Nuxt cannot know it from a build. Add the router base, if the site has one. |
| `consumer` | `DRUXT_NODE_PREVIEW_CLIENT_ID`        | None                                         | The client ID of the consumer to register on.                                                                                             |
| None       | `DRUXT_NODE_PREVIEW_CLIENT_SECRET`    | None                                         | The consumer's secret.                                                                                                                    |
| `label`    | None                                  | The host of `url`, such as `www.example.com` | The target's name in Drupal's Frontend picker.                                                                                            |
| `token`    | `DRUXT_NODE_PREVIEW_REGISTER_TOKEN`   | `true` with `backend`, otherwise `false`     | Registers a target that reads the preview with a token. See [Previews with a token](preview-request.md#previews-with-a-token).            |
| `backend`  | `DRUXT_NODE_PREVIEW_REGISTER_BACKEND` | None                                         | A Drupal site other than `druxt.baseUrl` to register on. See [Registering on another Drupal site](#registering-on-another-drupal-site).   |
| None       | `DRUXT_NODE_PREVIEW_REGISTER_SECRET`  | None                                         | The consumer's secret on the `backend` site.                                                                                              |

An environment variable wins over the option in `nuxt.config.js`. So one
config serves local, staging and production, and each host sets its own
values. `register: true` takes all of them from the environment. The module
reads secrets only from the environment, so keep them out of `nuxt.config.js`
and the repository.

## What happens when Nuxt starts

When Nuxt is ready, in `nuxt dev`, `nuxt build`, `nuxt generate` and
`nuxt start`, the module:

1. Gets a token from `/oauth/token` on `druxt.baseUrl`, with Simple OAuth's
   client credentials grant.
2. Sends its target in a PATCH to Consumer Node Preview's
   `/api/consumer-node-preview/targets`. Drupal replaces the target that has
   the same label, or adds a new one, and records the time. The other targets
   stay as they are.

The target URL is `url`, then the `path` option, then
`?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]`. Without the
`layouts` option, the URL has no `&layout=[layout]`, and Drupal keeps the
consumer's layouts. With the `token` option, the URL ends in
`#[jsonapi_node_preview_path];token=[preview_token]` instead. With a `backend`,
it holds the full endpoint, `#[jsonapi_node_preview];token=[preview_token]`,
because a path would name `druxt.baseUrl`.

The module registers when each Nuxt process starts, then every 6 hours while
it runs. Consumer Node Preview moves a target that stops registering to its
Inactive group, and later deletes it. Its **Preview** tab sets both limits. A
static site only registers when it builds, so its target goes inactive unless
it builds again in time. An inactive target can still be picked.

A failure never stops the build or the server. The module shows a warning and
Nuxt carries on, and the consumer keeps the targets it had. `nuxt build` and
`nuxt start` both register, so a build without the secret only shows a
warning.

The default label is the frontend's host. So local, staging and production
each keep their own target on one consumer. Frontends that share a label
replace each other's target.

The requests go from Nuxt's server, so they don't need CORS settings. They use
the `timeout` in `druxt.axios`, or 5 seconds without one, and the site's other
`druxt.axios` options. So an `Authorization` header in `druxt.axios`, such as
Basic auth in front of a staging Drupal, goes with the token request too, and
Drupal can refuse it with HTTP 401, "Client authentication failed". A `backend`
gets only the `timeout` and `proxy` from
`druxt.axios`, and nothing from the global axios defaults, because they are for
`druxt.baseUrl`. The requests never follow a redirect, so the secret goes only
to the site they name. Use `https` there, because the token request sends the
secret.

To read the targets back as a site administrator, open this in the browser:

```text
https://cms.example.com/api/consumer-node-preview/targets?consumerId=frontend
```

## Registering on another Drupal site

A frontend can register on a Drupal site other than the one it reads from,
such as a branch build that previews content from production. Set `backend`
to that site's URL, and `DRUXT_NODE_PREVIEW_REGISTER_SECRET` to the
consumer's secret there:

```sh
DRUXT_NODE_PREVIEW_REGISTER_BACKEND='https://cms.example.com' \
DRUXT_NODE_PREVIEW_REGISTER_SECRET='<the consumer secret>' npm run start
```

The module never sends `DRUXT_NODE_PREVIEW_CLIENT_SECRET` to the `backend`
site, so a frontend can't hand its own site's secret to another one by
mistake. The target reads with a token, because a path would name the wrong
site. The module also accepts previews from the `backend` origin, so editors
must open that Drupal site at exactly that origin: the same scheme, host and
port. A preview from any other origin is refused. The page fetches from the
`backend` without the Druxt client, whose options are for `druxt.baseUrl`.
Nuxt writes the backend into the page when it builds, so set it for the build
as well as for `nuxt start`. Only registration needs the secret.

The `backend` requests use none of the `druxt.axios` agents, so a client
certificate for `druxt.baseUrl` stays there. If the `backend` site uses a
private certificate authority, give Node its certificate with the
`NODE_EXTRA_CA_CERTS` environment variable.

## Targets in settings.php

A target for the same frontend can also be in `settings.php`. Then the
Frontend picker shows both, with the registered one under its consumer's
label. Once registration works, remove the `settings.php` target, or keep it
as a fallback.

If Consumer Node Preview's `default` setting names the `settings.php` target,
change or remove it when you remove that target. See [Consumer Node Preview's
configuration](https://git.drupalcode.org/project/consumer_node_preview/-/blob/1.0.x/README.md#configuration).
