# Agent instructions

DruxtNodePreview, `@druxt-contrib/node-preview`. A Druxt module that renders
an unsaved Drupal node in a Druxt site, from the JSON:API Node Preview
document that Consumer Node Preview points it at. It follows the Druxt
repository standard.

## Rules

- **This repository is public.** Nothing that resolves only on a private
  network may reach a tracked file: no internal URLs, hostnames, repository
  names or issue links, in any file including comments and patch descriptions.
  `npm run lint:private` enforces the URL-shaped half of this and runs in the
  pipeline. It cannot catch an internal name written as prose, so that part is
  on you.
- **Conventional Commits**, and the same for pull request and merge request
  titles. These repositories squash-merge, so the title becomes the commit
  subject, and a prose title breaks the next push to the target branch.
- **The default branch is `0.x`.** There is no `main` or `develop`. A release
  line is a `*.x` branch, and the pipelines run on pushes to those.
- **The coverage floor in `jest.config.js` goes up, never down.** If a change
  drops coverage, the change needs a test.
- **No AI tool is credited.** No co-author trailer naming an assistant, no
  generated-with footer, no session link, in commits, merge request
  descriptions or tracked files. The work is the author's. The commit-msg hook
  rejects it locally, and `npm run lint:attribution` and the pipeline check
  the rest.
- **Prose is linted with Vale.** The ai-tells style is the minimum, and it
  covers the markdown a change touches, its commit messages and the merge
  request description. `npm run lint:prose:install` once, then
  `npm run lint:prose`.
- **Releases go through Changesets.** A change that a user of the package
  would notice carries a changeset (`npm run changeset`). Do not write
  `CHANGELOG.md` by hand: the release writes it from `.changeset/`.

## Layout

| Path               | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `src/`             | The module. `index.js` is the Nuxt module, and checks the options                 |
| `templates/`       | The plugin, page and component the module adds to the Nuxt build                  |
| `test/`            | Unit tests. `test/e2e/` is the end to end suite, and is not run by `npm test`     |
| `example/`         | A Drupal site built with Composer, its recipe, and a Nuxt application             |
| `scripts/`         | Repository tooling, excluded from the package                                     |
| `.changeset/`      | Pending release notes, written with `npm run changeset`                           |
| `.githooks/`       | Committed hooks, enabled by `npm install`                                         |
| `.gitlab/scripts/` | Content checks shared with the other Druxt repositories, copied from the standard |

## Commands

```bash
npm install            # dependencies, and enables the git hooks
npm run build          # siroc
npm test               # jest, coverage floor enforced
npm run lint           # every linter except prose
npm run lint:prose     # Vale, after `npm run lint:prose:install`
npm run test:e2e:stack # the end to end suite, on Node 20, with PHP, Composer and mise
```

## Toolchain

Pinned in `.mise.toml`. Node is deliberately held at 16.20.1 to match what the
module's own dependencies support; the lint tooling is pinned to versions that
still run there. Bumping either is a deliberate, coordinated change, not a
routine dependency update, so Renovate is configured not to offer it.

The end to end suite is the exception. Playwright needs Node 20 or later, so
`test/e2e/run.sh` runs on Node 20 and starts the Druxt frontend on Node 16
through mise. `test/e2e/TROUBLESHOOTING.md` says why each step of the stack is
the way it is.
