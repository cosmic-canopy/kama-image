# Gaps found in kama, from building @kama/image

What this package hits in kama. Each entry is reduced to the smallest program that shows it and **run** on the version
it names. Never edit `../kama` from here: this file is how kama hears about it, relayed by the owner.

**Current compiler:** kama 0.9.949+g9f1fdaef (kyoten's pin since 2026-11-14; seeded on 0.9.947).

Ids are `KIMG-<n>` and are permanent. **Next id: KIMG-2**

## Open

| id | kind | status | what |
|---|---|---|---|
| KIMG-1 | GAP | open, evidence for kama's KR-332 | **A wasm release is `-Oz` for every package, so a codec's hot loops run 3 to 3.5 times slower on the web than at `-O3`, and no manifest key picks speed for one package.** std's own `ZlibReader` inflating a PNG's 12,584,960 B of IDAT data, under node 24.21.0 (emscripten 6.0.13): 120.3 ms at kama's release, 41.1 ms with `cflags` and `ldflags` `-O3`, and 35.2 ms natively. The whole decode sketch takes 294.7 ms, 83.6 ms and 77.2 ms. The browsers' own decoders take 27 to 35 ms on the same file. `-O3` costs the sketch's codec 5.6 KB more brotli (23,984 B against 18,559 B). `debug.optimize` lifts a package in a debug build only (kama `docs/targets.md`), so a program can choose only between a size-first web build and a speed-first one for all its code. kama's KR-332, "A wasm release can be optimized for speed", asks for exactly this measurement first ("measure size against speed at `-O2`/`-O3`/`-Os`/`-Oz`"). The repro: `.scratch/img-probe-kama-wasm/` and `img-probe-kama-wasm-o3/` (`imgprobe inflate /photo2048.png 10`), RESEARCH.md § 1.3 and 1.4. Measured on 0.9.949, Windows 11, 2026-11-14. **Reached kama the same day:** kama `74784471` measures KR-332 on std's own inflate (2.8 times as long at `-Oz`), reports this codec's whole decode with it (295 ms against 84), and adds the ask the row lacked, a speed level for one package, settled with KR-269. Open until it is built. |
