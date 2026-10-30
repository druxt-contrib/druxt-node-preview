#!/usr/bin/env bash
# Orchestrates the end to end suite against a locally built stack.
#
# Stands up, in order:
#   1. Drupal from example/drupal (sqlite), with the suite's recipe and the
#      example's recipe applied, and the frontends as site targets.
#   2. The static reference frontend on FRONTEND_STATIC_PORT.
#   3. The Druxt frontend from example/nuxt on FRONTEND_DRUXT_PORT, when
#      E2E_DRUXT=1. Without it the Druxt specs skip and the Drupal side
#      workflow still runs in full.
# Then runs Playwright and tears everything down.
#
# Every port is overridable, so runs from separate checkouts never fight. Two
# runs from one checkout would share its Drupal site, so the second one stops:
#   DRUPAL_PORT=8131 FRONTEND_STATIC_PORT=3112 FRONTEND_DRUXT_PORT=3111 ./run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRUPAL_PORT="${DRUPAL_PORT:-8131}"
FRONTEND_STATIC_PORT="${FRONTEND_STATIC_PORT:-3112}"
FRONTEND_DRUXT_PORT="${FRONTEND_DRUXT_PORT:-3111}"
# settings.e2e.php reads the frontend ports from the environment.
export FRONTEND_STATIC_PORT FRONTEND_DRUXT_PORT
E2E_DRUXT="${E2E_DRUXT:-0}"
PIDS=()
# Simple OAuth's keys and the copy of the e2e recipe with the consumer's
# secret. Both live outside the repository, and cleanup removes them.
WORK=""
LOCK="$ROOT/test/e2e/.run.lock"
OWN_LOCK=0

cleanup() {
  # Each server leads its own process group (setsid), so this also stops what
  # it started, such as nuxt dev under npx and mise. It then waits up to ten
  # seconds for each group to exit.
  for pid in "${PIDS[@]:-}"; do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
  for pid in "${PIDS[@]:-}"; do
    for _ in $(seq 1 50); do kill -0 -- "-$pid" 2>/dev/null || break; sleep 0.2; done
  done
  # A group still running after the wait gets SIGKILL, so the next run does
  # not find its port taken.
  for pid in "${PIDS[@]:-}"; do kill -KILL -- "-$pid" 2>/dev/null || true; done
  if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
  if [ "$OWN_LOCK" = 1 ]; then rmdir "$LOCK" 2>/dev/null || true; fi
}
trap cleanup EXIT

# mkdir is atomic, and flock does nothing on some container mounts.
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "Another run is using this checkout. Remove $LOCK if no run is active."
  exit 1
fi
OWN_LOCK=1

# Playwright needs Node 20 or later. The module's own toolchain stays on
# Node 16 (.nvmrc), and CI runs this suite on Node 20.
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "The end to end suite needs Node 20 or later for Playwright. This is $(node -v)."
  exit 1
fi

port_free() {
  ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}
PORTS=("$DRUPAL_PORT" "$FRONTEND_STATIC_PORT")
# nuxt dev moves to a random port when its own is taken, and the suite would
# then test whatever holds that port.
[ "$E2E_DRUXT" = "1" ] && PORTS+=("$FRONTEND_DRUXT_PORT")
for port in "${PORTS[@]}"; do
  port_free "$port" || { echo "Port $port is already in use. Override the *_PORT variables."; exit 1; }
done

echo "==> Making Simple OAuth's keys and the consumer's secret"
# The Druxt frontend registers its preview target on the e2e consumer with a
# client credentials token. Each run gets a new key pair and a new secret, so
# neither is ever in the repository.
WORK="$(mktemp -d)"
openssl genrsa -out "$WORK/private.key" 2048 2>/dev/null
openssl rsa -in "$WORK/private.key" -pubout -out "$WORK/public.key" 2>/dev/null
# Simple OAuth refuses a key that other users can read.
chmod 600 "$WORK/private.key" "$WORK/public.key"
# settings.e2e.php reads the key folder from the environment.
export E2E_OAUTH_KEYS="$WORK"
E2E_CLIENT_SECRET="$(openssl rand -hex 24)"
# The recipe's consumer has a placeholder for the secret. A copy of the
# recipe gets the real one, and the importer hashes it.
cp -R "$ROOT/test/e2e/drupal/recipes/druxt_node_preview_e2e" "$WORK/recipe"
sed -i "s/E2E_CLIENT_SECRET/$E2E_CLIENT_SECRET/" "$WORK/recipe/content/consumer/7e3f9a1c-2d4b-4c8e-a6f0-1b2c3d4e5f60.yml"

echo "==> Building Drupal (example/drupal)"
cd "$ROOT/example/drupal"
# Always resolve fresh: the example has no committed lock file.
composer update --no-interaction --no-progress
# composer-patches does not notice changed patch content, so reapply.
composer reinstall drupal/jsonapi_node_preview --no-interaction
# Make repeat runs idempotent.
chmod -R u+w web/sites/default 2>/dev/null || true
# Absolute path: a relative sqlite path resolves against the PHP process
# working directory at runtime, not the Drupal root, so drush works while the
# web server silently redirects to the installer. The file lives under the
# system temp dir on purpose: sqlite on a container host mount corrupts under
# concurrent writes, which shows up as empty plugin discovery caches.
# One file per Drupal port, so runs on other ports keep their own database.
DB_FILE="${TMPDIR:-/tmp}/druxt_node_preview_e2e_${DRUPAL_PORT}.sqlite"
DB="sqlite://localhost/$DB_FILE"
rm -f web/sites/default/settings.php "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
vendor/bin/drush site:install standard -y --db-url="$DB" --account-name=admin -q
# site:install makes sites/default read-only, and services.yml goes there.
chmod u+w web/sites/default
cp "$ROOT/test/e2e/drupal/services.e2e.yml" web/sites/default/services.yml
# The placeholders are not ports, so one replacement cannot match the other.
sed -i "s/:FRONTEND_DRUXT_PORT'/:$FRONTEND_DRUXT_PORT'/; s/:FRONTEND_STATIC_PORT'/:$FRONTEND_STATIC_PORT'/" web/sites/default/services.yml
cp "$ROOT/test/e2e/drupal/settings.e2e.php" web/sites/default/settings.e2e.php
chmod u+w web/sites/default/settings.php
echo "include \$app_root . '/' . \$site_path . '/settings.e2e.php';" >> web/sites/default/settings.php
vendor/bin/drush recipe "$WORK/recipe" -q
# The example's own recipe, so the run fails if it breaks. It runs second,
# because the specs edit node 1, the e2e article.
vendor/bin/drush recipe ../recipes/druxt_node_preview_example -q
vendor/bin/drush cache:rebuild -q

mkdir -p "$ROOT/test/e2e/reports"
echo "==> Starting Drupal on :$DRUPAL_PORT"
# The server must run with the web root as its working directory and an
# absolute router path. Drupal resolves twig templates, plugin discovery
# paths and other paths relative to the process working directory, and a
# request served from the wrong directory writes empty discovery results
# into the persistent cache, which poisons every later request.
pushd "$ROOT/example/drupal/web" >/dev/null
# Bind 127.0.0.1, not localhost: php -S localhost can bind only ::1, while
# Node resolves localhost to 127.0.0.1. Browsers try both addresses.
setsid php -S "127.0.0.1:$DRUPAL_PORT" "$ROOT/example/drupal/web/.ht.router.php" > "$ROOT/test/e2e/reports/drupal-server.log" 2>&1 &
PIDS+=($!)
popd >/dev/null

echo "==> Starting the static frontend on :$FRONTEND_STATIC_PORT"
# PHP is here for Drupal already, so it serves the static files too.
setsid php -S "localhost:$FRONTEND_STATIC_PORT" -t "$ROOT/test/e2e/static-frontend" > "$ROOT/test/e2e/reports/static-frontend.log" 2>&1 &
PIDS+=($!)

DRUXT_URL=""
if [ "$E2E_DRUXT" = "1" ]; then
  echo "==> Starting the Druxt frontend on :$FRONTEND_DRUXT_PORT"
  cd "$ROOT/example/nuxt"
  # A stale build dir keeps a schema from an older Drupal. Always rebuild.
  rm -rf .nuxt
  npm install --no-audit --no-fund
  # The Druxt toolchain is frozen on Node 16 (see .nvmrc): druxt-schema does
  # not generate schemas on newer Node, and fails without saying so. Playwright
  # needs Node 20 or later, so mise runs the frontend on Node 16 beside it.
  if ! command -v mise >/dev/null 2>&1; then
    echo "The Druxt tier needs mise, to run its frontend on Node 16 while Playwright runs on Node 20 or later."
    exit 1
  fi
  # The frontend registers its preview target on the e2e consumer when it
  # starts. The secret goes only through the environment.
  DRUPAL_BASE_URL="http://localhost:$DRUPAL_PORT" \
  DRUXT_NODE_PREVIEW_URL="http://localhost:$FRONTEND_DRUXT_PORT" \
  DRUXT_NODE_PREVIEW_CLIENT_ID=e2e_druxt \
  DRUXT_NODE_PREVIEW_CLIENT_SECRET="$E2E_CLIENT_SECRET" \
    setsid mise x node@16.20.1 -- npx nuxt dev --port "$FRONTEND_DRUXT_PORT" > "$ROOT/test/e2e/reports/nuxt-dev.log" 2>&1 &
  PIDS+=($!)
  DRUXT_URL="http://localhost:$FRONTEND_DRUXT_PORT"
fi

echo "==> Waiting for the stack"
for url in "http://localhost:$DRUPAL_PORT/user/login" "http://localhost:$FRONTEND_STATIC_PORT/" ${DRUXT_URL:+"$DRUXT_URL/"}; do
  # A Nuxt dev build takes longer than a PHP server to come up.
  tries=60
  [ "$url" = "$DRUXT_URL/" ] && tries=180
  up=""
  for _ in $(seq 1 "$tries"); do
    curl -sf -o /dev/null "$url" && { up=1; break; }
    sleep 2
  done
  if [ -z "$up" ]; then
    echo "$url did not come up. The server logs are in test/e2e/reports:"
    tail -n 30 "$ROOT"/test/e2e/reports/*.log 2>/dev/null || true
    exit 1
  fi
done

cd "$ROOT/example/drupal"
LOGIN_LINK="$(vendor/bin/drush uli --no-browser --uri="http://localhost:$DRUPAL_PORT")"

echo "==> Running Playwright"
cd "$ROOT"
DRUPAL_URL="http://localhost:$DRUPAL_PORT" \
DRUPAL_LOGIN_LINK="$LOGIN_LINK" \
FRONTEND_STATIC_URL="http://localhost:$FRONTEND_STATIC_PORT" \
FRONTEND_DRUXT_URL="$DRUXT_URL" \
npx playwright test "$@"
