const { sql, poolPromise } = require('./src/config/database');

async function populate24AutoPaths() {
  try {
    const pool = await poolPromise;
    console.log('Populating auto paths for 24/09/2026 items...');

    // 1. T7070-G1CT01 rows on 24/09/2026
    const dwg7070 = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts\Process DWG\OT-7070\T7070-G1CT01.pdf`;
    const layout7070 = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC\OT-7070\Cutting layout BM165\TH\T7070-G1C & T7070-G1CT01 Rev.H.pdf`;

    const res7070 = await pool.request()
      .input('Dwg', sql.NVarChar, dwg7070)
      .input('Layout', sql.NVarChar, layout7070)
      .query(`
        UPDATE master.tb_PC_Plan
        SET Path_Dwg = @Dwg,
            Path_Layout = @Layout,
            Path_Dwg_Source = 'auto',
            Path_Layout_Source = 'auto'
        WHERE PlanDate >= '2026-09-24' AND PlanDate < '2026-09-25'
          AND PartNo = 'T7070-G1CT01'
      `);
    console.log(`Updated T7070-G1CT01 rows on 24/09/2026: ${res7070.rowsAffected[0]} rows`);

    // 2. T7025JG3A rows on 24/09/2026
    const dwg7025 = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts\Process DWG\OT-7025J\T7025JG3A-TN1.pdf`;
    const layout7025 = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC\OT-7025\OT-7025J\Cutting layout BW12\TN 1\T7025JG3A Rev.A  TN1.pdf`;

    const res7025 = await pool.request()
      .input('Dwg', sql.NVarChar, dwg7025)
      .input('Layout', sql.NVarChar, layout7025)
      .query(`
        UPDATE master.tb_PC_Plan
        SET Path_Dwg = @Dwg,
            Path_Layout = @Layout,
            Path_Dwg_Source = 'auto',
            Path_Layout_Source = 'auto'
        WHERE PlanDate >= '2026-09-24' AND PlanDate < '2026-09-25'
          AND PartNo = 'T7025JG3A'
      `);
    console.log(`Updated T7025JG3A rows on 24/09/2026: ${res7025.rowsAffected[0]} rows`);

    // Verify final state on 24/09/2026
    const resVerify = await pool.request().query(`
      SELECT Plan_ID, CONVERT(varchar, PlanDate, 103) as PlanDateStr, PartNo, Path_Dwg, Path_Layout, Path_Dwg_Source, Path_Layout_Source
      FROM master.tb_PC_Plan
      WHERE PlanDate >= '2026-09-24' AND PlanDate < '2026-09-25'
      ORDER BY Plan_ID
    `);
    console.log("\nVerified 24/09/2026 state:");
    console.log(JSON.stringify(resVerify.recordset, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

populate24AutoPaths();
