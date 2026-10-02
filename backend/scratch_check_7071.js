const fs = require('fs');
const path = require('path');
const { poolPromise } = require('./src/config/database');

const EN_PMC_ROOT = String.raw`\\pbgm06\D\PartEN PMC`;
const PBP_DWG_ROOT = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`;

async function findPdfsAsync(dir, key, depth = 0) {
  if (depth > 5) return [];
  let results = [];
  try {
    const fsPromises = fs.promises;
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
        const sub = await findPdfsAsync(full, key, depth + 1);
        results = results.concat(sub);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
        if (e.name.toUpperCase().includes(key.toUpperCase()) || full.toUpperCase().includes(key.toUpperCase())) {
          results.push(full);
        }
      }
    }
  } catch (_) {}
  return results;
}

async function main() {
  console.log('Searching for T7071-G1ET02 / 7071...');
  const res1 = await findPdfsAsync(EN_PMC_ROOT, '7071');
  console.log('EN_PMC_ROOT found:', res1);

  const res2 = await findPdfsAsync(PBP_DWG_ROOT, '7071');
  console.log('PBP_DWG_ROOT found:', res2);

  process.exit();
}

main();
