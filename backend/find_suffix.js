const fs   = require('fs');
const path = require('path');

const ROOTS = [
    String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control`,
    String.raw`\\pbgm06\D\PartEN PMC`
];

const SEARCH_KEYS = ['G1ET02', '2CF01', '1AM1AS01'];

function findPdfsSync(dir, key, depth = 0) {
    if (depth > 6) return [];
    let results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (['OBSOLATE', 'OLD'].some(s => e.name.toUpperCase().includes(s))) continue;
                results = results.concat(findPdfsSync(full, key, depth + 1));
            } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
                if (e.name.toUpperCase().includes(key.toUpperCase()) || full.toUpperCase().includes(key.toUpperCase())) {
                    results.push(full);
                }
            }
        }
    } catch (_) {}
    return results;
}

for (const root of ROOTS) {
    if (!fs.existsSync(root)) continue;
    
    console.log(`\n=== Searching in ${root} ===`);
    for (const key of SEARCH_KEYS) {
        const found = findPdfsSync(root, key);
        if (found.length > 0) {
            found.forEach(f => console.log(`  FOUND [${key}]: ${f}`));
        } else {
            console.log(`  NOT FOUND [${key}]`);
        }
    }
}
