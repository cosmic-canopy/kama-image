#!/usr/bin/env bash
# libpng reads every file the encoder writes. The tests program, built natively by tools/test.sh, writes each fixture
# libpng decodes, decoded and encoded with archival(), to tests/out/encoded/plain/, and each grey one decoded kept grey
# to tests/out/encoded/grey/ (`imagetests --encoded`). libpng then decodes each with any warning a failure
# (EXPECTED_STRICT), and its answer must be its answer on the fixture: the same size, format, alpha and samples, the same
# colour chunks kept, and the same filter chosen for each row (compare.mjs). Run on purpose, never by the gate, which has
# no libpng; needs what run.sh needs.
set -euo pipefail
cd "$(dirname "$0")/../.."
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) EXE=.exe ;; *) EXE= ;; esac
out=tests/out/encoded
rm -rf "$out"
mkdir -p "$out/plain" "$out/grey" out/reference
(cd tests && "./out/native-release/imagetests$EXE" --encoded) | tail -1
"${CC:-cc}" -O2 -o out/reference/expected tools/reference/expected.c ${LDFLAGS:-} -lpng16 -lz
EXPECTED_STRICT=1 out/reference/expected "$out"/plain/*.png | tr -d '\r' > "$out/plain.kama"
EXPECTED_STRICT=1 out/reference/expected "$out"/grey/*.png | tr -d '\r' > "$out/grey.kama"
node tools/reference/compare.mjs tests/src/expected.kama "$out/plain.kama" "$out/grey.kama"
