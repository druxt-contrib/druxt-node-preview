#!/usr/bin/env bash
# Orchestrates the end to end suite against a locally built stack.
#
# Stands up, in order:
#   1. Drupal from example/drupal (sqlite), with the modules installed and
#      test/e2e/drupal/setup.php applied.
#   2. The static reference frontend on FRONTEND_STATIC_PORT.
#   3. The Druxt frontend from example/nuxt on FRONTEND_DRUXT_PORT, when
#      E2E_DRUXT=1. Without it the Druxt specs skip and the Drupal side
#      workflow still runs in full.
# Then runs Playwright and tears everything down.
#
# Every port is overridable, so parallel environments never fight:
#   DRUPAL_PORT=8131 FRONTEND_STATIC_PORT=3112 FRONTEND_DRUXT_PORT=3111 ./run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DRUPAL_PORT="${DRUPAL_PORT:-8131}"
FRONTEND_STATIC_PORT="${FRONTEND_STATIC_PORT:-3112}"
FRONTEND_DRUXT_PORT="${FRONTEND_DRUXT_PORT:-3111}"
E2E_DRUXT="${E2E_DRUXT:-0}"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT

port_free() {
  ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}
for port in "$DRUPAL_PORT" "$FRONTEND_STATIC_PORT"; do
  port_free "$port" || { echo "Port $port is already in use. Override the *_PORT variables."; exit 1; }
done

echo "==> Building Drupal (example/drupal)"
cd "$ROOT/example/drupal"
# Always resolve fresh: the example has no committed lock file.
composer update --no-interaction --no-progress
# Make repeat runs idempotent.
chmod -R u+w web/sites/default 2>/dev/null || true
# Absolute path: a relative sqlite path resolves against the PHP process
# working directory at runtime, not the Drupal root, so drush works while the
# web server silently redirects to the installer. The file lives under the
# system temp dir on purpose: sqlite on a container host mount corrupts under
# concurrent writes, which shows up as empty plugin discovery caches.
DB_FILE="${TMPDIR:-/tmp}/druxt_node_preview_e2e.sqlite"
DB="sqlite://localhost/$DB_FILE"
rm -f web/sites/default/settings.php "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
vendor/bin/drush site:install standard -y --db-url="$DB" --account-name=admin -q
vendor/bin/drush pm:install consumer_node_preview paragraphs -y -q
cp "$ROOT/test/e2e/drupal/services.e2e.yml" web/sites/default/services.yml
sed -i "s/localhost:3111/localhost:$FRONTEND_DRUXT_PORT/; s/localhost:3112/localhost:$FRONTEND_STATIC_PORT/" web/sites/default/services.yml
vendor/bin/drush php:script "$ROOT/test/e2e/drupal/setup.php" -- \
  "http://localhost:$FRONTEND_DRUXT_PORT" "http://localhost:$FRONTEND_STATIC_PORT"
vendor/bin/drush cache:rebuild -q

echo "==> Starting Drupal on :$DRUPAL_PORT"
# The server must run with the web root as its working directory and an
# absolute router path. Drupal resolves twig templates, plugin discovery
# paths and other paths relative to the process working directory, and a
# request served from the wrong directory writes empty discovery results
# into the persistent cache, which poisons every later request.
pushd "$ROOT/example/drupal/web" >/dev/null
php -S "localhost:$DRUPAL_PORT" "$ROOT/example/drupal/web/.ht.router.php" >/dev/null 2>&1 &
PIDS+=($!)
popd >/dev/null

echo "==> Starting the static frontend on :$FRONTEND_STATIC_PORT"
cd "$ROOT/test/e2e/static-frontend"
python3 -m http.server "$FRONTEND_STATIC_PORT" >/dev/null 2>&1 &
PIDS+=($!)

DRUXT_URL=""
if [ "$E2E_DRUXT" = "1" ]; then
  echo "==> Starting the Druxt frontend on :$FRONTEND_DRUXT_PORT"
  cd "$ROOT/example/nuxt"
  npm install --no-audit --no-fund
  # Nuxt 2 uses webpack 4, whose md4 hashing needs the legacy OpenSSL
  # provider on Node 17 and later.
  NODE_OPTIONS="--openssl-legacy-provider" \
  DRUPAL_BASE_URL="http://localhost:$DRUPAL_PORT" npx nuxt dev --port "$FRONTEND_DRUXT_PORT" > "$ROOT/test/e2e/reports/nuxt-dev.log" 2>&1 &
  PIDS+=($!)
  DRUXT_URL="http://localhost:$FRONTEND_DRUXT_PORT"
fi

echo "==> Waiting for the stack"
for url in "http://localhost:$DRUPAL_PORT/user/login" "http://localhost:$FRONTEND_STATIC_PORT/" ${DRUXT_URL:+"$DRUXT_URL/"}; do
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "$url" && break
    sleep 2
  done
done

cd "$ROOT/example/drupal"
LOGIN_LINK="$(vendor/bin/drush uli --no-browser --uri="http://localhost:$DRUPAL_PORT")"

mkdir -p "$ROOT/test/e2e/reports"
echo "==> Running Playwright"
cd "$ROOT"
DRUPAL_URL="http://localhost:$DRUPAL_PORT" \
DRUPAL_LOGIN_LINK="$LOGIN_LINK" \
FRONTEND_STATIC_URL="http://localhost:$FRONTEND_STATIC_PORT" \
FRONTEND_DRUXT_URL="$DRUXT_URL" \
npx playwright test "$@"
