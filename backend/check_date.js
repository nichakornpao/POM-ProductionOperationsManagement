const { poolPromise } = require('./src/config/database');
(async () => {
  try {
    const pool = await poolPromise;
    const query = `
      SELECT 
        ItemNo, DocNo, DateTime_Record
      FROM [db_Tooling].[viewer].[View_IssueCuttingTool_Request_Document]
      WHERE DocNo = 'SETTN4260820'
    `;
    const res = await pool.request().query(query);
    console.table(res.recordset);
    process.exit(0);
  } catch(e) { 
    console.error(e); 
    process.exit(1); 
  }
})();
