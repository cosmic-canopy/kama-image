# @kama/image — the specification

What this package **is**, written after each piece lands. Never speculative: what is described here exists and is
tested. What comes next is [ROADMAP.md](ROADMAP.md), the decided design and its reasons are
[AGENTS.image.md](AGENTS.image.md) § Decided, the evidence behind them is [RESEARCH.md](RESEARCH.md), and the history is
the git log and [CHANGELOG.md](CHANGELOG.md).

**Where it stands** (2026-11-14, kama 0.9.949): the `Image` type, and PNG decoding of every colour type and bit depth,
palettes, `tRNS` and Adam7 interlacing, strict and within limits, held to libpng's pixels on every PngSuite file and on
the crafted cases, natively on Windows (debug and release) and on wasm under node. Not published.

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
- **`ColorSpace`:** `primaries` (`Unspecified`, `Bt709`, `DisplayP3`, `Bt2020`) and `transfer` (`Unspecified`, `Srgb`,
  `Linear`, `Pq`, `Hlg`), with `unspecified()`, `srgb()`, `linearSrgb()` and `make(primaries:, transfer:)`. A PNG decodes
  to `unspecified()` for now.
- **Built from samples:** `Image.fromSamples8`, `fromSamples16` and `fromSamplesF32(width:, height:, format:, alpha:,
  colorSpace:, samples:)` take a `FixedArray` of exactly width × height × channels samples of the format's type, and
  refuse anything else as `ImageErrorKind::Samples`.
- **Read:** `width()`, `height()`, `format()`, `alpha()`, `colorSpace()`; and the windows `bytes()` (every sample in the
  host's byte order, little-endian on every target kama builds for), `samples8()`, `samples16()` and `samplesF32()`,
  each empty unless the image holds samples of its type. Each window is a mint: `borrow img.bytes() as b { … }`.

## Errors

`ImageError` (`implements Error`) is a value: `kind()`, `at()` (the byte of the file it failed at, -1 when it is no one
byte's) and `chunk()` (the chunk's type as PNG stores it, 0 for none; `chunkCode(text: "IDAT")` gives the number).
`message()` names all three: "chunk CRC in IDAT at byte 57".

`ImageErrorKind` (`@nonExhaustive`): `Signature`, `Truncated`, `ChunkType`, `ChunkCrc`, `ChunkOrder`, `Header`,
`Palette`, `Data`, `DataChecksum`, `Limit`, `Unsupported` and `Samples`, each with `name()`.

## Decode options

`DecodeOptions.defaults()` holds `limits`, a `DecodeLimits`, whose public fields a caller raises or lowers:

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
  scales it), `Rgba16Unorm` at 16. `Straight` when the file has alpha or a `tRNS`, otherwise `Opaque`.
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
  | `Limit` | the image, its data or a chunk would pass a limit |
  | `Unsupported` | a critical chunk this decoder does not know |
- **Dropped:** an ancillary chunk with a bad CRC, a second `tRNS`, a `tRNS` after the image data or the wrong length for
  its colour type, and every ancillary chunk this decoder does not read. Bytes after `IEND` are not read.

## Tests

`tools/test.sh` is the gate: the roadmap's shape (`tools/check-roadmap.sh`), `kama check` on the package and its tests,
then `tests/`, one program, built debug and release and run natively, and built for the web and run under node with its
fixtures embedded. 214 cases on each leg:

- **Every fixture held to libpng's answer:** PngSuite 2017jul19's 176 files (`tests/fixtures/pngsuite/`, with its
  licence) and 10 crafted cases (`tests/fixtures/crafted/`, written by `tools/reference/craft.mjs`), each the same size,
  format, alpha and samples (their CRC-32) as libpng 1.6.59 decodes it, or refused with the kind of error libpng's words
  name. The expectations are `tests/src/expected.kama`, written on purpose by `tools/reference/run.sh` from
  `tools/reference/expected.c`, never by the gate.
- **The refusals no fixture reaches,** each on a PNG built byte by byte (`tests/src/strict.kama`): each limit, the
  chunk rules, IHDR's other fields, `tRNS` kept and dropped, image data that is malformed or the wrong length, a pixel
  past the palette's end, an error's message, and an image built from samples that do not fit it.
