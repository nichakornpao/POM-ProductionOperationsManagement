const { poolPromise } = require('./src/config/database');
(async () => {
  try {
    const pool = await poolPromise;
    const query = `
      SELECT 
        ItemNo, 
        DocNo, 
        STOCK_ON_HAND, 
        MAIN_LOCATION, 
        Status,
        AS400STATUS
      FROM [db_Tooling].[viewer].[View_IssueCuttingTool_Request_Document]
      WHERE DocNo IN ('SETTN4260820', 'SETTN4280820')
    `;
    const res = await pool.request().query(query);
    console.table(res.recordset);
    process.exit(0);
  } catch(e) { 
    console.error(e); 
    process.exit(1); 
  }
})();
