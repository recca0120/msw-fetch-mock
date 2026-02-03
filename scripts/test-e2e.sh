#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
E2E_DIR="$PKG_DIR/e2e"
TARBALL=""

DEFAULT_SUITES=(jest-esm jest-cjs node-test node-cjs legacy-cjs native-esm native-cjs)
ALL_SUITES=(jest-esm jest-cjs node-test node-cjs legacy-cjs native-esm native-cjs vitest-browser)

cleanup() {
  # Restore e2e package.json files
  for suite in "${ALL_SUITES[@]}"; do
    local pkg="$E2E_DIR/$suite/package.json"
    if [ -f "$pkg" ]; then
      git checkout -- "$pkg" 2>/dev/null || true
    fi
  done

  # Remove tarball
  if [ -n "$TARBALL" ] && [ -f "$TARBALL" ]; then
    rm -f "$TARBALL"
  fi
}

trap cleanup EXIT

# Parse arguments
run_all=false
suites=()

for arg in "$@"; do
  if [ "$arg" = "--all" ]; then
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

  # Point dependency to tarball
  (cd "$suite_dir" && npm pkg set "dependencies.msw-fetch-mock=$TARBALL_PATH")

  # Clean install to avoid stale cache
  rm -rf "$suite_dir/node_modules"
  (cd "$suite_dir" && npm install --install-links)

  # Run tests
  if (cd "$suite_dir" && npm test); then
    echo "=== PASS: $suite ==="
  else
    echo "=== FAIL: $suite ==="
    failed+=("$suite")
  fi

  # Restore package.json immediately
  git checkout -- "$suite_dir/package.json" 2>/dev/null || true
done

# Summary
echo ""
echo "=============================="
echo "  E2E Test Summary"
echo "=============================="
echo "  Ran: ${suites[*]}"

if [ ${#failed[@]} -eq 0 ]; then
  echo "  Result: ALL PASSED"
  exit 0
else
  echo "  Failed: ${failed[*]}"
  exit 1
fi
