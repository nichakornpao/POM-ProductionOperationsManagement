const { poolPromise } = require('./src/config/database');
const path = require('path');
const fs = require('fs');

const uploadsRoot = path.resolve(__dirname, 'uploads', 'en-drawings');

const DWG_KEYWORDS = ['dwg', 'drawing', 'process'];
const LAYOUT_KEYWORDS = ['layout', 'lay'];

function classifyByPath(filePath) {
    const lower = filePath.toLowerCase();
    if (LAYOUT_KEYWORDS.some(k => lower.includes(k))) return 'layout';
    if (DWG_KEYWORDS.some(k => lower.includes(k))) return 'dwg';
    return 'unknown';
}

function findPdfsDeep(dir, depth = 0) {
    if (depth > 5) return [];
    let results = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (['OBSOLATE', 'OLD'].some(s => e.name.toUpperCase().includes(s))) continue;
                results = results.concat(findPdfsDeep(full, depth + 1));
            }
            else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
                results.push(full);
            }
        }
    } catch (_) {}
    return results;
}

async function run() {
    console.log('Fetching missing paths from DB...');
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT DISTINCT PartNo FROM master.tb_PC_Plan WHERE Path_Dwg IS NULL OR Path_Layout IS NULL OR Path_Dwg = '' OR Path_Layout = ''");
    
    const allPdfs = findPdfsDeep(uploadsRoot);
    console.log(`Found ${allPdfs.length} PDFs locally.`);
    
    let updatedCount = 0;
    for (const row of result.recordset) {
        const searchKey = (row.PartNo || '').trim().toUpperCase();
        if (!searchKey) continue;

        const matchedPdfs = allPdfs.filter(pdf => {
            return path.basename(pdf).toUpperCase().includes(searchKey) || pdf.toUpperCase().includes(searchKey);
        });

        if (matchedPdfs.length > 0) {
            let foundDwg = null;
            let foundLayout = null;
            for (const pdf of matchedPdfs) {
                const type = classifyByPath(pdf);
                if (type === 'layout' && !foundLayout) foundLayout = pdf;
                if (type === 'dwg' && !foundDwg) foundDwg = pdf;
            }
            if (!foundDwg && !foundLayout) foundDwg = matchedPdfs[0];
            if (!foundLayout && matchedPdfs.length > 1) foundLayout = matchedPdfs[1];
            if (!foundDwg && matchedPdfs.length > 0) foundDwg = matchedPdfs[0];
            
            console.log(`Mapping ${searchKey}: DWG=${foundDwg ? 'Yes' : 'No'}, LAYOUT=${foundLayout ? 'Yes' : 'No'}`);
            const safeDwg = foundDwg ? foundDwg.replace(/'/g, "''") : '';
            const safeLayout = foundLayout ? foundLayout.replace(/'/g, "''") : '';
            
            await pool.request().query(`UPDATE master.tb_PC_Plan SET Path_Dwg = '${safeDwg}', Path_Layout = '${safeLayout}' WHERE PartNo = '${searchKey}'`);
            updatedCount++;
        }
    }
    console.log(`Done! Updated ${updatedCount} parts.`);
    process.exit(0);
}
run();
