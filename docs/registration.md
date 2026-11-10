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

A shell keeps typed commands in its history. On a shared machine, set the
secret in the host's environment settings or a secrets manager instead.

| Option     | Environment variable                   | Default                                      | Description                                                                                                                               |
| ---------- | -------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `url`      | `DRUXT_NODE_PREVIEW_URL`               | None                                         | The frontend's public URL, such as `https://www.example.com`. Nuxt cannot know it from a build. Add the router base, if the site has one. |
| `consumer` | `DRUXT_NODE_PREVIEW_CLIENT_ID`         | None                                         | The client ID of the consumer to register on.                                                                                             |
| None       | `DRUXT_NODE_PREVIEW_CLIENT_SECRET`     | None                                         | The consumer's secret.                                                                                                                    |
| `label`    | None                                   | The host of `url`, such as `www.example.com` | The target's name in Drupal's Frontend picker.                                                                                            |
| `token`    | `DRUXT_NODE_PREVIEW_REGISTER_TOKEN`    | `true` with `backend`, otherwise `false`     | Registers a target that reads the preview with a token. See [Previews with a token](preview-request.md#previews-with-a-token).            |
| `backend`  | `DRUXT_NODE_PREVIEW_REGISTER_BACKEND`  | None                                         | A Drupal site other than `druxt.baseUrl` to register on. See [Registering on another Drupal site](#registering-on-another-drupal-site).   |
| None       | `DRUXT_NODE_PREVIEW_REGISTER_SECRET`   | None                                         | The consumer's secret on the `backend` site.                                                                                              |
| `interval` | `DRUXT_NODE_PREVIEW_REGISTER_INTERVAL` | `21600000`, 6 hours                          | The time between registrations, in milliseconds, at least `60000`. Keep it shorter than Consumer Node Preview's Inactive limit.           |

An environment variable wins over the option in `nuxt.config.js`. So one
config serves local, staging and production, and each host sets its own
values. An empty variable counts as unset, so it can't clear an option. To
register on `druxt.baseUrl` by default, leave `backend` out of
`nuxt.config.js`, and set `DRUXT_NODE_PREVIEW_REGISTER_BACKEND` only where the
frontend registers on another site. `register: true` takes all of them from
the environment. The module reads secrets only from the environment, so keep
them out of `nuxt.config.js` and the repository.

A register secret decides where editors' previews go, and their tokens with
them. Anyone who has it can point the consumer's target at a site of their
own. So never give it to a build whose authors you don't trust, such as a
branch build from a fork.

## What happens when Nuxt starts

When Nuxt is ready, in `nuxt dev`, `nuxt build`, `nuxt generate` and
`nuxt start`, the module:

1. Gets a token from `/oauth/token` on the `backend` if there is one, or on
   `druxt.baseUrl`, with Simple OAuth's client credentials grant.
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
because a path would name `druxt.baseUrl`. A `backend` turns the token on
unless `token` is `false`. Then the target holds the full endpoint without a
token, and reads with the editor's session. That needs the session and CORS
that [Paths and full URLs](preview-request.md#paths-and-full-urls) describes.

The module registers when each Nuxt process starts, then every `interval`
while it runs, 6 hours by default. Consumer Node Preview moves a target that
stops registering to its Inactive group, after a day by default, and later
deletes it. Its **Preview** tab sets both limits. Keep `interval` shorter than
the Inactive limit, so a target stays active through a failed
attempt or two. A static site
only registers when it builds, so its target goes inactive unless it builds
again in time. An inactive target can still be picked.

A failure never stops the build or the server. The module shows a warning and
Nuxt carries on. A failure before the PATCH leaves the consumer's targets as
they were. A PATCH that times out may still have saved the new target, so
check the targets as below after a failure. `nuxt build` and
`nuxt start` both register, so a build without the secret only shows a
warning.

The default label is the frontend's host. So local, staging and production
each keep their own target on one consumer. Frontends that share a label
replace each other's target.

The requests go from Nuxt's server, so they don't need CORS settings. They
read Nuxt's top-level `axios` option first, as Druxt does, then `druxt.axios`
for what it leaves out. Druxt 0.25 deprecates `druxt.axios`, so set the
`timeout` in `axios`. Without one, the timeout is 5 seconds:

```js
// nuxt.config.js
export default {
  axios: { timeout: 10000 },
}
```

On `druxt.baseUrl`, the requests use the other `axios` options too. So an
`Authorization` header there, such as Basic auth in front of a staging Drupal,
goes with the token request, and Drupal can refuse it with HTTP 401, "Client
authentication failed". The requests never follow a redirect, so the secret
goes only to the site they name. Use `https` there, because the token request
sends the secret, and the token goes back the same way.

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
mistake. By default the target reads with a token, because a path would name
the wrong site. The module also accepts previews from the `backend` origin, so
editors must open that Drupal site at exactly that origin: the same scheme,
host and port. A preview from any other origin is refused. The page fetches
from the `backend` with `window.fetch`, as [The preview
request](preview-request.md#the-druxt-client-and-windowfetch) says. Nuxt
writes the backend into the page when it builds, so set it for the build as
well as for `nuxt start`. Only registration needs the secret.

The site's axios options are for `druxt.baseUrl`. So the `backend` requests
get only the `timeout`, and the `proxy` in `druxt.axios`. The global axios
defaults and the agents stay with `druxt.baseUrl`, and so does a client
certificate. If the `backend` site uses a
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
