const fs = require('fs');
const path = require('path');
const { poolPromise } = require('./src/config/database');

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
        if (e.name.toUpperCase().includes('T7164')) {
          results.push(full);
        }
      }
    }
  } catch (err) {
    // ignore inaccessible folders
  }
  return results;
}

async function checkT7164() {
  console.log('Searching network shares for T7164 PDF files...');
  let found = [];
  for (const root of searchRoots) {
    if (fs.existsSync(root)) {
      console.log(`Searching in ${root}...`);
      const res = findPdfs(root);
      found = found.concat(res);
    } else {
      console.log(`Path not accessible: ${root}`);
    }
  }

  console.log(`Found ${found.length} PDF files matching T7164:`);
  found.forEach(f => console.log(' - ', f));

  // If found DWG pdf, update master.tb_PC_Plan
  if (found.length > 0) {
    let dwgPath = null;
    let layoutPath = null;

    for (const pdf of found) {
      const name = path.basename(pdf).toUpperCase();
      if (name.includes('LAYOUT') || name.includes('LAY')) {
        if (!layoutPath) layoutPath = pdf;
      } else {
        if (!dwgPath) dwgPath = pdf;
      }
    }

    if (!dwgPath && found.length > 0) dwgPath = found[0];

    console.log('Selected Dwg Path:', dwgPath);
    console.log('Selected Layout Path:', layoutPath);

    if (dwgPath && fs.existsSync(dwgPath)) {
      const pool = await poolPromise;
      const safeDwg = dwgPath.replace(/'/g, "''");
      const result = await pool.request().query(`
        UPDATE [master].[tb_PC_Plan]
        SET Path_Dwg = '${safeDwg}', Path_Dwg_Source = 'auto'
        WHERE PartNo LIKE '%T7164-G2A%'
      `);
      console.log(`✅ Updated ${result.rowsAffected[0]} rows for T7164-G2A with Path_Dwg!`);
    }
  }

  process.exit(0);
}

checkT7164();
