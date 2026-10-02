const fs   = require('fs');
const path = require('path');

// Try various paths on pbp083
const TEST_PATHS = [
    String.raw`\\pbp083\Public`,
    String.raw`\\pbp083\Public\Process Engineer`,
    String.raw`\\pbp083\Public\Process Engineer\Doc. ENG`,
    String.raw`\\pbp083\Public\Process Engineer\Doc.ENG`,
    String.raw`\\pbp083\Public\Process Engineer\DocENG`,
];

for (const p of TEST_PATHS) {
    const exists = fs.existsSync(p);
    console.log(`${exists ? '[OK]' : '[NO]'} ${p}`);
    if (exists) {
        try {
            const items = fs.readdirSync(p).slice(0, 10);
            console.log(`     Contents (first 10): ${items.join(', ')}`);
        } catch(e) {
            console.log(`     Cannot read: ${e.message}`);
        }
    }
}

// Also list top-level of pbgm06\D\PartEN PMC to see structure
const PMC = String.raw`\\pbgm06\D\PartEN PMC`;
console.log(`\n=== Top-level of ${PMC} ===`);
try {
    const items = fs.readdirSync(PMC).slice(0, 20);
    console.log(items.join('\n'));
} catch(e) {
    console.log('Cannot read:', e.message);
}
