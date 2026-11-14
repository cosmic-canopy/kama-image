# @kama/image roadmap, the detail

Each row's reasoning: what drives it, what it builds, what it needs, what is open, and what done means. A row's
questions are asked when it comes up, measured first, and their answers are recorded in
[AGENTS.image.md](AGENTS.image.md) § Decided. When a row ships, its section goes: what was built is the `SPEC.md`, and
how it was decided is the git log. `tools/check-roadmap.sh` holds every section to a row.

**Every row keeps the decided design** (AGENTS.image.md § Decided): the `Image` type, strict decoding within limits that
never ends the program, a module per format, and an encoder whose bytes depend only on the image and its options. Every
row is test-first: a change starts with a test that fails without it, and a case green on its first run is proved by
mutation.

<a id="png-decode"></a>
## IMG-1: PNG decoding, whole

**What drives it:** `@kama/graphics`' goldens (its GFX-1), read by its tests on every leg; then its textures (GFX-2), and
cosmic-forge, which reads PNG headers by hand today.

- **What it builds:**
  - **The `Image` type** (decision 1): `PixelFormat`, `ColorSpace` and `AlphaMode`, typed samples handed out as bytes,
    and `convert(to:)`.
  - **`image::png`'s decode:**
    - every colour type and bit depth (1, 2, 4, 8 and 16);
    - palettes and `tRNS`, and Adam7 interlacing;
    - the colour chunks (`cICP`, `sRGB`, `gAMA`, `cHRM`, `iCCP` kept, `mDCV`, `cLLI`), and `eXIf` kept;
    - APNG's default image.
  - **`DecodeLimits`, the errors** (naming what failed and at which byte), and `partial: true` (decision 2).
  - **The tests program,** `tests/`, one program as `@kama/gpu`'s, on native debug and release and on wasm under node.
    Whether a browser leg adds anything to a decode that touches no browser API is asked when the row starts.
    `tools/test.sh` runs it, with `tools/check-roadmap.sh`.
  - **The fixtures:**
    - PngSuite, whose licence grants copying and distribution "for any purpose", with its `PngSuite.LICENSE` beside it;
    - the crafted cases (RESEARCH.md § 1);
    - libpng's pixels for each file, kept as one hash a file, since every leg compares against the same reference.
  - **The flip-and-cut sweep** over every PngSuite file, in the gate, in debug and release (decision 2).
- **It starts from** the design pass's sketch (`.scratch/img-probe-kama/`), which is throwaway: it matched libpng on
  the 57 files it takes, and its per-byte loops are what made it twice libpng's time.
- **It needs** kama 0.9.949's `std::compress::zlib` and `std::digest::crc32`, and question 1's answer (decision 5): a
  PNG is decoded by kama on every leg.
- **Done:**
  - every PngSuite file decodes to libpng's pixels, or is refused as libpng refuses it, on every leg, and so does every
    crafted case;
  - the sweep finds no trap in debug or release;
  - every mutation is caught.

<a id="png-encode"></a>
## IMG-2: PNG encoding

**What drives it:** `@kama/graphics`' goldens (a differing frame is printed as one base64 PNG line, and
`tools/update-goldens.sh` writes it), then its screenshots (GFX-3).

- **What it builds:**
  - **`image::png`'s encode** with `EncodeOptions.standard()` (std's `Level6`, the adaptive filter) and `archival()`
    (`Frozen`);
  - **the filters**, adaptive, `None` and the five fixed ones, to choose from;
  - **the chunks:** `IHDR`, the colour chunks the image's colour space names, `IDAT` and `IEND`, with `IDAT`'s size
    fixed (decision 4).
- **It needs** IMG-1, to read back what it writes.
- **Done:**
  - every PngSuite image round-trips to the same pixels;
  - a fixed set of images encodes to the same bytes (one hash each) on every leg;
  - `archival()`'s hashes are written down, so a kama bump that moved them would fail the gate.

<a id="fuzz"></a>
## IMG-3: coverage-guided fuzzing, a stopgap

**What drives it:** decision 2. The flip-and-cut sweep covers one bit and one cut at a time; a fuzzer steered by coverage
reaches the combinations no sweep enumerates, and it is how libpng and the `png` crate are fuzzed (OSS-Fuzz).

- **What it builds:**
  - a libFuzzer target over kama's emitted C, in the WSL2 Ubuntu 26.04 that kama set up on the Windows box. Its clang
    21.1.8 has `libclang_rt.fuzzer` and `libclang_rt.asan` (RESEARCH.md § 3.3);
  - a kama built there, and a corpus seeded from PngSuite;
  - a run of a fixed length, outside the per-commit gate, whose findings become test cases.
- **Its first question:** how a C entry (`LLVMFuzzerTestOneInput`) reaches a kama decode.
- **It is replaced by** kama's KR-205, `kama fuzz`, when that ships. This row then retires.

<a id="publish"></a>
## IMG-13: the first publish

**What it needs:**
- kama's ruling on whether `@kama/image` is first-party, as KR-309 ruled `@kama/graphics`. The owner relays the
  question;
- `tests/` green on every target the package claims;
- the README and the description written for the registry.
