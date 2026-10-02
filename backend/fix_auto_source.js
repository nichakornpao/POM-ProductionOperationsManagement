const { poolPromise } = require('./src/config/database');
(async () => {
  try {
    const pool = await poolPromise;
    const before = await pool.request().query(
      SELECT COUNT(*) AS cnt FROM [master].[tb_PC_Plan]
      WHERE (Path_Dwg LIKE '%PartEN PMC%' OR Path_Layout LIKE '%PartEN PMC%')
        AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source = '')
    );
    console.log('[FIX] Found ' + before.recordset[0].cnt + ' records to backfill');
    const result = await pool.request().query(
      UPDATE [master].[tb_PC_Plan]
      SET 
        Path_Dwg_Source    = CASE WHEN (Path_Dwg    LIKE '%PartEN PMC%' AND (Path_Dwg_Source    IS NULL OR Path_Dwg_Source    = '')) THEN 'auto' ELSE Path_Dwg_Source    END,
        Path_Layout_Source = CASE WHEN (Path_Layout LIKE '%PartEN PMC%' AND (Path_Layout_Source IS NULL OR Path_Layout_Source = '')) THEN 'auto' ELSE Path_Layout_Source END
      WHERE (Path_Dwg LIKE '%PartEN PMC%' OR Path_Layout LIKE '%PartEN PMC%')
        AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source = '' OR Path_Layout_Source IS NULL OR Path_Layout_Source = '')
    );
    console.log('[FIX] Updated ' + result.rowsAffected[0] + ' rows - all cron-pulled paths now marked as auto');
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
