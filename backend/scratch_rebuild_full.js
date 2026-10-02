require('dotenv').config({path: __dirname + '/.env'});
const { poolPromise } = require('./src/config/database');
const sql = require('mssql');

(async () => {
  try {
    const pool = await poolPromise;

    const enConfig = {
      user: 'Cost_Team',
      password: 'Cost@User1',
      server: 'PBGM8G\\SQLEXPRESS',
      database: 'RequestindirrecMaterial',
      options: { encrypt: false, trustServerCertificate: true }
    };

    const enPool = await sql.connect(enConfig);

    // Fetch all PartNo from tb_PC_Plan
    const planParts = await pool.request().query("SELECT Plan_ID, PartNo, Path_Dwg, Path_Layout FROM [master].[tb_PC_Plan]");
    console.log(`tb_PC_Plan has ${planParts.recordset.length} total rows.`);

    // Fetch all EN PMC paths
    const enRes = await enPool.request().query(`
      SELECT PartNo, PathDwg, PathLayout
      FROM (
        SELECT PartNo, PathDwg, PathLayout,
               ROW_NUMBER() OVER(PARTITION BY PartNo ORDER BY RequestDate DESC) as rn
        FROM dbo.EngineerPMCpart
        WHERE (NULLIF(LTRIM(RTRIM(PathDwg)), '') IS NOT NULL OR NULLIF(LTRIM(RTRIM(PathLayout)), '') IS NOT NULL)
      ) t
      WHERE rn = 1
    `);

    const enMap = {};
    enRes.recordset.forEach(r => {
      if (r.PartNo) enMap[r.PartNo.trim().toUpperCase()] = r;
    });

    console.log(`Mapped ${Object.keys(enMap).length} unique PartNo paths from EN DB.`);

    let updatedCount = 0;
    for (const row of planParts.recordset) {
      const partKey = (row.PartNo || '').trim().toUpperCase();
      const enMatch = enMap[partKey];

      if (enMatch) {
        const safeDwg = enMatch.PathDwg ? enMatch.PathDwg.replace(/'/g, "''") : '';
        const safeLayout = enMatch.PathLayout ? enMatch.PathLayout.replace(/'/g, "''") : '';

        await pool.request().query(`
          UPDATE [master].[tb_PC_Plan]
          SET Path_Dwg = CASE WHEN '${safeDwg}' <> '' THEN '${safeDwg}' ELSE Path_Dwg END,
              Path_Layout = CASE WHEN '${safeLayout}' <> '' THEN '${safeLayout}' ELSE Path_Layout END,
              Path_Dwg_Source = CASE WHEN '${safeDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN 'auto' ELSE Path_Dwg_Source END,
              Path_Layout_Source = CASE WHEN '${safeLayout}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN 'auto' ELSE Path_Layout_Source END
          WHERE Plan_ID = ${row.Plan_ID}
        `);
        updatedCount++;
      }
    }

    console.log(`\n✅ Successfully updated and restored paths for ${updatedCount} rows!`);

    const statusRes = await pool.request().query(`
      SELECT 
        COUNT(*) as total_rows,
        SUM(CASE WHEN Path_Dwg IS NOT NULL AND Path_Dwg <> '' THEN 1 ELSE 0 END) as rows_with_dwg,
        SUM(CASE WHEN Path_Layout IS NOT NULL AND Path_Layout <> '' THEN 1 ELSE 0 END) as rows_with_layout,
        SUM(CASE WHEN (Path_Dwg IS NULL OR Path_Dwg = '') AND (Path_Layout IS NULL OR Path_Layout = '') THEN 1 ELSE 0 END) as rows_empty
      FROM [master].[tb_PC_Plan]
    `);

    console.log('\nFinal DB Path Status in tb_PC_Plan:', statusRes.recordset[0]);

    process.exit(0);
  } catch (err) {
    console.error('Rebuild full error:', err);
    process.exit(1);
  }
})();
