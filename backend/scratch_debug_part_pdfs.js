const fs = require('fs');
const path = require('path');

const shares = [
  String.raw`\\pbgm06\D\PartEN PMC`,
  String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control`,
  String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC`
];

const targetParts = ['T7070-G1CT01', 'A5106-1AM1AS01', 'T7070', '5106', 'A5106'];

function searchPdfs(dir, depth = 0) {
    if (depth > 6) return [];
    let results = [];
    try {
        if (!fs.existsSync(dir)) return [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
                results = results.concat(searchPdfs(full, depth + 1));
            } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
                const fname = e.name.toUpperCase();
                const fullUpper = full.toUpperCase();
                if (targetParts.some(p => fname.includes(p) || fullUpper.includes(p))) {
                    results.push(full);
                }
            }
        }
    } catch (_) {}
    return results;
}

for (const s of shares) {
    console.log(`\nSearching share: ${s}`);
    const found = searchPdfs(s);
    console.log(`Found ${found.length} matching files:`);
    found.forEach(f => console.log(`  -> ${f}`));
}
