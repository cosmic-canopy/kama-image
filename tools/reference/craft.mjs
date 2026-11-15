// The cases PngSuite does not cover, written by hand: node craft.mjs <out dir> <pngsuite files dir>
//
// Every row takes a filter by y % 5 (None, Sub, Up, Average, Paeth), so a decoder's unfiltering is exercised.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [outDir, suiteDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function u32(v) { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; }
function chunk(type, data, { badCrc = false } = {}) {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    return Buffer.concat([u32(data.length), td, u32(crc32(td) ^ (badCrc ? 1 : 0))]);
}
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function ihdr(w, h, depth, colourType) { return chunk('IHDR', Buffer.concat([u32(w), u32(h), Buffer.from([depth, colourType, 0, 0, 0])])); }

// raw: Buffer of unfiltered rows, bpp: bytes a pixel (>= 1), stride: bytes a row
function filterRows(raw, h, stride, bpp) {
    const out = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
        const ft = y % 5, o = y * (stride + 1);
        out[o] = ft;
        for (let x = 0; x < stride; x++) {
            const cur = raw[y * stride + x];
            const a = x >= bpp ? raw[y * stride + x - bpp] : 0;
            const b = y > 0 ? raw[(y - 1) * stride + x] : 0;
            const c = x >= bpp && y > 0 ? raw[(y - 1) * stride + x - bpp] : 0;
            let pred = 0;
            if (ft === 1) pred = a;
            else if (ft === 2) pred = b;
            else if (ft === 3) pred = (a + b) >> 1;
            else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
            out[o + 1 + x] = (cur - pred) & 0xff;
        }
    }
    return out;
}
function png({ w, h, depth, colourType, channels, sample, extra = [] }) {
    const bytesPerSample = depth / 8, bpp = channels * bytesPerSample, stride = w * bpp;
    const raw = Buffer.alloc(stride * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < channels; c++) {
        const v = sample(x, y, c), o = y * stride + x * bpp + c * bytesPerSample;
        if (depth === 16) raw.writeUInt16BE(v & 0xffff, o); else raw[o] = v & 0xff;
    }
    const idat = zlib.deflateSync(filterRows(raw, h, stride, bpp), { level: 9 });
    return Buffer.concat([SIG, ihdr(w, h, depth, colourType), ...extra, chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
function write(name, buf) { fs.writeFileSync(path.join(outDir, name), buf); console.log(`${name}: ${buf.length} bytes`); }

// A minimal ICC v2 RGB matrix/TRC profile: wide primaries (Display P3's, D50-adapted) and a LINEAR curve, so any
// conversion a browser makes changes the pixels a great deal.
function iccProfile() {
    const s15 = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(Math.round(v * 65536)); return b; };
    const xyz = (x, y, z) => Buffer.concat([Buffer.from('XYZ ', 'latin1'), Buffer.alloc(4), s15(x), s15(y), s15(z)]);
    const curv = Buffer.concat([Buffer.from('curv', 'latin1'), Buffer.alloc(4), u32(1), Buffer.from([1, 0, 0, 0])]); // gamma 1.0, padded
    const descText = Buffer.from('probe linear P3\0', 'latin1');
    const desc = Buffer.concat([Buffer.from('desc', 'latin1'), Buffer.alloc(4), u32(descText.length), descText, Buffer.alloc(4 + 4 + 2 + 1 + 67)]);
    const tags = [
        ['desc', desc], ['wtpt', xyz(0.9642, 1.0, 0.8249)],
        ['rXYZ', xyz(0.5151, 0.2412, -0.0011)], ['gXYZ', xyz(0.2919, 0.6922, 0.0419)], ['bXYZ', xyz(0.1572, 0.0666, 0.7841)],
        ['rTRC', curv], ['gTRC', curv], ['bTRC', curv],
    ];
    let offset = 128 + 4 + tags.length * 12;
    const table = [u32(tags.length)], bodies = [];
    for (const [sig, data] of tags) {
        const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
        table.push(Buffer.from(sig, 'latin1'), u32(offset), u32(data.length));
        bodies.push(padded); offset += padded.length;
    }
    const header = Buffer.alloc(128);
    header.writeUInt32BE(offset, 0);
    header.write('none', 4, 'latin1');
    header.writeUInt32BE(0x02100000, 8);
    header.write('mntr', 12, 'latin1'); header.write('RGB ', 16, 'latin1'); header.write('XYZ ', 20, 'latin1');
    header.write('acsp', 36, 'latin1');
    s15(0.9642).copy(header, 68); s15(1.0).copy(header, 72); s15(0.8249).copy(header, 76);
    return Buffer.concat([header, ...table, ...bodies]);
}

// 1. straight alpha: alpha runs 0..255 across, colour independent of it (alpha 0 keeps a colour)
write('h8a.png', png({ w: 256, h: 64, depth: 8, colourType: 6, channels: 4,
    sample: (x, y, c) => [y * 4 + 3, 255 - x, x * 7 + y * 13, x][c] }));
// 2. 16-bit RGBA whose low bytes tell rounding from truncation
write('h16a.png', png({ w: 256, h: 64, depth: 16, colourType: 6, channels: 4,
    sample: (x, y, c) => [x * 251 + y * 1031, x * 4099 + 77, y * 997 + x * 13, x * 256 + y * 3 + 128][c] }));
// 3. 16-bit grey, every low byte
write('h16g.png', png({ w: 256, h: 16, depth: 16, colourType: 0, channels: 1, sample: (x, y) => x * 256 + ((x + y * 16) & 0xff) }));
// 4. sRGB chunk and gAMA 1/2.2
const grad = (x, y, c) => [x * 4, y * 4, (x ^ y) * 4][c];
write('hsrgb.png', png({ w: 64, h: 64, depth: 8, colourType: 2, channels: 3, sample: grad,
    extra: [chunk('sRGB', Buffer.from([0])), chunk('gAMA', u32(45455))] }));
// 5. cICP: Display P3 primaries, sRGB transfer, full range
write('hcicp-p3.png', png({ w: 64, h: 64, depth: 8, colourType: 2, channels: 3, sample: grad,
    extra: [chunk('cICP', Buffer.from([12, 13, 0, 1]))] }));
// 6. cICP: BT.2020 primaries, PQ transfer (an HDR PNG), 16 bits
write('hcicp-pq.png', png({ w: 64, h: 64, depth: 16, colourType: 2, channels: 3, sample: (x, y, c) => grad(x, y, c) * 257 + 33,
    extra: [chunk('cICP', Buffer.from([9, 16, 0, 1]))] }));
// 7. iCCP: linear wide-gamut profile
write('hiccp.png', png({ w: 64, h: 64, depth: 8, colourType: 2, channels: 3, sample: grad,
    extra: [chunk('iCCP', Buffer.concat([Buffer.from('probe\0\0', 'latin1'), zlib.deflateSync(iccProfile())]))] }));
// 8. an ancillary chunk with a bad CRC (libpng's default: warn and drop it, decode the image)
write('hbadcrc-text.png', png({ w: 32, h: 32, depth: 8, colourType: 2, channels: 3, sample: grad,
    extra: [chunk('tEXt', Buffer.from('Comment\0probe', 'latin1'), { badCrc: true })] }));
// 9. a zlib stream whose Adler-32 is wrong
{
    const good = png({ w: 32, h: 32, depth: 8, colourType: 2, channels: 3, sample: grad });
    const at = good.indexOf(Buffer.from('IDAT', 'latin1'));
    const len = good.readUInt32BE(at - 4), data = Buffer.from(good.subarray(at + 4, at + 4 + len));
    data[data.length - 1] ^= 0xff;
    write('hbadadler.png', Buffer.concat([good.subarray(0, at - 4), chunk('IDAT', data), chunk('IEND', Buffer.alloc(0))]));
}
// 10. truncated mid-IDAT (PngSuite's basn6a08 cut at 70%)
{
    const src = fs.readFileSync(path.join(suiteDir, 'basn6a08.png'));
    write('htrunc.png', src.subarray(0, Math.floor(src.length * 0.7)));
}
// 11. tRNS keys at and past the bit depth. A key holds 16 bits whatever the depth, and libpng masks it to the depth,
//     so these say what a decoder that follows libpng does: a 4-bit grey key of 0x0109, an 8-bit one of 0x0109, and an
//     RGB key whose red and green match half the pixels' and whose blue matches only some of those.
function packedGrey(w, h, depth, values, extra) {
    const stride = Math.ceil(w * depth / 8), raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const bit = x * depth, o = y * (stride + 1) + 1 + (bit >> 3);
        raw[o] |= values(x, y) << (8 - depth - (bit & 7));
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([SIG, ihdr(w, h, depth, 0), ...extra, chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
write('hkey4.png', packedGrey(4, 4, 4, (x, y) => (x + y) % 2 ? 9 : 5, [chunk('tRNS', Buffer.from([1, 9]))]));
write('hkey8.png', png({ w: 4, h: 4, depth: 8, colourType: 0, channels: 1, sample: (x, y) => (x + y) % 2 ? 9 : 5,
    extra: [chunk('tRNS', Buffer.from([1, 9]))] }));
write('hkeyrgb.png', png({ w: 4, h: 4, depth: 8, colourType: 2, channels: 3,
    sample: (x, y, c) => c < 2 ? (y % 2 ? 7 : 6) : (x % 2 ? 7 : 8), extra: [chunk('tRNS', Buffer.from([0, 7, 0, 7, 0, 7]))] }));
// 12. The colour chunks (PNG Third Edition § 4.3: cICP, then iCCP, then sRGB, then cHRM with gAMA), each case with the
//     chunks it names before the image data and `after` it. What libpng keeps of each is the expectation.
function colourPng({ depth = 8, colourType = 2, before = [], after = [], palette = false }) {
    const channels = colourType === 2 ? 3 : colourType === 0 ? 1 : colourType === 3 ? 1 : 4;
    const sample = colourType === 3 ? (x, y) => (x + y) % 2 : (x, y, c) => (x * 16 + y * 8 + c * 40) & 0xff;
    const body = png({ w: 8, h: 8, depth, colourType, channels, sample, extra: [...(palette ? [chunk('PLTE', Buffer.from([10, 20, 30, 200, 100, 50]))] : []), ...before] });
    if (!after.length) return body;
    const iend = body.length - 12;   // IEND is the last 12 bytes
    return Buffer.concat([body.subarray(0, iend), ...after, body.subarray(iend)]);
}
const u32s = (...v) => Buffer.concat(v.map(u32));
const chrm = (...v) => chunk('cHRM', u32s(...v));
const gama = (v) => chunk('gAMA', u32(v));
const srgb = (i) => chunk('sRGB', Buffer.from([i]));
const cicp = (...b) => chunk('cICP', Buffer.from(b));
function iccp(profile) { return chunk('iCCP', Buffer.concat([Buffer.from('probe\0\0', 'latin1'), zlib.deflateSync(profile)])); }
const goodIcc = iccProfile();
const badIcc = Buffer.from(goodIcc); badIcc.write('xxxx', 36, 'latin1');   // no 'acsp'
write('hc-chrm-p3.png', colourPng({ before: [chrm(31270, 32900, 68000, 32000, 26500, 69000, 15000, 6000), gama(45455)] }));
write('hc-chrm-custom.png', colourPng({ before: [chrm(31000, 33000, 65000, 32000, 29000, 61000, 14000, 7000), gama(100000)] }));
write('hc-chrm-alone.png', colourPng({ before: [chrm(31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000)] }));
write('hc-srgb-intent9.png', colourPng({ before: [srgb(9), gama(70000)] }));
write('hc-srgb-twice.png', colourPng({ before: [srgb(2), srgb(0)] }));
// sRGB after PLTE: out of place, so dropped
write('hc-srgb-late.png', png({ w: 8, h: 8, depth: 8, colourType: 3, channels: 1, sample: (x, y) => (x + y) % 2,
    extra: [chunk('PLTE', Buffer.from([10, 20, 30, 200, 100, 50])), srgb(1)] }));
write('hc-icc-srgb.png', colourPng({ before: [iccp(goodIcc), srgb(1)] }));
write('hc-icc-bad.png', colourPng({ before: [iccp(badIcc), srgb(3)] }));
write('hc-icc-grey.png', colourPng({ colourType: 0, before: [iccp(goodIcc), gama(45455)] }));
write('hc-cicp-unknown.png', colourPng({ before: [cicp(1, 1, 0, 0), srgb(0)] }));
write('hc-cicp-p3-icc.png', colourPng({ before: [cicp(12, 13, 0, 1), iccp(goodIcc)] }));
write('hc-hdr.png', colourPng({ depth: 16, before: [cicp(9, 16, 0, 1),
    chunk('mDCV', Buffer.concat([u16s(35400, 14600, 8500, 39850, 6550, 2300, 15635, 16450), u32s(10000000, 50)])),
    chunk('cLLI', u32s(10000000, 4000000))] }));
write('hc-exif.png', colourPng({ after: [chunk('eXIf', Buffer.from('MM\0*\0\0\0\x08\0\0', 'latin1'))] }));
write('hc-exif-bad.png', colourPng({ before: [chunk('eXIf', Buffer.from('XX\0*\0\0\0\x08', 'latin1'))] }));
// 12a. A cICP whose matrix is not 0, which the PNG Third Edition forbids (§ 11.3.2.6) and libpng's png_set_cICP refuses,
//      though its handler still counts the chunk as seen, so a second cICP is a duplicate.
write('hc-cicp-matrix.png', colourPng({ before: [cicp(12, 13, 1, 1), srgb(0)] }));
write('hc-cicp-matrix-twice.png', colourPng({ before: [cicp(12, 13, 1, 1), cicp(12, 13, 0, 1)] }));
// 12b. A colour chunk libpng does not accept is not counted as seen (pngrutil.c's png_handle_chunk), so a second one
//      after it is read: each broken one here is followed by a good one.
const exifGood = chunk('eXIf', Buffer.from('II*\0\x08\0\0\0\0\0', 'latin1'));
write('hc-then-cicp.png', colourPng({ before: [chunk('cICP', Buffer.from([12, 13, 0])), cicp(12, 13, 0, 1)] }));
write('hc-then-srgb.png', colourPng({ before: [srgb(9), srgb(1)] }));
write('hc-then-gama.png', colourPng({ before: [gama(0x80000000), gama(45455)] }));
write('hc-then-chrm.png', colourPng({ before: [chrm(0x80000000, 32900, 68000, 32000, 26500, 69000, 15000, 6000),
    chrm(31270, 32900, 68000, 32000, 26500, 69000, 15000, 6000)] }));
write('hc-then-icc.png', colourPng({ before: [iccp(badIcc), iccp(goodIcc)] }));
write('hc-then-exif.png', colourPng({ before: [chunk('eXIf', Buffer.from('XX\0*\0\0\0\x08', 'latin1')), exifGood] }));
write('hc-then-mdcv.png', colourPng({ depth: 16, before: [cicp(9, 16, 0, 1), chunk('mDCV', u16s(1, 2, 3)),
    chunk('mDCV', Buffer.concat([u16s(35400, 14600, 8500, 39850, 6550, 2300, 15635, 16450), u32s(10000000, 50)]))] }));
write('hc-then-clli.png', colourPng({ depth: 16, before: [cicp(9, 16, 0, 1), chunk('cLLI', u32s(5)), chunk('cLLI', u32s(10000000, 4000000))] }));
function u16s(...v) { return Buffer.concat(v.map((x) => { const b = Buffer.alloc(2); b.writeUInt16BE(x); return b; })); }
// 13. An animated PNG (APNG, the PNG Third Edition's acTL, fcTL and fdAT): its default image is the IDAT, and a decoder
//     that reads one image leaves the animation's chunks, all ancillary, alone.
{
    const frame = (seq, w, h) => Buffer.concat([u32(seq), u32(w), u32(h), u32(0), u32(0), Buffer.from([0, 1, 0, 10, 0, 0])]);
    const second = zlib.deflateSync(Buffer.alloc(8 * (1 + 8 * 3), 0x40));
    write('hapng.png', colourPng({ before: [chunk('acTL', Buffer.concat([u32(2), u32(0)])), chunk('fcTL', frame(0, 8, 8))],
        after: [chunk('fcTL', frame(1, 8, 8)), chunk('fdAT', Buffer.concat([u32(2), second]))] }));
}
