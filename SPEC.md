# @kama/image — the specification

What this package **is**, written after each piece lands. Never speculative: what is described here exists and is
tested. What comes next is [ROADMAP.md](ROADMAP.md), the decided design and its reasons are
[AGENTS.image.md](AGENTS.image.md) § Decided, the evidence behind them is [RESEARCH.md](RESEARCH.md), and the history is
the git log and [CHANGELOG.md](CHANGELOG.md).

**Where it stands** (2026-11-14, kama 0.9.949): the `Image` type, and PNG decoding of every colour type and bit depth,
palettes, `tRNS` and Adam7 interlacing, and the colour chunks, strict and within limits. Every PngSuite file and the
crafted cases are held to libpng's pixels and to what libpng keeps of their colour chunks, natively on Windows (debug
and release) and on wasm under node. Not published.

## Using it

Everything is `import { image::… }`, and each format is a module of its own, `import { image::png::decode }`, so a
program carries only the formats it imports.

```kama
import { std::fs::readFile, std::collections::DynamicArray, image::Image, image::ImageError, image::DecodeOptions,
         image::png::decode };

DynamicArray<uint8> file = …;                                   // a PNG's bytes, from anywhere
Result<Image, ImageError> r = decode(bytes: file.view(), options: DecodeOptions.defaults());
match (give r) {
    case Ok(value: img): { borrow img.bytes() as b { … upload b … } }
    case Err(error: e): { string why = e.message(); … }        // "chunk CRC in IDAT at byte 57"
};
```

## Invariants

- **No file ends the program.** A file that breaks its format, or would pass a limit, is an `ImageError`. Every size
  read from a file is checked against the limits before it is multiplied, and every number reaches an index only
  through `try cast`. A decode allocates at most `DecodeLimits.maxBytes` in all.
- **A decode is strict.** A broken critical chunk, image data that does not decode to exactly the image, a bad
  Adler-32 and a truncated file are refused. An ancillary chunk that is broken, repeated or out of place is dropped,
  as libpng drops it. It is stricter than libpng in one place: a palette in a grey image, which libpng drops, is refused.
- **Nothing converts silently.** An image keeps the file's precision; a 16-bit PNG decodes to 16-bit samples.
- **An image's samples are typed and handed out without a copy:** `bytes()` for every format, and `samples8()`,
  `samples16()` and `samplesF32()` for the format's own type.

## Images

`Image` is a `type resource`: its width and height (`isize`), a `PixelFormat`, an `AlphaMode`, a `ColorSpace`, and its
samples row by row from the top, four channels interleaved where the format has four.

- **`PixelFormat`** names the WebGPU texture format the samples upload to: `R8Unorm`, `Rg8Unorm`, `Rgba8Unorm`,
  `R16Unorm`, `Rg16Unorm`, `Rgba16Unorm`, `Rgba16Float` (a half float's bits as `uint16`) and `Rgba32Float`. It is
  `@nonExhaustive`. `channels()` and `sampleBytes()` answer 1, 2 or 4.
- **`AlphaMode`:** `Opaque`, `Straight` or `Premultiplied`.
- **`ColorSpace`**, a value:
  - `primaries`: `Unspecified`, `Bt709`, `DisplayP3`, `Bt2020`, `Custom` (chromaticities no named set matches) or
    `IccProfile` (an embedded profile describes them);
  - `transfer`: `Unspecified`, `Srgb`, `Linear`, `Gamma` (a power curve), `Pq`, `Hlg` or `IccProfile`;
  - `gamma`: a gAMA chunk's value as PNG stores it, the encoding exponent × 100000 (45455 is 1/2.2), when the transfer
    came from one, else 0;
  - `chromaticities`: a cHRM chunk's white point and primaries (`Chromaticities`, CIE x and y × 100000), when the
    primaries came from one, else all 0;
  - built with `unspecified()`, `srgb()`, `linearSrgb()` and `make(primaries:, transfer:)`.
- **Built from samples:** `Image.fromSamples8`, `fromSamples16` and `fromSamplesF32(width:, height:, format:, alpha:,
  colorSpace:, samples:)` take a `FixedArray` of exactly width × height × channels samples of the format's type, and
  refuse anything else as `ImageErrorKind::Samples`.
- **Read:** `width()`, `height()`, `format()`, `alpha()`, `colorSpace()`; and the windows `bytes()` (every sample in the
  host's byte order, little-endian on every target kama builds for), `samples8()`, `samples16()` and `samplesF32()`,
  each empty unless the image holds samples of its type. Each window is a mint: `borrow img.bytes() as b { … }`.
- **What a file says besides its pixels,** kept as it says it and never applied to the samples:
  - `iccProfile()`, a window on the embedded ICC profile's bytes, and `iccProfileName()`, its name as UTF-8;
  - `exif()`, a window on the Exif data's bytes;
  - `renderingIntent()`, an `Optional<RenderingIntent>` (`Perceptual`, `RelativeColorimetric`, `Saturation`,
    `AbsoluteColorimetric`);
  - `cicp()`, an `Optional<Cicp>`: H.273's `primaries`, `transfer` and `matrix` code points and `fullRange`, kept
    whether or not `ColorSpace` names them;
  - `masteringDisplay()`, an `Optional<MasteringDisplay>`: its red, green, blue and white x and y in units of
    0.00002, and its `maxLuminance` and `minLuminance` in units of 0.0001 cd/m²;
  - `contentLight()`, an `Optional<ContentLight>`: `maxCll` and `maxFall`, in units of 0.0001 cd/m².
- **`convert(to:)`** gives the image in another `PixelFormat`, sample by sample, and keeps its colour space, alpha mode
  and metadata (nothing here converts colour):
  - 8 to 16 bits is × 257, and 16 to 8 rounds as libpng's `scale_16` does;
  - a float to an unorm clamps to 0 to 1, a NaN is 0, and rounds half up;
  - to a half float rounds to nearest even, past 65504 is infinity, and the subnormals are kept;
  - one channel becomes two as (g, 1) and four as (g, g, g, 1), and two become four as (g, g, g, a);
  - fewer channels than the image has are refused as `Unsupported`, since which to keep is the program's to say.
- **Set,** by a decoder or by a program about to encode: `setColorSpace`, `setIccProfile(name:, profile:)`, `setExif`,
  `setRenderingIntent`, `setCicp`, `setMasteringDisplay` and `setContentLight`. None changes the samples.

## Errors

`ImageError` (`implements Error`) is a value: `kind()`, `at()` (the byte of the file it failed at, -1 when it is no one
byte's) and `chunk()` (the chunk's type as PNG stores it, 0 for none; `chunkCode(text: "IDAT")` gives the number).
`message()` names all three: "chunk CRC in IDAT at byte 57".

`ImageErrorKind` (`@nonExhaustive`): `Signature`, `Truncated`, `ChunkType`, `ChunkCrc`, `ChunkOrder`, `Header`,
`Palette`, `Data`, `DataChecksum`, `Limit`, `Unsupported` and `Samples`, each with `name()`.

## Decode options

`DecodeOptions.defaults()` holds `keepGrey` (false) and `limits`, a `DecodeLimits`. With `keepGrey`, a grey image decodes to
one channel (`R8Unorm`, `R16Unorm`), and grey with alpha, its own or a `tRNS` key's, to two (`Rg8Unorm`, `Rg16Unorm`), for
height maps and masks; any other image decodes as without it. A caller raises or lowers each limit:

| limit | default | what it bounds |
|---|---|---|
| `maxBytes` | 536,870,912 (512 MiB) | what a decode allocates in all: the samples, the compressed data and the rows on the way |
| `maxChunkBytes` | 8,000,000 | every chunk but image data |
| `maxAncillaryChunks` | 1,000 | how many ancillary chunks a file may hold |

## PNG

`image::png::decode(bytes:, options:) -> Result<Image, ImageError>`:

- **Every colour type and bit depth** (grey at 1, 2, 4, 8 and 16 bits, RGB, palette at 1 to 8, grey with alpha, RGBA),
  palettes and `tRNS` (a palette's alphas, a grey or RGB key), and Adam7 interlacing.
- **Expanded to four channels at the file's own depth:** `Rgba8Unorm` up to 8 bits (grey below 8 scaled as libpng
  scales it), `Rgba16Unorm` at 16, or kept grey with `keepGrey`. `Straight` when the file has alpha or a `tRNS`,
  otherwise `Opaque`.
- **Refused:**

  | kind | when |
  |---|---|
  | `Signature` | the first 8 bytes are not PNG's |
  | `Truncated` | the file ends inside a chunk, or before `IEND` |
  | `ChunkType` | a chunk's type is not four ASCII letters |
  | `ChunkCrc` | a critical chunk's CRC does not match, at the CRC's byte |
  | `ChunkOrder` | a chunk before `IHDR`, a second `IHDR` or `PLTE`, a palette in a grey image, a palette after the image data, image data split by another chunk, a palette image with no `PLTE`, `IEND` before any image data |
  | `Header` | `IHDR` is not 13 bytes, a width or height of 0 or past 2³¹−1, a bit depth its colour type does not take, a compression or filter method other than 0, an interlace method past 1 |
  | `Palette` | a `PLTE` that is not a whole number of entries, is empty, holds more than 256 or more than the bit depth allows, or a pixel naming an entry past its end |
  | `Data` | image data that is not a zlib stream, that inflates to fewer or more bytes than the image needs, or a row with no filter 0 to 4 |
  | `DataChecksum` | the zlib stream's Adler-32 does not match |
  | `Limit` | the image, its data or a chunk would pass a limit, or an `iCCP` profile inflates past one, or Exif data would pass `maxBytes` |
  | `Unsupported` | a critical chunk this decoder does not know |
- **The colour space,** by the PNG Third Edition's precedence (§ 4.3):
  1. a `cICP` this package names: matrix 0, full range, primaries 1 (`Bt709`), 9 (`Bt2020`) or 12 (`DisplayP3`), and
     transfer 13 (`Srgb`), 8 (`Linear`), 16 (`Pq`) or 18 (`Hlg`);
  2. else an `iCCP`, as `IccProfile` for both. The profile is never matched against sRGB's, as libpng since 1.6.47 does
     not;
  3. else `sRGB`, as `Bt709` and `Srgb`;
  4. else `gAMA` and `cHRM` together or alone: a gAMA of 100000 is `Linear`, any other `Gamma`; chromaticities within
     0.001 of BT.709's, Display P3's or BT.2020's are named, any others `Custom`.
- **The colour chunks kept,** each as libpng 1.6.50 keeps it: `cICP`, `iCCP`, `sRGB`, `gAMA`, `cHRM`, `mDCV` and `cLLI`
  before `PLTE` and `IDAT` and once; `eXIf` anywhere after `IHDR`, once. An `iCCP` profile is inflated within
  `maxChunkBytes` and `maxBytes`, and kept when it passes libpng's checks:
  - its declared length is its length, and at least 132;
  - a version 4 profile's length is a multiple of 4;
  - its tag table, and each tag, lie inside it;
  - its rendering intent is below `0xffff`;
  - it has the `acsp` signature;
  - an RGB profile is on a colour image and a grey one on a grey image;
  - it is not an abstract profile.
- **Dropped:**
  - an ancillary chunk with a bad CRC, a repeated one, or one out of place;
  - a `tRNS` the wrong length for its colour type;
  - an `sRGB` intent past 3;
  - a `gAMA` of 0, which libpng 1.6.59 reports as 1.0 (PNG Third Edition § 13.2), or past 2³¹−1;
  - a `cHRM` value past 2³¹−1;
  - an `iCCP` whose name is not 1 to 79 bytes, whose compression method is not 0, or whose profile is malformed;
  - an `eXIf` that does not start `II*\0` or `MM\0*`;
  - every ancillary chunk this decoder does not read.

  Bytes after `IEND` are not read.

## Tests

`tools/test.sh` is the gate: the roadmap's shape (`tools/check-roadmap.sh`), `kama check` on the package and its tests,
then `tests/`, one program, built debug and release and run natively, and built for the web and run under node with its
fixtures embedded. 459 cases on each leg:

- **Every fixture held to libpng's answer:** PngSuite 2017jul19's 176 files (`tests/fixtures/pngsuite/`, with its
  licence) and 27 crafted cases (`tests/fixtures/crafted/`, written by `tools/reference/craft.mjs`):
  - each decoded one has the same size, format, alpha and samples (their CRC-32) as libpng 1.6.59 decodes it;
  - each also has what libpng keeps of its colour chunks (the profile and Exif data by CRC-32, the cICP code points,
    mDCV by CRC-32, cLLI), and the colour space they give by the precedence above;
  - each is decoded again with `keepGrey`: a grey one has the format and samples libpng gives it without
    `png_set_gray_to_rgb` (54 of them), and any other is unchanged;
  - each refused one has the kind of error libpng's words name.

  The expectations are `tests/src/expected.kama`, written on purpose by `tools/reference/run.sh` from
  `tools/reference/expected.c`, never by the gate.
- **The refusals no fixture reaches,** each on a PNG built byte by byte (`tests/src/strict.kama`): each limit, the
  chunk rules, IHDR's other fields, `tRNS` kept and dropped, image data that is malformed or the wrong length, a pixel
  past the palette's end, an error's message, and an image built from samples that do not fit it.
- **The colour chunks' rules no fixture reaches** (`tests/src/colour.kama`):
  - each libpng check on an ICC profile, one field at a time;
  - a profile's compression method and name, a Latin-1 name, and a profile that inflates past `maxChunkBytes`;
  - the tolerance a named set of chromaticities is matched within;
  - a cICP this package does not name;
  - a gAMA of 0, out of place, or repeated;
  - Exif repeated, short, or past `maxBytes`;
  - mDCV and cLLI of the wrong length.
- **`convert(to:)`** (`tests/src/convert.kama`): every 8-bit value to 16 bits and every 16-bit value to 8, half floats
  from known float32 values (a tie, the largest finite, infinity, the smallest subnormal) and back, clamping and NaN,
  each channel mapping, the refusals, and the metadata kept.
- **The sweep** (`tests/src/sweep.kama`, `imagetests --sweep`), natively in debug and in release: every single-bit flip
  and every truncation of every fixture libpng decodes (crafted ones up to 3 KB), 1,165,833 decodes, with no trap. A flip
  inside a chunk's type or data has the chunk's CRC put right first, as libpng's OSS-Fuzz harness has libpng ignore
  CRCs, so the flip reaches the code behind the check. The debug build compiles the package and std at the release
  level (`debug.optimize` in `tests/kama.json`), which keeps kama's overflow traps and bounds checks: about 23 s a leg
  on the Windows box, where `-O0` took 405 s.
