require('dotenv').config({path: __dirname + '/.env'});
const sql = require('mssql');
const fs  = require('fs');
const path = require('path');

const EN_PMC_ROOT = String.raw`\\pbgm06\D\PartEN PMC`;
const DWG_KEYWORDS    = ['dwg', 'drawing', 'process'];
const LAYOUT_KEYWORDS = ['layout', 'lay'];

function classifyByPath(filePath) {
    const lower = filePath.toLowerCase();
    if (LAYOUT_KEYWORDS.some(k => lower.includes(k))) return 'layout';
    if (DWG_KEYWORDS.some(k => lower.includes(k)))    return 'dwg';
    return 'unknown';
}

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

async function run() {
    try {
        await sql.connect({
            user: process.env.DB_USER_APP,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: false, trustServerCertificate: true }
        });

        // Search by DateTime_Record for Sept 10
        const result = await sql.query(`
            SELECT DISTINCT PartNo, Path_Dwg, Path_Layout, DateTime_Record
            FROM [master].[tb_PC_Plan]
            WHERE CAST(DateTime_Record AS DATE) >= '2026-09-09'
        `);

        console.log(`Found ${result.recordset.length} parts created recently:`);
        const partsToUpdate = [];
        result.recordset.forEach(r => {
            console.log(`  ${r.PartNo} | DWG: [${r.Path_Dwg}] | Date: ${r.DateTime_Record}`);
            if (r.PartNo) partsToUpdate.push(r.PartNo);
        });

        console.log('\n--- Checking filesystem ---');
        let updated = 0;
        for (const partNo of [...new Set(partsToUpdate)]) {
            const matched = findPdfsSync(EN_PMC_ROOT, partNo);
            console.log(`  ${partNo}: found ${matched.length} files`);
            if (matched.length > 0) {
                matched.forEach(m => console.log(`    -> ${m}`));
                
                let foundDwg    = null;
                let foundLayout = null;
                for (const pdf of matched) {
                    const type = classifyByPath(pdf);
                    if (type === 'layout' && !foundLayout) foundLayout = pdf;
                    if (type === 'dwg'    && !foundDwg)    foundDwg    = pdf;
                }
                if (!foundDwg    && matched.length > 0) foundDwg    = matched[0];
                if (!foundLayout && matched.length > 1) foundLayout = matched[1];

                const safePartNo  = partNo.replace(/'/g, "''");
                const safePathDwg = (foundDwg    || '').replace(/'/g, "''");
                const safePathLay = (foundLayout || '').replace(/'/g, "''");

                await sql.query(`
                    UPDATE [master].[tb_PC_Plan]
                    SET Path_Dwg    = CASE WHEN '${safePathDwg}' <> '' THEN '${safePathDwg}' ELSE Path_Dwg END,
                        Path_Layout = CASE WHEN '${safePathLay}' <> '' THEN '${safePathLay}' ELSE Path_Layout END
                    WHERE PartNo = '${safePartNo}'
                `);
                console.log(`  Updated DB for ${partNo}`);
                updated++;
            }
        }
        console.log(`\nDone. Updated ${updated} parts.`);
        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
