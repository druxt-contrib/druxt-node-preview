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
}
trap cleanup EXIT

# Playwright needs Node 18 or later. The module's own toolchain stays on
# Node 16 (.nvmrc), and CI runs this suite on Node 20.
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "The end to end suite needs Node 18 or later for Playwright. This is $(node -v)."
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
# One file per Drupal port, so runs on other ports keep their own database.
DB_FILE="${TMPDIR:-/tmp}/druxt_node_preview_e2e_${DRUPAL_PORT}.sqlite"
DB="sqlite://localhost/$DB_FILE"
rm -f web/sites/default/settings.php "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
vendor/bin/drush site:install standard -y --db-url="$DB" --account-name=admin -q
# site:install makes sites/default read-only, and services.yml goes there.
chmod u+w web/sites/default
vendor/bin/drush pm:install consumer_node_preview paragraphs -y -q
cp "$ROOT/test/e2e/drupal/services.e2e.yml" web/sites/default/services.yml
sed -i "s/localhost:3111/localhost:$FRONTEND_DRUXT_PORT/; s/localhost:3112/localhost:$FRONTEND_STATIC_PORT/" web/sites/default/services.yml
vendor/bin/drush php:script "$ROOT/test/e2e/drupal/setup.php" -- \
  "http://localhost:$FRONTEND_DRUXT_PORT" "http://localhost:$FRONTEND_STATIC_PORT"
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
setsid php -S "localhost:$DRUPAL_PORT" "$ROOT/example/drupal/web/.ht.router.php" > "$ROOT/test/e2e/reports/drupal-server.log" 2>&1 &
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
  npm install --no-audit --no-fund
  # Nuxt 2 uses webpack 4, whose md4 hashing needs the legacy OpenSSL
  # provider on Node 17 and later.
  NODE_OPTIONS="--openssl-legacy-provider" \
  DRUPAL_BASE_URL="http://localhost:$DRUPAL_PORT" setsid npx nuxt dev --port "$FRONTEND_DRUXT_PORT" > "$ROOT/test/e2e/reports/nuxt-dev.log" 2>&1 &
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
