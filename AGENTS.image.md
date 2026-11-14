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
answer. The answers are recorded here with their reasons, and the rows they create go in a `ROADMAP.md` (ids
`IMG-<n>`). What is open:

1. **The web: the browser's decoders and encoders, or kama's own everywhere?** kyoten's rule is to lean on the web
   ("as lean as possible on the web and rely on the best in class browser APIs"): `createImageBitmap` and WebCodecs'
   `ImageDecoder` decode, and `OffscreenCanvas.convertToBlob` encodes, adding no code to a page. But the browser's
   calls are asynchronous where a native decode is not, a browser may convert colour or premultiply alpha unless told
   not to, and its encoder's bytes differ from browser to browser. Measured first: whether a browser decodes a PNG to
   exactly its pixels with `colorSpaceConversion: "none"` and `premultiplyAlpha: "none"`, in every pinned browser, and
   what a kama codec costs a page in bytes.
2. **The image type:** width, height and pixels in one of a few layouts (8 and 16 bits a channel, half and full
   float), whether its values are sRGB-encoded or linear, and whether alpha is premultiplied, so a renderer never
   guesses.
3. **Untrusted input:** a decode takes limits (pixels, bytes, decompressed size), refuses what breaks the format
   (a CRC, a chunk out of order, a truncated stream) and never ends the program; a fuzz run in the gate.
4. **The formats and their order:** PNG first and whole (every colour type and bit depth, palettes, transparency,
   interlacing, and the colour chunks), for the goldens; then what `@kama/graphics` pulls: JPEG, Radiance HDR, OpenEXR,
   and KTX2 with Basis Universal transcoding (whose vendored C is GFX-2's question).
5. **Encoding:** a PNG encoder whose bytes depend only on the image and its options, for one kama version, which
   std's deflate already promises of its own output.

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
