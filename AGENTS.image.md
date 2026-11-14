# @kama/image — what is true in THIS repo

The two generated files carry the general rules: `AGENTS.md` is the language, and `AGENTS.package.md` is the half a
publishable library needs. `kama agents install` writes both, and a re-install rewrites them, so they are **not**
hand-edited. This file is the project-specific third, and it is the one to edit.

## What this is

**Image codecs for kama: decoding and encoding the image formats programs read and write, on every target.** It names
no engine and needs no GPU, so a tool, a server, a content pipeline and a renderer use it alike.

The owner decided on 2026-11-14 that images are a package of their own (kyoten's
`../kyoten/docs/design/rendering.md` § Decided, GFX-1's part 1, question 2): "If it makes sense to have a separate image
package I'm good with that." It was proposed over a module of `@kama/graphics`, because image formats are general, and
over asking kama for `std::image`, which kama's roadmap does not plan (kama's std has deflate, zlib and crc32, and no
image format). Its first users:
- **`@kama/graphics`' golden images** (its GFX-1): PNGs kept in its repository and compared byte for byte, read and
  written by its tests on every leg, the web included;
- **`@kama/graphics`' textures and screenshots** later (its GFX-2 and GFX-3): GFX-2's open question about a native
  decoder for untrusted files is answered here, by a decoder written in kama, which is memory-safe;
- **cosmic-forge**, which reads PNG headers by hand today (`../cosmic-forge/flows/src/meshes.kama`, `pngSize`).

## Where things stand

**Seeded on 2026-11-14 with `kama seed` on kama 0.9.947+gf919c10e (kyoten's pin). Nothing is built.** Whether it is a
first-party package, as kama ruled `@kama/graphics` one (KR-309), is kama's to rule; the owner relays the question.

**A short design pass comes before any code,** as `@kama/graphics`' and `@kama/audio`'s did. Each question is measured
first where it can be, then asked of the owner in full: the problem, an example, the options and the production
answer. The answers are recorded below with their reasons, and the rows they create are in [ROADMAP.md](ROADMAP.md)
(ids `IMG-<n>`). **All five were measured on 2026-11-14, on kama 0.9.949, and put to the owner the same day**: the
evidence is [RESEARCH.md](RESEARCH.md), its probes in `.scratch/img-probe-*/`. Four are decided; one waits on the owner:

1. **The web: the browser's decoders and encoders, or kama's own everywhere?** *Proposed, not decided.* The proposal is
   kama's PNG codec on every leg, with the browser's own decoders later for the lossy formats on the web. The owner
   (2026-11-14): "I think your recommendation is likely good so far". The owner then asked four things, and each was
   answered the same day:
   - **Whether a request checked every frame costs anything:** one acquire load, 1 ns natively and 0.6 ns on wasm
     (`.scratch/img-probe-poll/`). kama on the web has no way to wait on a promise, and `@kama/gpu`'s rule forbids a
     callback into kama.
   - **The codec's size:** +7.9 KB brotli to decode and +12.9 KB with the encoder (RESEARCH § 1.3), only in a program
     that imports it.
   - **Whether the browser's decoders can serve the lossy formats on the web:** yes.
   - **Whether these could be build switches.** Importing a format's module is one switch. The target decides the
     other, which decoder backs a format on each leg, inside the package. No flag changes what a PNG decode means.

   Waiting on the owner's confirmation. Nothing that depends on it is built.
2. **The image type:** decided (§ Decided, 1).
3. **Untrusted input:** decided (§ Decided, 2).
4. **The formats and their order:** decided (§ Decided, 3).
5. **Encoding:** decided (§ Decided, 4).

## Decided

1. **Decided on 2026-11-14: an `Image` is a pixel format the GPU uploads, a colour space and an alpha mode, at the
   file's own precision** (question 2). The owner: "I will defer to you for the kama production grade answer."
   - **`PixelFormat`, a closed set named as WebGPU names its texture formats:** `r8unorm`, `rg8unorm`, `rgba8unorm`,
     `r16unorm`, `rg16unorm`, `rgba16unorm`, `rgba16float` and `rgba32float`. It is `@nonExhaustive`, so a
     later format adds one.
   - **The samples are kept typed:** `uint8`, `uint16` in the host's order, a half float's bits as `uint16` (kama has
     no `float16`), and `float32`. The image hands them out as bytes with no copy (`bytes()` on a view of numbers,
     RESEARCH § 2), so they reach the GPU as they are.
   - **`ColorSpace`** is primaries and transfer, read from the file's `cICP`, `sRGB`, `gAMA` and `cHRM` chunks in the
     precedence the PNG Third Edition gives them. sRGB, linear sRGB, Display P3, and BT.2020 with PQ or HLG are named,
     and *unspecified* when the file says nothing. An `iCCP` profile is kept as its bytes and never applied by a
     decode. `mDCV` and `cLLI` are kept.
   - **`AlphaMode`:** opaque, straight or premultiplied. A PNG decodes straight, or opaque.
   - **A decode expands to four channels at the file's own depth by default.** A palette and `tRNS` become RGBA, and grey
     becomes RGBA too. An option keeps grey as one channel and grey with alpha as two, for height maps and masks.
   - **Nothing converts silently.** `convert(to:)` changes the format when a program asks: `rgba16unorm` to
     `rgba16float`, say, for a web device without `texture-formats-tier1`.
   - **Why** (RESEARCH § 2):
     - A renderer never guesses sRGB against linear, or whether alpha is premultiplied. The `image` crate leaves
       alpha untracked, and Bevy makes every 16-bit image linear.
     - 16 bits survive: The Mallow Man's `pine_bark_disp_2k.png` is a 16-bit grey height map.
     - WebGPU has no three-channel format.
2. **Decided on 2026-11-14: a decode is strict by default, within limits, and never ends the program** (question 3).
   The owner: "I will take your recommendation."
   - **`DecodeLimits`**, each raisable or lowerable by the caller:
     - 512 MiB a decode may allocate in all (the `image` crate's default);
     - 8,000,000 B for any chunk but IDAT (libpng's);
     - 1,000 text and unknown chunks (libpng's);
     - no width or height limit beyond memory and the format's own 2^31 - 1.
   - **Refused, with an error that names what failed and at which byte:** the signature, a critical chunk's CRC, a
     chunk out of order, the zlib stream and its Adler-32, and a truncated stream. An ancillary chunk with a bad CRC
     is dropped with a warning, as libpng and the PNG Third Edition (§ 13) do.
   - **`partial: true` is opt-in:** it returns the rows decoded before a truncation, for a viewer. It is never the
     default.
   - **Written never to trap:** every size is checked before any arithmetic, and every value read from the file goes
     through `try cast`. The tests run in debug and in release, since release wraps an overflow silently
     (RESEARCH § 3.1).
   - **Proved three ways:**
     - PngSuite's corrupt files and the crafted cases, in the tests;
     - every single-bit flip and every truncation of every PngSuite file, in the gate, in debug and release;
     - a coverage-guided libFuzzer run over kama's emitted C on Linux (WSL2 here, CI later), a **stopgap** until kama's
       KR-205, `kama fuzz`, replaces it.
   - **Why:** RESEARCH § 3.
3. **Decided on 2026-11-14: every format is roadmapped, and PNG is built now** (question 4). The owner: "It sounds like we
   roadmap them all and do what you recommend now."
   - **The order:**
     1. PNG whole: decoded, then encoded;
     2. JPEG;
     3. KTX2 with Basis Universal transcoding;
     4. Radiance HDR, then OpenEXR;
     5. WebP and AVIF;
     6. APNG's frames and JPEG XL;
     7. the long tail as a program pulls it (GIF, TGA, BMP, DDS, QOI, TIFF).
   - **Each format is a module a program imports,** so a page carries only what it imports. Code nothing calls adds
     nothing (RESEARCH § 1.3).
   - **Why:** `@kama/graphics` pulls them in this order: its GFX-1, GFX-2 and GFX-3 (RESEARCH § 4).
4. **Decided on 2026-11-14: the encoder's default is fast and the same everywhere, and an archival setting keeps its bytes
   across kama versions** (question 5). The owner: "I will defer to your production answer."
   - **`EncodeOptions.standard()`** is the default: std's `Level6` with libpng's adaptive filter, which per row takes the
     filter with the least sum of absolute differences.
   - **`EncodeOptions.archival()`** is `Frozen`, for a file kept in a repository. The goldens use it, so a kama bump never
     rewrites an unchanged golden.
   - **The promise:** the bytes depend only on the image and its options, on every target, for one kama version, and
     with `archival()` across versions too. That is std's promise (deflate.kama:42-43), and it was measured on native
     debug, native release, and wasm at `-Oz` and `-O3`.
   - **The filters:** the five fixed filters and `None` can be chosen. On a flat render no filter is smallest, and on a
     photograph the adaptive filter is a third smaller.
   - **The chunks written:** `IHDR`, the colour chunks the image's colour space names (`sRGB` for sRGB, `cICP`
     otherwise, and an `iCCP` passed through when the image carries one), `IDAT` and `IEND`. Never `tIME` or text
     unless the program gives them.
   - **Why** (RESEARCH § 5):
     - On a 1080p photograph, `Frozen` takes 3.9 s against `Level6`'s 0.8 s, which is too slow for a screenshot's
       default.
     - A browser's encoder keeps neither promise.

## Where the truth is

- **This repository's documents,** once the design pass writes them: `SPEC.md` is what the package is, `ROADMAP.md` the
  order of work, `KAMA_GAPS.md` what it hits in kama.
- **kyoten's decisions on it** are in `../kyoten/docs/design/rendering.md` § Decided (2026-11-14).
- **kyoten builds it, as `@kama/graphics`' first need**, and drives what production grade means for it, as for
  `@kama/gpu` and `@kama/window` (the owner, 2026-11-08: "The bar is production grade general solutions").

## Rules

- **Never edit `../kama` from here.** A compiler or std gap goes in [KAMA_GAPS.md](KAMA_GAPS.md), with a minimal repro
  and the kama version.
- **Name no engine.** Nothing here names kyoten or a game.
- **Verify, don't trust.** Compile the snippet, run it, read the emitted C. A doc is not evidence, including this one.
- **Test-driven** (the owner, 2026-11-08). A change starts with a test that fails without it, and a bug is fixed only
  after a test reproduces it. The suite passes before every commit.
- **Dependencies are injected** (the owner, 2026-11-08). Code takes what it depends on as a parameter or a contract,
  so a test hands it a fake.
- **Commit on `main`, and push only when the owner asks.**

## Build

    kama check kama.json

On Windows, drive kama from msys2 UCRT64 (kama's `docs/platforms/windows.md`). Where `kama` is not on the `PATH`, use
kyoten's pin, `../kyoten/tools/kama`.
