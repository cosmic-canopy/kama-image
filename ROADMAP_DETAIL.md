# @kama/image roadmap, the detail

Each row's reasoning: what drives it, what it builds, what it needs, what is open, and what done means. A row's
questions are asked when it comes up, measured first, and their answers are recorded in
[AGENTS.image.md](AGENTS.image.md) § Decided. When a row ships, its section goes: what was built is the `SPEC.md`, and
how it was decided is the git log. `tools/check-roadmap.sh` holds every section to a row.

**Every row keeps the decided design** (AGENTS.image.md § Decided): the `Image` type, strict decoding within limits that
never ends the program, a module per format, and an encoder whose bytes depend only on the image and its options. Every
row is test-first: a change starts with a test that fails without it, and a case green on its first run is proved by
mutation.

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
- **It needs** the decoder, built, to read back what it writes.
- **To settle when it starts,** under the owner's word on decision 4 ("I will defer to your production answer"), each
  measured or checked against libpng and the PNG Third Edition, then recorded in AGENTS.image.md § Decided:
  - **which colour type an image is written as:** an `Opaque` RGBA image as RGB, one or two channels as grey, or every
    image as it is held;
  - **what is refused:** premultiplied alpha, which PNG cannot hold, and the float formats, which want `convert(to:)`
    to a unorm first;
  - **the colour chunks for each colour space:** sRGB with the gAMA the specification recommends beside it, a cICP for
    the spaces it names, gAMA and cHRM for `Gamma` and `Custom`, and an iCCP for `IccProfile`;
  - **what the image carries that is written back:** the profile, Exif, cICP, mDCV and cLLI, so a decode and an encode
    round-trip;
  - **the IDAT size,** a fixed length so the bytes do not depend on how the encoder was fed.
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
