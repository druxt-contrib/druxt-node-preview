# Contributing

Thanks for helping. DruxtNodePreview follows the Druxt repository standard,
so the checks here are the same ones every Druxt module runs.

## Getting set up

```bash
npm install
```

That installs dependencies and enables the git hooks. If you skipped install
scripts, the hooks are on disk but do not run. Run `npm run hooks:install` to
turn them on.

The toolchain is pinned in `.mise.toml`. With [mise](https://mise.jdx.dev)
installed, `mise install` gives you the same Node the pipeline uses.

Branch from `0.x`, and open your pull request against it.

## Before you push

```bash
npm run lint     # every check below except prose, which needs Vale installed
npm test         # jest, with the coverage floor enforced
```

The pre-commit hook runs both, so this is usually already done. The end to end
suite is not in the hook, because it builds a Drupal site and starts two
frontends.

## The end to end suite

`npm run test:e2e:stack` runs `test/e2e/run.sh`. It needs PHP 8.3 or later,
Composer, mise, and Node 20 or later for Playwright. It builds the Drupal site
in `example/drupal` and starts the frontends. Then it runs the Playwright specs.
Set `E2E_DRUXT=1` to include the Druxt frontend. Both pipelines run it on every
change, so you do not have to run it locally. If it fails,
`test/e2e/TROUBLESHOOTING.md` lists the known traps.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org). The commit-msg
hook checks them, and the pipeline checks the whole merge-request range.

These repositories squash-merge, so the pull request or merge request
**title** becomes the commit subject. A prose title passes the commit check and
then breaks the next push to the target branch for everyone. Title your pull
request the same way you would title a commit.

## Changesets

A change that a user of the package would notice needs a changeset. Run
`npm run changeset`, pick the bump, and write one or two plain sentences about
the change. Commit the file it writes in `.changeset/` with your change. The
release turns the changesets into `CHANGELOG.md`, so do not edit that file by
hand.

## Coverage

`jest.config.js` carries a coverage floor measured from the current tests. It
is a floor. Raise it when coverage improves. Do not lower it to make a change
pass: if a change drops coverage, the change needs a test.

## What not to put in a file

This repository is public. Nothing that only resolves on a private network may
reach a tracked file, whether as a URL, in a comment or in a patch description.
`npm run lint:private` checks this and runs in the pipeline. When you need to
cite something internal, describe it without the URL or point at a public
equivalent.
