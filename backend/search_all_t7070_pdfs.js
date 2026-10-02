const fs = require('fs');
const path = require('path');

const searchRoots = [
  String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`,
  String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC`,
  String.raw`\\pbgm06\D\PartEN PMC`
];

function findPdfs(dir, depth = 0) {
  if (depth > 6) return [];
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
        results = results.concat(findPdfs(full, depth + 1));
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
        if (e.name.toUpperCase().includes('T7070')) {
          results.push(full);
        }
      }
    }
  } catch (err) {
    // ignore inaccessible folders
  }
  return results;
}

console.log('Searching for all PDFs containing T7070...');
let all = [];
for (const root of searchRoots) {
  if (fs.existsSync(root)) {
    console.log(`Searching in ${root}...`);
    const found = findPdfs(root);
    all = all.concat(found);
  } else {
    console.log(`Root path does not exist: ${root}`);
  }
}

console.log(`Found ${all.length} matching PDF files:`);
all.forEach(f => console.log(' - ', f));
