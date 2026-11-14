/* The tests' expectations, from libpng: each fixture decoded to RGBA at its own depth (palettes, low bit depths, grey
 * and tRNS expanded, interlacing undone, no gamma or colour conversion), as @kama/image's default decode gives it.
 * Prints kama source for tests/src/expected.kama:
 *
 *   expected <dir>/<file.png>...
 *
 * A decoded file is its size, its format, whether its alpha is straight or the image opaque, and the CRC-32 of its
 * samples in the layout `Image.bytes()` hands out: 8-bit samples as they are, 16-bit ones as uint16 in little-endian
 * order (the host's on every target the package builds for). A refused file is the kind of error libpng's words name.
 * tools/reference/run.sh builds and runs it; it needs libpng and zlib (msys2's, or any system's). */
#include <png.h>
#include <zlib.h>
#include <setjmp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char g_err[512];
static void on_error(png_structp p, png_const_charp msg) { snprintf(g_err, sizeof g_err, "%s", msg); longjmp(png_jmpbuf(p), 1); }
static void on_warning(png_structp p, png_const_charp msg) { (void)p; (void)msg; }

static const char *base(const char *path) {
    const char *s = strrchr(path, '/'), *t = strrchr(path, '\\');
    if (t > s) s = t;
    return s ? s + 1 : path;
}

/* libpng's words for a refusal, as the package's kinds */
static const char *kind_of(const char *msg) {
    if (strstr(msg, "Not a PNG file") || strstr(msg, "ASCII conversion")) return "Signature";
    if (strstr(msg, "CRC error")) return "ChunkCrc";
    if (strstr(msg, "Invalid IHDR data")) return "Header";
    if (strstr(msg, "out of place") || strstr(msg, "Missing")) return "ChunkOrder";
    if (strstr(msg, "incorrect data check")) return "DataChecksum";
    if (strstr(msg, "Read Error")) return "Truncated";
    return NULL;
}

/* Within 0.001 of a named set of chromaticities (white, red, green, blue; x and y, x 100000)? */
static int near8(const png_fixed_point *v, const long *want) {
    for (int i = 0; i < 8; i++) if (labs((long)v[i] - want[i]) > 100) return 0;
    return 1;
}
static const long BT709[8] = { 31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000 };
static const long P3[8] = { 31270, 32900, 68000, 32000, 26500, 69000, 15000, 6000 };
static const long BT2020[8] = { 31270, 32900, 70800, 29200, 17000, 79700, 13100, 4600 };

static unsigned long crc_of(const unsigned char *b, size_t n) { return crc32(0L, b, (uInt)n); }
static void put16(unsigned char *b, unsigned v) { b[0] = (unsigned char)(v >> 8); b[1] = (unsigned char)v; }
static void put32be(unsigned char *b, unsigned long v) { b[0] = (unsigned char)(v >> 24); b[1] = (unsigned char)(v >> 16); b[2] = (unsigned char)(v >> 8); b[3] = (unsigned char)v; }

/* What libpng keeps of a decoded file's colour chunks, and the colour space they give by the PNG Third Edition's
 * precedence (4.3): a cICP this decoder understands (matrix 0, full range, primaries 1, 9 or 12, transfer 8, 13, 16 or
 * 18), else iCCP, else sRGB, else cHRM and gAMA. */
static void colour(png_structp p, png_infop info, const char *name) {
    const char *prim = "Unspecified", *tf = "Unspecified";
    long gamma = 0, chrm[8] = { 0 };
    png_byte cp = 0, ct = 0, mc = 0, fr = 0;
    long cicp = -1;
    if (png_get_cICP(p, info, &cp, &ct, &mc, &fr)) cicp = ((long)cp << 24) | ((long)ct << 16) | ((long)mc << 8) | fr;
    int cicp_known = cicp >= 0 && mc == 0 && fr == 1 && (cp == 1 || cp == 9 || cp == 12) && (ct == 8 || ct == 13 || ct == 16 || ct == 18);
    png_charp iname; int icomp; png_bytep prof; png_uint_32 plen = 0;
    int has_icc = png_get_iCCP(p, info, &iname, &icomp, &prof, &plen) != 0;
    int intent = -1, has_srgb = png_get_sRGB(p, info, &intent) != 0;
    if (!has_srgb) intent = -1;
    png_fixed_point g = 0, v[8];
    int has_gama = png_get_gAMA_fixed(p, info, &g) != 0;
    int has_chrm = png_get_cHRM_fixed(p, info, &v[0], &v[1], &v[2], &v[3], &v[4], &v[5], &v[6], &v[7]) != 0;
    if (cicp_known) {
        prim = cp == 1 ? "Bt709" : cp == 9 ? "Bt2020" : "DisplayP3";
        tf = ct == 13 ? "Srgb" : ct == 8 ? "Linear" : ct == 16 ? "Pq" : "Hlg";
    } else if (has_icc) {
        prim = "IccProfile"; tf = "IccProfile";
    } else if (has_srgb) {
        prim = "Bt709"; tf = "Srgb";
    } else {
        if (has_gama) { gamma = g; tf = g == 100000 ? "Linear" : "Gamma"; }
        if (has_chrm) {
            for (int i = 0; i < 8; i++) chrm[i] = v[i];
            prim = near8(v, BT709) ? "Bt709" : near8(v, P3) ? "DisplayP3" : near8(v, BT2020) ? "Bt2020" : "Custom";
        }
    }
    png_uint_32 nexif = 0; png_bytep exif = NULL;
    int has_exif = png_get_eXIf_1(p, info, &nexif, &exif) != 0;
    png_fixed_point m[8]; png_uint_32 maxl = 0, minl = 0;
    unsigned long mdcv = 0;
    if (png_get_mDCV_fixed(p, info, &m[0], &m[1], &m[2], &m[3], &m[4], &m[5], &m[6], &m[7], &maxl, &minl)) {
        /* the chunk's own layout: red, green, blue, white (x then y, units of 0.00002), then the two luminances */
        unsigned char b[24];
        put16(b + 0, (unsigned)(m[2] / 2)); put16(b + 2, (unsigned)(m[3] / 2));
        put16(b + 4, (unsigned)(m[4] / 2)); put16(b + 6, (unsigned)(m[5] / 2));
        put16(b + 8, (unsigned)(m[6] / 2)); put16(b + 10, (unsigned)(m[7] / 2));
        put16(b + 12, (unsigned)(m[0] / 2)); put16(b + 14, (unsigned)(m[1] / 2));
        put32be(b + 16, maxl); put32be(b + 20, minl);
        mdcv = crc_of(b, 24);
    }
    png_uint_32 cll = 0, fall = 0;
    long maxCll = -1, maxFall = -1;
    if (png_get_cLLI_fixed(p, info, &cll, &fall)) { maxCll = (long)cll; maxFall = (long)fall; }
    printf("    t.colour(name: \"%s\", primaries: Primaries::%s, transfer: Transfer::%s, gamma: %ld,\n", name, prim, tf, gamma);
    printf("             chromaticities: [%ld, %ld, %ld, %ld, %ld, %ld, %ld, %ld], intent: %d,\n",
           chrm[0], chrm[1], chrm[2], chrm[3], chrm[4], chrm[5], chrm[6], chrm[7], intent);
    printf("             iccLength: %lu, iccCrc: %luui32, exifLength: %lu, exifCrc: %luui32, cicp: %ld, mdcvCrc: %luui32, maxCll: %ld, maxFall: %ld);\n",
           has_icc ? (unsigned long)plen : 0ul, has_icc ? crc_of(prof, plen) : 0ul,
           has_exif ? (unsigned long)nexif : 0ul, has_exif ? crc_of(exif, nexif) : 0ul, cicp, mdcv, maxCll, maxFall);
}

static int one(const char *path) {
    FILE *in = fopen(path, "rb");
    if (!in) { fprintf(stderr, "%s: cannot open\n", path); return 1; }
    png_structp p = png_create_read_struct(PNG_LIBPNG_VER_STRING, NULL, on_error, on_warning);
    png_infop info = png_create_info_struct(p);
    unsigned char *pix = NULL;
    png_bytepp rows = NULL;
    if (setjmp(png_jmpbuf(p))) {
        const char *k = kind_of(g_err);
        if (!k) { fprintf(stderr, "%s: libpng refused it as \"%s\", which no kind names\n", base(path), g_err); exit(1); }
        printf("    t.refused(name: \"%s\", kind: ImageErrorKind::%s);   // libpng: %s\n", base(path), k, g_err);
        png_destroy_read_struct(&p, &info, NULL);
        free(rows); free(pix); fclose(in);
        return 0;
    }
    png_init_io(p, in);
    png_read_info(p, info);
    png_uint_32 w = png_get_image_width(p, info), h = png_get_image_height(p, info);
    int ct = png_get_color_type(p, info);
    int trns = png_get_valid(p, info, PNG_INFO_tRNS) != 0;
    int straight = (ct & PNG_COLOR_MASK_ALPHA) || trns;
    png_set_expand(p);
    if (ct == PNG_COLOR_TYPE_GRAY || ct == PNG_COLOR_TYPE_GRAY_ALPHA) png_set_gray_to_rgb(p);
    if (!straight) png_set_add_alpha(p, 0xffff, PNG_FILLER_AFTER);
    png_set_interlace_handling(p);
    png_read_update_info(p, info);
    int depth = png_get_bit_depth(p, info);
    size_t rowbytes = png_get_rowbytes(p, info), n = rowbytes * h;
    pix = malloc(n);
    rows = malloc(sizeof *rows * h);
    for (png_uint_32 y = 0; y < h; y++) rows[y] = pix + rowbytes * y;
    png_read_image(p, rows);
    png_read_end(p, info);   /* the chunks after the image data, eXIf among them, land in info too */
    if (depth == 16) for (size_t i = 0; i < n; i += 2) { unsigned char t = pix[i]; pix[i] = pix[i + 1]; pix[i + 1] = t; }
    unsigned long crc = crc32(0L, pix, (uInt)n);
    printf("    t.decoded(name: \"%s\", width: %u, height: %u, format: PixelFormat::%s, alpha: AlphaMode::%s, crc: %luui32);\n",
           base(path), (unsigned)w, (unsigned)h, depth == 16 ? "Rgba16Unorm" : "Rgba8Unorm", straight ? "Straight" : "Opaque", crc);
    colour(p, info, base(path));
    png_destroy_read_struct(&p, &info, NULL);
    free(rows); free(pix); fclose(in);
    return 0;
}

int main(int argc, char **argv) {
    printf("// Generated by tools/reference/run.sh from %s and zlib %s: do not edit. Each fixture as libpng decodes it\n",
           "libpng " PNG_LIBPNG_VER_STRING, ZLIB_VERSION);
    printf("// (tools/reference/expected.c): its size, format, alpha and the CRC-32 of its samples, then what libpng keeps of its\n");
    printf("// colour chunks and the colour space they give (colour(), there); or the kind of error it is.\n");
    printf("import { image::PixelFormat, image::AlphaMode, image::ImageErrorKind, image::Primaries, image::Transfer, Table };\n\n");
    printf("export { fillExpected };\n\n");
    printf("fn void fillExpected(ref Table t) {\n");
    int bad = 0;
    for (int i = 1; i < argc; i++) bad |= one(argv[i]);
    printf("}\n");
    return bad;
}
