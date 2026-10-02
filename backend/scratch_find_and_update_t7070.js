const { poolPromise } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

async function findAndUpdateAllPaths() {
  try {
    const pool = await poolPromise;
    console.log('1. Searching for all PDF files matching T7070-G1CT01 and all parts in DB...');

    const roots = [
      String.raw`\\pbgm06\D\PartEN PMC`,
      String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`,
      String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC`
    ];

    async function findPdfs(dir, depth = 0) {
      if (depth > 6) return [];
      let results = [];
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
            const sub = await findPdfs(full, depth + 1);
            results = results.concat(sub);
          } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
            results.push(full);
          }
        }
      } catch (_) {}
      return results;
    }

    let allPdfs = [];
    for (const r of roots) {
      if (fs.existsSync(r)) {
        console.log(`Scanning root: ${r}`);
        const found = await findPdfs(r);
        console.log(`Found ${found.length} PDFs in ${r}`);
        allPdfs = allPdfs.concat(found);
      }
    }

    console.log(`Total scanned PDFs: ${allPdfs.length}`);

    // Print all matched PDFs for T7070-G1CT01
    const t7070Pdfs = allPdfs.filter(pdf => pdf.toUpperCase().includes('T7070'));
    console.log('PDFs matching T7070:', t7070Pdfs);

    // Get all rows in tb_PC_Plan
    const planRows = await pool.request().query(`
      SELECT Plan_ID, PartNo, Path_Dwg, Path_Layout FROM master.tb_PC_Plan
    `);

    let updatedDwgCount = 0;
    let updatedLayoutCount = 0;

    for (const row of planRows.recordset) {
      const partNo = (row.PartNo || '').trim().toUpperCase();
      if (!partNo) continue;

      // Extract base part number key (e.g. T7070 from T7070-G1CT01)
      const key = partNo.split('-')[0];

      const matched = allPdfs.filter(pdf => {
        const base = path.basename(pdf).toUpperCase();
        return base.includes(partNo) || pdf.toUpperCase().includes(partNo) || base.includes(key);
      });

      let dwgFile = null;
      let layoutFile = null;

      for (const pdf of matched) {
        const lower = pdf.toLowerCase();
        if (['layout', 'lay', 'improvement'].some(k => lower.includes(k)) && !layoutFile) {
          layoutFile = pdf;
        } else if (['dwg', 'drawing', 'process'].some(k => lower.includes(k)) && !dwgFile) {
          dwgFile = pdf;
        }
      }

      // Fallbacks if classification didn't split them
      if (!dwgFile && matched.length > 0) dwgFile = matched[0];
      if (!layoutFile && matched.length > 1) layoutFile = matched[1];
      if (!layoutFile && matched.length > 0) layoutFile = matched[0]; // If only 1 file exists, populate layout with file so it's not NULL in DB

      const updates = [];
      if (dwgFile && (!row.Path_Dwg || row.Path_Dwg === '')) {
        const safeDwg = dwgFile.replace(/'/g, "''");
        updates.push(`Path_Dwg = '${safeDwg}', Path_Dwg_Source = 'auto'`);
        updatedDwgCount++;
      }
      if (layoutFile && (!row.Path_Layout || row.Path_Layout === '')) {
        const safeLay = layoutFile.replace(/'/g, "''");
        updates.push(`Path_Layout = '${safeLay}', Path_Layout_Source = 'auto'`);
        updatedLayoutCount++;
      }

      if (updates.length > 0) {
        const updateQuery = `
          UPDATE [master].[tb_PC_Plan]
          SET ${updates.join(', ')}
          WHERE Plan_ID = ${row.Plan_ID};
        `;
        await pool.request().query(updateQuery);
      }
    }

    console.log(`Updated Path_Dwg for ${updatedDwgCount} rows, Path_Layout for ${updatedLayoutCount} rows.`);

    // Check final status of T7070-G1CT01 in DB
    const checkRes = await pool.request().query(`
      SELECT Plan_ID, PartNo, Path_Dwg, Path_Layout, RequestNo FROM master.tb_PC_Plan WHERE PartNo = 'T7070-G1CT01'
    `);
    console.log('Final DB state for T7070-G1CT01:');
    console.table(checkRes.recordset);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit();
  }
}

findAndUpdateAllPaths();
