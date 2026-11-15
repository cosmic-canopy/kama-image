// libpng's answers on the files the encoder wrote, held to its answers on the fixtures they came from:
//   node compare.mjs <tests/src/expected.kama> <plain.kama> <grey.kama>
// plain.kama is expected.c's output on each fixture decoded and encoded with archival(), grey.kama on each grey one
// decoded kept grey and encoded. A file written from a decode has every row the fixture has but the grey ones, since it
// is written as RGB or RGBA; one written kept grey has every row. Prints what differs, and exits 1 if anything does.
import fs from 'node:fs';

function records(path) {
    const byName = new Map();
    let current = null;
    for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
        if (line.startsWith('    t.')) {
            const name = /name: "([^"]+)"/.exec(line)[1];
            const kind = /^    t\.(\w+)\(/.exec(line)[1];
            current = { kind, text: line.replace(/\s+\/\/.*$/, '') };
            if (!byName.has(name)) byName.set(name, []);
            byName.get(name).push(current);
        } else if (current && line.startsWith('     ')) {
            current.text += '\n' + line;
        } else {
            current = null;
        }
    }
    return byName;
}

const [original, plain, grey] = process.argv.slice(2).map(records);
let bad = 0, checked = 0;
function same(name, want, got, what) {
    const a = want.map((r) => r.text).join('\n'), b = got.map((r) => r.text).join('\n');
    checked++;
    if (a !== b) { bad++; console.log(`DIFFERS ${name} (${what}):\n  libpng on the fixture:\n${a}\n  libpng on the encoded file:\n${b}`); }
}
for (const [name, rows] of original) {
    if (!rows.some((r) => r.kind === 'decoded')) continue;
    if (!plain.has(name)) { bad++; console.log(`MISSING ${name}: not encoded`); continue; }
    same(name, rows.filter((r) => r.kind !== 'grey' && r.kind !== 'greyFilters'), plain.get(name), 'encoded');
    if (rows.some((r) => r.kind === 'grey')) {
        if (!grey.has(name)) { bad++; console.log(`MISSING ${name}: not encoded kept grey`); continue; }
        same(name, rows, grey.get(name), 'kept grey and encoded');
    }
}
console.log(`compare: ${checked} files held to libpng's answer on the fixture, ${bad} differ`);
process.exit(bad ? 1 : 0);
