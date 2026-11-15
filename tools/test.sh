#!/usr/bin/env bash
# tools/test.sh — @kama/image's gate: the roadmap's shape, `kama check` on the package and on its tests, then the tests
# program built debug and release and run natively, and built for the web and run under node, where its fixtures are
# embedded. Every leg holds every fixture to libpng's answer (tests/src/expected.kama, from tools/reference/run.sh).
# Natively, in debug and in release, the sweep then decodes every single-bit flip and every truncation of every fixture
# libpng decodes, and fails on a trap (tests/src/sweep.kama). tests/kama.json compiles the package and std at the
# release level in a debug build (debug.optimize), which keeps kama's overflow traps and bounds checks. Last, every leg's
# encoded bytes for the encoder's fixed set (tests/src/promise.kama's `encoded` lines) are held to each other's.
#
#   tools/test.sh
#
# Run it from msys2 UCRT64 on Windows (bash -lic, so emcc and node are on PATH for the wasm leg), or any shell elsewhere.
# A leg with no `emcc` or `node` is skipped, and says so.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) PLAT="${MSYSTEM:-$(uname -s)}-$(uname -m)"; EXE=.exe ;;
    *) PLAT="$(uname -s)-$(uname -m)"; EXE= ;;
esac
if [ -n "${KAMA:-}" ]; then :
elif command -v kama >/dev/null 2>&1; then KAMA=kama
elif [ -x "$ROOT/../kama/out/$PLAT/kama$EXE" ]; then KAMA="$ROOT/../kama/out/$PLAT/kama$EXE"
else echo "test: no kama (set KAMA)" >&2; exit 1
fi

failed=0
legs=()   # the logs of the legs that ran, whose encoded lines must agree
step() { echo; echo "== $*"; }
# A run's last line is its count; a run that ends without one ended early, whatever its exit status.
counted() {
    local log="$1" leg="$2"
    if ! grep -q '^image tests: [0-9]* cases, 0 failed$' "$log"; then
        echo "FAIL the tests ($leg): $(tail -1 "$log")"
        failed=1
    fi
}

step "the roadmap"
sh tools/check-roadmap.sh || failed=1

step "kama check"
"$KAMA" check kama.json || failed=1
"$KAMA" pkg install tests/kama.json >/dev/null
"$KAMA" check tests/kama.json || failed=1

for mode in debug release; do
    step "native, $mode"
    flag=; [ "$mode" = release ] && flag=--release
    "$KAMA" build tests/kama.json $flag -o "tests/out/native-$mode/imagetests$EXE" >/dev/null
    log="tests/out/native-$mode.log"
    (cd tests && "./out/native-$mode/imagetests$EXE") > "$log" 2>&1 || true
    grep -E '^(FAIL|image tests:)' "$log" || true
    counted "$log" "native $mode"
    legs+=("$log")
    # every single-bit flip and every truncation of every fixture libpng decodes; a trap ends the run before its count
    step "the sweep, native $mode"
    log="tests/out/sweep-$mode.log"
    (cd tests && "./out/native-$mode/imagetests$EXE" --sweep) > "$log" 2>&1 || true
    grep -E '^(FAIL|image (tests|sweep):)' "$log" || true
    counted "$log" "sweep, native $mode"
done

step "wasm, under node"
if command -v emcc >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    "$KAMA" build tests/kama.json --target WASM -o tests/out/wasm/imagetests.js >/dev/null
    log=tests/out/wasm.log
    (cd tests && node out/wasm/imagetests.js) > "$log" 2>&1 || true
    grep -E '^(FAIL|image tests:)' "$log" || true
    counted "$log" "wasm"
    legs+=("$log")
else
    echo "skip the wasm leg: no emcc or node on PATH"
fi

# The encoder's promise: the same bytes on every leg. A leg that printed no encoded line fails, so none passes by
# printing nothing.
step "the same encoded bytes on every leg"
first=
for log in "${legs[@]}"; do
    grep '^encoded ' "$log" | tr -d '\r' > "$log.encoded" || true
    if [ ! -s "$log.encoded" ]; then echo "FAIL $log: no encoded line"; failed=1; continue; fi
    if [ -z "$first" ]; then first="$log.encoded"
    elif ! cmp -s "$first" "$log.encoded"; then
        echo "FAIL the encoded bytes differ between $first and $log.encoded:"
        diff "$first" "$log.encoded" | head -6 || true   # diff's status would end the script under pipefail
        failed=1
    fi
done
[ -n "$first" ] && echo "${#legs[@]} legs, $(wc -l < "$first") encoded lines each"

echo
if [ "$failed" = 0 ]; then echo "test: all passed"; else echo "test: FAILED"; exit 1; fi
