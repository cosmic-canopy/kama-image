# @kama/image roadmap

**The order of work, and nothing else.** One row per item: what it is, and a link to its reasoning in
[ROADMAP_DETAIL.md](ROADMAP_DETAIL.md) or to the decision behind it in [AGENTS.image.md](AGENTS.image.md#decided). What
the package is, as each piece lands, will be its `SPEC.md`. The evidence behind the design is [RESEARCH.md](RESEARCH.md),
and the history is the git log.

> **Keep this file short.** `tools/check-roadmap.sh` holds the split, as `@kama/graphics`' and kama's guards do: a line
> ceiling, a ceiling per row, every detail section scheduled by a row, and every id valid.
>
> **`IMG-<n>` is a permanent id, not a position.** It is assigned once, from the counter below, which the same edit
> bumps; it is never reused or renumbered, and a shipped row's id retires with it.

**Next id: IMG-14**

**The order is the owner's** (2026-11-14, AGENTS.image.md § Decided, 3): "we roadmap them all and do what you recommend
now". Every format is a module a program imports, so a page carries only the formats it uses.

## NOW: PNG, whole

PNG decoding is built: [SPEC.md](SPEC.md) § PNG.

| id | item | why |
|---|---|---|
| IMG-2 | **PNG encoding**: `standard()` and `archival()`, the filters and the colour chunks, the same bytes on every leg | [detail](ROADMAP_DETAIL.md#png-encode) |

## NEXT

| id | item | why |
|---|---|---|
| IMG-3 | **Coverage-guided fuzzing, a stopgap**: libFuzzer over the emitted C on Linux, until kama's KR-205 replaces it | [detail](ROADMAP_DETAIL.md#fuzz) |

## LATER: the formats `@kama/graphics` pulls, in its order

| id | item | why |
|---|---|---|
| IMG-4 | **JPEG**, baseline and progressive (glTF's core images, GFX-2); the browser's decoder on the web, kama's or a vendored one natively | [decided, 3](AGENTS.image.md#decided) |
| IMG-5 | **KTX2 with Basis Universal transcoding** to BC, ASTC or ETC2 (GFX-2); the vendored transcoder and its licence are its question | [decided, 3](AGENTS.image.md#decided) |
| IMG-6 | **Radiance HDR** (GFX-3's lighting from an HDR image) | [decided, 3](AGENTS.image.md#decided) |
| IMG-7 | **OpenEXR** (GFX-3); its compressions and their licences are its question | [decided, 3](AGENTS.image.md#decided) |
| IMG-8 | **WebP** (glTF's `EXT_texture_webp`); the browser's decoder on the web | [decided, 3](AGENTS.image.md#decided) |
| IMG-9 | **AVIF** (glTF's `EXT_texture_avif`); the browser's decoder on the web | [decided, 3](AGENTS.image.md#decided) |
| IMG-10 | **APNG's frames**, past the default image the decoder gives | [decided, 3](AGENTS.image.md#decided) |
| IMG-11 | **JPEG XL** | [decided, 3](AGENTS.image.md#decided) |
| IMG-12 | **The long tail**, each when a program pulls it: GIF, TGA, BMP, DDS, QOI, TIFF | [decided, 3](AGENTS.image.md#decided) |

## ALONGSIDE

| id | item | why |
|---|---|---|
| IMG-13 | **The first publish**: `tests/` green on every target the package claims, once kama rules whether it is first-party | [detail](ROADMAP_DETAIL.md#publish) |
