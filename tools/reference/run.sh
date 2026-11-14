#!/usr/bin/env bash
# Writes the tests' fixtures and expectations: the crafted cases (craft.mjs, into tests/fixtures/crafted/) and
# tests/src/expected.kama, libpng's answer for every fixture (expected.c). Run on purpose, never by the gate: its output
# is committed, so a libpng or zlib that answered otherwise shows as a diff to review. Needs node, a C compiler, libpng
# and zlib (msys2 UCRT64's on Windows, there with CC=gcc LDFLAGS=-static).
set -euo pipefail
cd "$(dirname "$0")/../.."
node tools/reference/craft.mjs tests/fixtures/crafted tests/fixtures/pngsuite
mkdir -p out/reference
"${CC:-cc}" -O2 -o out/reference/expected tools/reference/expected.c ${LDFLAGS:-} -lpng16 -lz
# tr: a C runtime that writes text as CRLF (Windows') would otherwise give the file another line ending each time
out/reference/expected tests/fixtures/pngsuite/*.png tests/fixtures/crafted/*.png | tr -d '\r' > tests/src/expected.kama
echo "wrote tests/src/expected.kama: $(grep -c 't.decoded' tests/src/expected.kama) decoded, $(grep -c 't.refused' tests/src/expected.kama) refused"
