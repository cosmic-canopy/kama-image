# Changelog

All notable changes to `@kama/image`. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `Image`: a pixel format named as WebGPU names its texture formats, an alpha mode, a colour space and typed samples,
  handed out as bytes or by type with no copy; built from samples with `fromSamples8`, `fromSamples16` and
  `fromSamplesF32`.
- `ImageError` and `ImageErrorKind`: what a decode refuses, at which byte and in which chunk.
- `DecodeOptions` and `DecodeLimits`: what a decode may allocate, the longest chunk it reads, and how many ancillary
  chunks a file may hold.
- `image::png::decode`: every colour type and bit depth, palettes, `tRNS` and Adam7 interlacing, strict, held to
  libpng's pixels on PngSuite and crafted cases.
- The colour chunks: `ColorSpace` by the PNG Third Edition's precedence (cICP, iCCP, sRGB, then gAMA and cHRM), with
  `Gamma`, `Custom` and `IccProfile`, the gamma and the chromaticities; and kept on the image, the ICC profile and its
  name, Exif data, the rendering intent, the cICP code points, the mastering display (`MasteringDisplay`) and the content
  light levels (`ContentLight`).
- `DecodeOptions.keepGrey`: a grey PNG as one channel, or two with alpha.
- `Image.convert(to:)`: another pixel format, sample by sample, with the metadata kept.
- The tests' sweep: every single-bit flip and every truncation of every fixture, in debug and in release.

### Notes

- Seeded with `kama seed` on kama 0.9.947 (2026-11-14). Requires kama 0.9.949.
