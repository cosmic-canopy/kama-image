# Images: the browser's codecs against kama's, the image type, untrusted input, the formats and a deterministic encoder

The design pass's evidence, gathered 2026-11-14 on the Windows box (AMD Ryzen AI 9 465, Radeon 880M, 12 GB, Windows 11)
for the five questions in [AGENTS.image.md](AGENTS.image.md) § Where things stand. What a section measured itself is
marked *Measured*, and its probe is named. The probes are in `.scratch/img-probe-*/` (git-ignored), each re-runnable
with its `run.sh`. The prior art was read by a research agent and checked against what the probes measured where the two
meet. *(unchecked)* marks a claim taken from one reading only. **Nothing here is a decision.** The decisions are the
owner's and go in AGENTS.image.md with their reasons.

| Source | Version, as of 2026-11-14 |
|---|---|
| kama | 0.9.949+g9f1fdaef, kyoten's pin, built from a clean clone |
| Edge | 157.0.4341.46, as installed, headless |
| Chrome for Testing | 157.0.8103.50, pinned in `~/browsers`, headless |
| Firefox | 160.0, pinned in `~/browsers`, headless |
| emscripten | 6.0.13; node 24.21.0 (msys2 UCRT64) for the wasm legs |
| libpng, zlib | 1.6.59 and 1.3.2 (msys2 UCRT64), the reference decoder and the speed baseline |
| PngSuite | 2017jul19 (`PngSuite-2017jul19.tgz`, sha256 `0294b244…37bfdc8`), 176 files. Its licence: "Permission to use, copy, modify and distribute these images for any purpose and without fee is hereby granted." |

**The corpus** (`.scratch/pngsuite/`, `.scratch/crafted/`): PngSuite's 176 files and 10 written by hand
(`img-probe-web/craft/craft.mjs`) for what PngSuite lacks: straight alpha at every level (`h8a`), 16-bit samples whose
low byte tells rounding from truncation (`h16a`, `h16g`), an `sRGB` chunk, `cICP` (Display P3, and BT.2020 PQ at 16 bits),
an `iCCP` holding a linear wide-gamut profile, an ancillary chunk with a bad CRC, a bad Adler-32 and a truncated stream.
**The reference pixels** are libpng's (`img-probe-web/ref/ref.c`): every file expanded to RGBA at its own depth, with no
gamma and no colour conversion. libpng decodes 170 (134 at 8 bits, 36 at 16) and refuses 16: PngSuite's 14 `x*` files,
the bad Adler-32 and the truncated stream. It keeps the ancillary chunk's image and drops the chunk.

**The sketch** (`img-probe-kama/`) is a throwaway decoder and encoder in kama, written for these measurements only. It
decodes non-interlaced 8-bit grey, grey and alpha, RGB, RGBA and palette images to RGBA8, and encodes RGBA8 with a choice
of deflate level and filter. Over the corpus it equals libpng's pixels on all 57 files it takes but one (`tbrn2c08`, an
RGB `tRNS` colour it does not implement), and it refuses the other 128 (`verify.sh`). On the two textures below its
pixels equal libpng's.

## 1. The web: the browser's codecs, or kama's on every leg

*Measured* (`img-probe-web/`, `web/decode.html`, `summarize.mjs`). Every file goes through every path a page has to a
decoded image's pixels, and each is compared sample by sample with libpng's. `createImageBitmap` takes
`{colorSpaceConversion: "none", premultiplyAlpha: "none"}`, and its bitmap is read out five ways. WebCodecs'
`ImageDecoder` takes `colorSpaceConversion: "none"` and is read out through `VideoFrame.copyTo`. It has no
`premultiplyAlpha` member ([WebCodecs](https://www.w3.org/TR/webcodecs/)).

### 1.1 Exact pixels

| path (Edge 157 · Chrome for Testing 157 · Firefox 160) | 8-bit files exact | 16-bit files, as 8 bits | corrupt files decoded |
|---|---|---|---|
| bitmap → WebGPU `copyExternalImageToTexture`, `rgba8unorm` | 134/134 · 134/134 · 134/134 | truncated · truncated · rounded | 1 · 1 · 3 |
| bitmap → WebGPU, `rgba16float` and `rgba32float` | 134/134 everywhere | the same 8 bits | as above |
| bitmap → WebGL2 `readPixels`, `RGBA8` and `RGBA32F` | 134/134 everywhere | the same 8 bits | as above |
| bitmap → `new VideoFrame(bitmap)` → `copyTo` | 116 · 116 · 134 | premultiplied · premultiplied · rounded | as above |
| bitmap → 2D canvas `getImageData` | 116/134 everywhere | premultiplied | as above |
| `ImageDecoder` → `copyTo` | 116/134 everywhere | premultiplied | as above |

- **8-bit PNGs are exact through WebGPU and WebGL in every browser.** That holds for the gamma files (`g*`), `cHRM`,
  `sRGB`, `iCCP` and both `cICP` files too: under `"none"` no browser converts colour.
- **The other paths premultiply.** The 18 files with alpha differ wherever alpha is below 255. The colour is lost where
  alpha is 0 (up to 255 apart), and rounded where it is in between. Only a GPU copy keeps straight alpha.
- **No browser keeps more than 8 bits of a 16-bit PNG, on any path.** `rgba32float` and WebGL's `RGBA32F` hold exact
  multiples of 1/255 (`h16a`, `h16g` and `hcicp-pq` alike).
- **The browsers disagree on the 8 bits.** Chromium truncates (`v >> 8`, all 36 files), and Firefox rounds (all 36).
  This agrees with the sources: Chromium decodes PNG with the Rust `png` crate through Skia's `SkPngRustCodec` since
  M139 ([image-rs](https://blog.image-rs.org/2026/06/18/png-adoption.html)), and Firefox uses libpng with
  `png_set_scale_16` ([nsPNGDecoder.cpp](https://github.com/mozilla-firefox/firefox/blob/main/image/decoders/nsPNGDecoder.cpp)).
  So the same 16-bit file gives different pixels in Firefox and in Edge.

### 1.2 Corrupt files

| file | libpng | Chromium (Edge, Chrome for Testing) | Firefox |
|---|---|---|---|
| PngSuite's 14 `x*` (signature, IHDR, bit depth, colour type, CRCs, missing IDAT) | refused | refused | refused, except `xcsn0g01` (IDAT CRC), decoded |
| `hbadadler` (zlib checksum wrong) | refused | **decoded** | **decoded** |
| `htrunc` (cut mid-IDAT) | refused | refused | **decoded, partially** |
| `hbadcrc-text` (ancillary CRC) | decoded, chunk dropped | decoded | decoded |

This is each decoder's own policy, and the sources say so too:
- The `png` crate skips the Adler-32 by default (`ignore_adler32: true`,
  [DecodeOptions](https://docs.rs/png/latest/png/struct.DecodeOptions.html)).
- Firefox treats a CRC error as recoverable and keeps what decoded.
- Chromium keeps the rows of a truncated stream for display ([SkPngRustCodec.cpp](https://skia.googlesource.com/skia/+/HEAD/src/codec/SkPngRustCodec.cpp)).
  Here, though, `createImageBitmap` refused one.

### 1.3 What a kama codec costs a page

*Measured* (`img-probe-size/run.sh`). The same program is built four times with `--target WASM --release` (kama's
`-Oz`), and the four builds differ only in what they call. The base reads a file and prints its length.

| build | `.wasm` | gzip -9 | brotli 11 | over the base, brotli |
|---|---|---|---|---|
| base | 14,800 | 6,720 | 5,661 | 0 |
| + decode | 32,541 | 15,805 | 13,595 | **+7,934** |
| + encode (at `Frozen`) | 32,974 | 15,155 | 13,077 | **+7,416** |
| + both | 46,727 | 21,548 | 18,559 | **+12,898** |
| + both, at `-O3` | 71,227 | | 23,984 | +18,457 over the `-O3` base (5,527) |

- The JS glue is the same in all four builds, 13.7 KB brotli.
- The sketch is 8-bit only. A whole PNG decoder adds 16 bits, interlacing, low bit depths and the colour chunks, so it
  will be somewhat larger *(an estimate)*.
- The browser path adds no codec. It costs a `jsLibraries` glue file and a polled request (§ 1.6).

### 1.4 Time

*Measured*, once the machine was quiet. Each figure is the best of 10, decoding to RGBA8, on two textures from The Mallow
Man: a 2048² RGB backdrop (2.8 MB) and a 1024² RGBA bark (2.6 MB). The probes are `img-probe-web/ref/timing.c`,
`img-probe-kama decode`, `img-probe-kama-wasm{,-o3}` under node, and `web/timing.html`.

| decoder | 2048² RGB | 1024² RGBA |
|---|---|---|
| libpng 1.6.59, native | 40.8 ms | 19.3 ms |
| the kama sketch, native release | 77.2 ms | 33.0 ms |
| the kama sketch, wasm, kama's release (`-Oz`) | 294.7 ms | 142.7 ms |
| the kama sketch, wasm, `-O3` | 83.6 ms | 36.0 ms |
| `createImageBitmap`: Edge · Chrome for Testing · Firefox | 35.2 · 32.5 · 31 ms | 14.2 · 14.1 · 17 ms |
| `ImageDecoder`: Edge · Chrome for Testing · Firefox | 28.4 · 27.7 · 27 ms | 12.3 · 12.4 · 17 ms |

- **Inflate alone,** on the same concatenated IDAT data (2048² · 1024²):
  - zlib 1.3.2: 24.9 · 11.7 ms;
  - std's `ZlibReader`, natively: 35.2 · 19.7 ms, so 1.4 to 1.7 times zlib's time;
  - std's `ZlibReader`, on wasm: 120.3 · 87.1 ms at `-Oz`, and 41.1 · 23.0 ms at `-O3`.
- **The rest of the sketch's time is its own naive code:** one `add` a byte, and a filter chosen per byte.
- **On wasm, kama's size-first release costs this code 3 to 3.5 times its speed.** That is kama's KR-332, "A wasm
  release can be optimized for speed" ("measure size against speed … first"). These numbers are KIMG-1's evidence for it.
- A browser decodes off the page's thread. A kama decode runs on whichever thread calls it.

### 1.5 The browser's encoder

*Measured* (`web/decode.html`, then `ref.exe` on its output). `OffscreenCanvas.convertToBlob({type: "image/png"})` was run
on libpng's pixels of three files.

| file | Edge · Chrome for Testing | Firefox | pixels back |
|---|---|---|---|
| `basn2c08` (opaque RGB) | 344 B, the same bytes | 220 B | exact |
| `basn6a08` (RGBA) | 909 B, the same bytes | 805 B | 922 · 930 samples differ, up to 255 |
| `h8a` (straight alpha) | 22,374 B, the same bytes | 19,646 B | 25,023 · 24,878 samples differ |

- Chromium and Firefox write different bytes.
- **Firefox adds a private `deBG` chunk holding 16 hexadecimal characters** (`C4F486C29160E7B8` in one run).
- The canvas premultiplies, so colour under partial alpha does not come back. Alpha itself does.

### 1.6 Asynchronous on the web

- **The browser decodes behind a promise,** both `createImageBitmap` and `ImageDecoder.decode`.
- **kama on the web has no Asyncify and no JSPI** (kama's `docs/design/fibers.md:43`). So a browser decode is a request
  that the program polls once a tick, as `@kama/gpu` polls an adapter request (its SPEC: "What is asynchronous is
  polled, never a callback into kama") and `@kama/window` pumps events.
- **A kama decode is a plain call on every leg.** A browser-backed decode would be a request on the web, so one
  interface for both would make the decode a request natively too.

## 2. The image type

From the sources, with links in each:

| library | what a decoded image is | colour space | alpha |
|---|---|---|---|
| Rust `image` 0.25 ([DynamicImage](https://docs.rs/image/latest/image/enum.DynamicImage.html)) | one variant per `ColorType`: L8, La8, Rgb8, Rgba8, the same at 16 bits, Rgb32F, Rgba32F. No f16, no BGR | `Cicp` (H.273 primaries, transfer, matrix, range), with conversions | not tracked |
| Rust `png` 0.18 ([Info](https://docs.rs/png/latest/png/struct.Info.html)) | the file's own colour type and bit depth; `Transformations` EXPAND, STRIP_16, ALPHA; the default is the raw samples | every chunk kept: `gAMA`, `cHRM`, `sRGB`, `iCCP`, `cICP`, `mDCV`, `cLLI`, `eXIf` | the file's |
| stb_image ([header](https://github.com/nothings/stb/blob/master/stb_image.h)) | 8-bit, 16-bit or float entry points, any channel count asked for | none (float applies gamma 2.2) | the file's |
| the web ([HTML](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html)) | `ImageData`: `rgba-unorm8`, or `rgba-float16` (Chrome 137 only) | `srgb` or `display-p3` | straight in `ImageData`, chosen by option in a bitmap |
| WebGPU ([spec](https://www.w3.org/TR/webgpu/)) | texture formats: `rgba8unorm(-srgb)`, `rgba16float` and `rgba32float` in core; `r16unorm` and `rgba16unorm` only with `texture-formats-tier1` (Chrome 142), and not a destination of `copyExternalImageToTexture` | the `-srgb` formats decode on sampling | a copy chooses |
| three.js ([Texture](https://threejs.org/docs/pages/Texture.html)) | a texture's `type` and `format` | `colorSpace`: none, `srgb`, `srgb-linear` | `premultiplyAlpha` flag |
| Bevy ([Image](https://docs.rs/bevy_image/latest/bevy_image/struct.Image.html)) | bytes and a wgpu `TextureDescriptor`. 8 bits become `Rgba8UnormSrgb` or `Rgba8Unorm` by `is_srgb` (default true); **16 bits always become `Rgba16Unorm`, linear** | `is_srgb` | not tracked |
| KTX2 ([2.0.4](https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html)) | `vkFormat`, plus a Data Format Descriptor | DFD `transferFunction` and `colorPrimaries`; an `*_SRGB` format must say sRGB | DFD flag `ALPHA_PREMULTIPLIED` |

*Measured* in kama (`img-probe-hostile/views.kama`):
- **A typed buffer is handed out as bytes in place.** A `View<uint16>` or `View<float32>` gives `bytes()` (kama SPEC § The
  bytes of a plain value), in host layout, little-endian on every target kyoten builds for. So samples kept typed
  upload with no copy.
- **The reverse is refused outside `unsafe`:** no view of bytes as `uint16` or `float32`.
- **kama has no `float16` type**, so a half-float sample is a `uint16` of bits.

An example from the owner's own assets: The Mallow Man's `pine_bark_disp_2k.png` is a 16-bit grey height map. As 8-bit
RGBA it would lose half its precision and take four times its channels.

## 3. Untrusted input

### 3.1 kama on hostile values

*Measured* (`img-probe-hostile/hostile.kama`): the unchecked spellings a decoder might write, on an IHDR width of
`0xFFFFFFF0`.

| spelling | debug | release |
|---|---|---|
| `cast<int32>(w)` | traps: "value 4294967280 does not fit the target range" (exit 127) | traps the same |
| `try cast<int32>(w)` | `None`, no trap | the same |
| an `int32` product that overflows | traps: "arithmetic overflow" | **wraps silently** (gives -94967296) |
| an index past a `DynamicArray`'s end | traps: "index out of bounds" | traps the same |
| a bomb: 260,922 B of zlib that inflates to 256 MiB, read with a 64 MiB `limit` | 64 MiB read, then refused (`LimitExceeded`), no trap | the same |

- **kama keeps a hostile file from corrupting memory, but a trap ends the program.**
- **A decoder that never ends the program has to validate every size before it multiplies,** and take every value
  from the file through `try cast`. std has no checked arithmetic: `std::num` has `wrapping*` and `mulWide*` only.
- **A release build hides an overflow that debug traps.** Both builds need the tests.

### 3.2 What the others do

| decoder | default limits | checksums |
|---|---|---|
| libpng 1.6 ([pnglibconf](https://github.com/pnggroup/libpng/blob/libpng16/scripts/pnglibconf.h.prebuilt#L221-L224)) | width and height 1,000,000; 1,000 cached text and unknown chunks; 8,000,000 B for any chunk but IDAT | a critical chunk's CRC is an error, an ancillary chunk's is a warning and the chunk is dropped; the Adler-32 is checked |
| Rust `png` ([Limits](https://docs.rs/png/latest/png/struct.Limits.html)) | 64 MiB of its own buffers, best effort | CRC checked, **Adler-32 ignored**, ancillary CRC failures skipped |
| Rust `image` ([Limits](https://docs.rs/image/latest/image/struct.Limits.html)) | no width or height limit, 512 MiB of allocation | its decoders' |
| Chromium (Blink) | no dimension cap on desktop; Android: 3 M pixels on a low-end device, memory ÷ 25 otherwise | the `png` crate's; partial rows kept on a truncated stream |
| Firefox | by its surface cache (`image.mem.surfacecache.max_size_kb`); dimensions to 2³¹−1 | a CRC error recoverable: what decoded is kept |
| stb_image | 2²⁴ a side | its README: "If security is a priority, consider using Wuffs instead" |

The PNG Third Edition ([W3C REC, 2025-06-24](https://www.w3.org/TR/png-3/) § 13) says to detect errors early by the
signature and each chunk's CRC. It treats an unexpected end as corruption, which "may be fatal", though a viewer may
keep showing what it has. Its § 13.3 warns about very large chunks.

### 3.3 Fuzzing

- **A deterministic sweep in kama,** run as std's `tests/compress_flips.kama` runs (every single-bit flip and every
  truncation, each answered `Ok` or `Err`, never a trap). *Measured* (`img-probe-kama/flips.sh`) over the 54 PngSuite
  files the sketch decodes, 46,942 B: 375,536 flips and 46,942 cuts, no trap, in 32.2 s in release and 34.0 s in debug.
  A whole decoder takes all 162 valid files, so roughly two to three times that a leg *(an estimate)*.
- **Coverage-guided fuzzing.** kama has no `kama fuzz` yet. KR-205, "Coverage-guided fuzzing", is on its roadmap marked
  "Design first".
  - msys2's clang on Windows has no libFuzzer or ASan runtime.
  - The WSL2 Ubuntu 26.04 that kama set up on this machine for its Linux legs (kama's `docs/platforms/windows.md`) has
    clang 21.1.8 with `libclang_rt.fuzzer-x86_64.a` and `libclang_rt.asan-x86_64.a`.
  - A harness over kama's emitted C was not tried. It needs a C entry (`LLVMFuzzerTestOneInput`) into a kama decode,
    and a kama built in that Linux.
- **What the sources fuzz:** libpng is an OSS-Fuzz project, and so is the `png` crate (as `image-png`, with decode,
  buf_independent and roundtrip targets) ([OSS-Fuzz](https://github.com/google/oss-fuzz/blob/master/projects/image-png/build.sh)).

## 4. The formats

**What `@kama/graphics` pulls** (its `ROADMAP.md` and `ROADMAP_DETAIL.md`):
- GFX-1: PNG, read and written, for its goldens.
- GFX-2, a level: glTF images (PNG and JPEG in glTF's core), KTX2 transcoded with Basis Universal to BC, ASTC or ETC2,
  and mipmaps. Its open questions are "the native image decoder, given that it reads untrusted files, and its license"
  and "Basis Universal's transcoder … as vendored C".
- GFX-3, a product viewer: "lighting from an HDR image: the HDR and EXR loaders", and screenshots.
- GFX-17: HDR displays and wide gamut.

**What others cover:**
- **three.js:** the browser decodes PNG, JPEG, WebP and AVIF. In JS or wasm it adds HDR, EXR, KTX2 (Basis Universal
  wasm), KTX, DDS, PVR, TGA, TIFF and UltraHDR, and JPEG XL through the browser
  ([loaders](https://github.com/mrdoob/three.js/tree/dev/examples/jsm/loaders)).
- **Bevy:** png, hdr and ktx2 come with its default API sets. basis-universal, bmp, dds, exr, ff, gif, ico, jpeg, pnm,
  qoi, tga, tiff and webp are opt-in features ([cargo_features.md](https://github.com/bevyengine/bevy/blob/main/docs/cargo_features.md)).
- **Godot 4:** BMP, DDS, KTX, EXR, HDR, JPEG, PNG, TGA, WebP and SVG. PNG and WebP are kept at 8 bits a channel
  ([docs](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_images.html)).

**What browsers decode** ([MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)):
- PNG (APNG too), JPEG, GIF, BMP, ICO and WebP everywhere.
- AVIF since Chrome 85, Firefox 93 and Safari 16.1.
- JPEG XL arriving: Chrome 155 behind a flag, with the Rust jxl-rs ([chromestatus](https://chromestatus.com/feature/5114042131808256)),
  and Firefox's intent to ship for 158.
- None decodes Radiance HDR or OpenEXR *(an inference: neither is listed, and three.js decodes both itself)*.

**The PNG Third Edition** (2025) standardises APNG, `cICP` (H.273, for HDR and wide gamut), `mDCV` and `cLLI`, and moves
`eXIf` in.

## 5. A deterministic encoder

**std's promise** (deflate.kama:42-43): "The output depends only on the input and the level, never on how the writes
were split, on every target, for one kama version; only `Frozen` promises the same across versions" (`Frozen` "never
changes", deflate.kama:547-549).

*Measured* (`enc/determinism.sh`): the sketch's encoder, with its adaptive filter, on four legs.
- **The bytes were identical on all four legs,** at `Frozen` and at `Level6`, on both inputs: native debug, native
  release, wasm at `-Oz` and wasm at `-O3`.
  - The lit cube from kyoten's GFX-1 probe, 256², opaque: 2,345 B at `Frozen` and 2,583 B at `Level6`.
  - A 1920×1080 photographic crop: 1,111,049 B and 1,192,790 B.
- **Encode time on that crop at `Frozen`:** 24.2 s in native debug, 3.95 s in native release, 7.3 s on wasm at `-Oz`,
  and 4.8 s at `-O3`.

*Measured* (`img-probe-kama encode`, natively, release, best of 3 to 10), against libpng's defaults (zlib level 6 and its
own filter heuristic, `ref/encode.c`):

| input | libpng | `Frozen`, no filter | `Frozen`, adaptive | `Level6`, adaptive | `Level1`, adaptive | `Level9`, adaptive |
|---|---|---|---|---|---|---|
| the lit cube, 256² | 2,713 B, 1.4 ms | **1,795 B**, 2.9 ms | 2,345 B, 5.6 ms | 2,583 B, 5.2 ms | 2,646 B, 4.0 ms | 2,258 B, 12.2 ms |
| the bark, 1024² RGBA | 2,411,278 B, 302 ms | 3,678,556 B, 143 ms | 2,492,076 B, 343 ms | 2,492,297 B, 337 ms | 2,563,316 B, 122 ms | 2,492,076 B, 342 ms |
| the photo crop, 1920×1080 | 1,207,531 B, 427 ms | 1,650,754 B, 1.11 s | **1,111,049 B**, 3.94 s | 1,192,790 B, 0.81 s | 1,442,505 B, 0.15 s | 1,074,984 B, 8.36 s |

- **The adaptive filter** is libpng's: per row, the filter with the least sum of absolute differences. It is a pure
  function of the pixels, so it keeps the bytes the same everywhere.
- **On a flat render, no filter is smallest.** On a photograph, the adaptive filter is a third smaller.
- **`Frozen` searches as deep as `Level8`,** so on photographic content it is slow. On a golden-sized render it takes
  milliseconds natively.
- A browser's encoder gives neither promise (§ 1.5).

## The probes

| probe | what it measures | run |
|---|---|---|
| `img-probe-web/` | the browser's decode against libpng's (§ 1.1, 1.2), its encoder (§ 1.5) and its decode time (§ 1.4): the crafted cases, libpng's reference, timers, a page runner adapted from kyoten's gfx1 probe | `run.sh` |
| `img-probe-kama/` | the sketch: its pixels against libpng's, decode and inflate times, the encoder table, the flip-and-cut sweep | `verify.sh`, `flips.sh <debug\|release>`, `imgprobe <mode>` |
| `img-probe-kama-wasm/`, `img-probe-kama-wasm-o3/` | the sketch on wasm under node, at kama's release and at `-O3`, with the inputs embedded | built by `enc/determinism.sh` |
| `img-probe-size/` | what the codec adds to a page | `run.sh` |
| `enc/` | the encoder's bytes on four legs | `determinism.sh` |
| `img-probe-hostile/` | kama on hostile values; typed buffers as bytes | `kama build hostile.kama`, `kama run views.kama` |
