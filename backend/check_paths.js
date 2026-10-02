require('dotenv').config({path: __dirname + '/.env'});
const sql  = require('mssql');
const fs   = require('fs');
const path = require('path');

const EN_PMC_ROOT = String.raw`\\pbgm06\D\PartEN PMC`;

async function run() {
    try {
        await sql.connect({
            user: process.env.DB_USER_APP,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: false, trustServerCertificate: true }
        });

        // Get all plans from Sept 10 WITH their current paths
        const result = await sql.query(`
            SELECT DISTINCT PartNo, Path_Dwg, Path_LAY
            FROM [master].[tb_PC_Plan]
            WHERE CAST(PlanDate AS DATE) = '2026-09-10'
        `);

        console.log(`Found ${result.recordset.length} parts on 2026-09-10:`);
        for (const r of result.recordset) {
            console.log(`  Part: ${r.PartNo}`);
            console.log(`    Path_Dwg: [${r.Path_Dwg}]`);
            console.log(`    Exists?   ${r.Path_Dwg ? fs.existsSync(r.Path_Dwg) : 'N/A'}`);
            console.log(`    Path_LAY: [${r.Path_LAY}]`);
        }

        // Also check what's actually on the filesystem for these parts
        const parts = result.recordset.map(r => r.PartNo);
        console.log('\n--- Filesystem search ---');
        function findPdfsSync(dir, key, depth = 0) {
            if (depth > 4) return [];
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

        if (fs.existsSync(EN_PMC_ROOT)) {
            for (const partNo of parts) {
                const found = findPdfsSync(EN_PMC_ROOT, partNo);
                console.log(`  ${partNo}: ${found.length} files found`);
                found.forEach(f => console.log(`    -> ${f}`));
            }
        } else {
            console.log('EN PMC root NOT accessible from this machine');
        }

        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
