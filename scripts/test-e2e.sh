#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
E2E_DIR="$PKG_DIR/e2e"
TARBALL=""

DEFAULT_SUITES=(jest-esm jest-cjs node-test node-cjs legacy-cjs native-esm native-cjs)
ALL_SUITES=(jest-esm jest-cjs node-test node-cjs legacy-cjs native-esm native-cjs vitest-browser)
# Suites that only run against MSW v1; skipped when --msw selects another major
MSW_V1_ONLY=(legacy-cjs)

# msw's postinstall rewrites a suite's tracked worker script (e.g. vitest-browser)
restore_worker_scripts() {
  git -C "$PKG_DIR" checkout -- "$E2E_DIR/*/public/mockServiceWorker.js" 2>/dev/null || true
}

# msw is an *optional* peer of msw-fetch-mock, so npm does not enforce its range
# (`npm install --no-save <tarball> msw@x` succeeds even when x is outside it).
# Check that the installed msw satisfies the peer range, using npm's bundled semver.
NPM_GLOBAL_ROOT="$(npm root -g)"
check_msw_peer() {
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const semver = require(path.join(process.argv[1], "npm/node_modules/semver"));
    const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
    if (!fs.existsSync("node_modules/msw/package.json")) {
      console.log("peer check skipped: msw is not installed (native suite)");
      process.exit(0);
    }
    const range = read("node_modules/msw-fetch-mock/package.json").peerDependencies.msw;
    const version = read("node_modules/msw/package.json").version;
    if (!semver.satisfies(version, range)) {
      console.error(`msw@${version} does not satisfy msw-fetch-mock peer "${range}"`);
      process.exit(1);
    }
    console.log(`peer ok: msw@${version} satisfies "${range}"`);
  ' "$NPM_GLOBAL_ROOT"
}

# Whether a suite depends on msw at all (native suites do not)
uses_msw() {
  node -e 'const p = require(process.argv[1]); process.exit(p.dependencies?.msw ? 0 : 1)' \
    "$1/package.json"
}

cleanup() {
  restore_worker_scripts

  # Remove tarball
  if [ -n "$TARBALL" ] && [ -f "$TARBALL" ]; then
    rm -f "$TARBALL"
  fi
}

trap cleanup EXIT

# Parse arguments
run_all=false
suites=()
# Override the suites' msw version, e.g. --msw=3 (default: as in each package.json)
msw_major=""

for arg in "$@"; do
  if [[ "$arg" == --msw=* ]]; then
    msw_major="${arg#--msw=}"
  elif [ "$arg" = "--all" ]; then
    run_all=true
  else
    suites+=("$arg")
  fi
done

# Determine which suites to run
if [ ${#suites[@]} -gt 0 ]; then
  # Named suites provided
  :
elif [ "$run_all" = true ]; then
  suites=("${ALL_SUITES[@]}")
else
  suites=("${DEFAULT_SUITES[@]}")
fi

# Validate suite names
for suite in "${suites[@]}"; do
  if [ ! -d "$E2E_DIR/$suite" ]; then
    echo "ERROR: Unknown suite '$suite'. Available: ${ALL_SUITES[*]}"
    exit 1
  fi
done

# With --msw=<major> other than 1, drop the MSW v1-only suites
if [ -n "$msw_major" ] && [ "$msw_major" != "1" ]; then
  selected=()
  for suite in "${suites[@]}"; do
    if [[ " ${MSW_V1_ONLY[*]} " == *" $suite "* ]]; then
      echo "==> Skipping $suite (MSW v1 only)"
    else
      selected+=("$suite")
    fi
  done
  suites=("${selected[@]}")
fi

echo "==> Building msw-fetch-mock..."
(cd "$PKG_DIR" && npx tsup)

echo "==> Packing tarball..."
TARBALL="$(cd "$PKG_DIR" && npm pack 2>/dev/null | tail -1)"
TARBALL_PATH="$PKG_DIR/$TARBALL"

if [ ! -f "$TARBALL_PATH" ]; then
  echo "ERROR: Tarball not found at $TARBALL_PATH"
  exit 1
fi

echo "==> Tarball: $TARBALL"

# Install playwright if vitest-browser is in the list
for suite in "${suites[@]}"; do
  if [ "$suite" = "vitest-browser" ]; then
    echo "==> Installing Playwright (chromium)..."
    npx playwright install --with-deps chromium
    break
  fi
done

# Run each suite, collect results
failed=()

for suite in "${suites[@]}"; do
  suite_dir="$E2E_DIR/$suite"
  echo ""
  echo "=== Running: $suite ==="

  # Clean install (a stale lockfile would pin the previous tarball), with
  # msw-fetch-mock taken from the tarball; --no-save leaves package.json as is.
  rm -rf "$suite_dir/node_modules" "$suite_dir/package-lock.json"
  # --msw overrides the msw version only for suites that use msw at all.
  msw_spec=()
  if [ -n "$msw_major" ] && uses_msw "$suite_dir"; then
    msw_spec=("msw@^$msw_major")
  fi
  (cd "$suite_dir" && npm install --no-save "$TARBALL_PATH" ${msw_spec[@]+"${msw_spec[@]}"})

  # Browser suites need the worker script of the installed msw version
  if [ ${#msw_spec[@]} -gt 0 ] && [ -f "$suite_dir/public/mockServiceWorker.js" ]; then
    (cd "$suite_dir" && npx msw init public --no-save)
  fi

  # Run tests (after checking the peer range, which --no-save installs skip)
  if (cd "$suite_dir" && check_msw_peer && npm test); then
    echo "=== PASS: $suite ==="
  else
    echo "=== FAIL: $suite ==="
    failed+=("$suite")
  fi

  restore_worker_scripts
done

# Summary
echo ""
echo "=============================="
echo "  E2E Test Summary"
echo "=============================="
echo "  Ran: ${suites[*]}${msw_major:+ (msw@^$msw_major)}"

if [ ${#failed[@]} -eq 0 ]; then
  echo "  Result: ALL PASSED"
  exit 0
else
  echo "  Failed: ${failed[*]}"
  exit 1
fi
