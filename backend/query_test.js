require('dotenv').config({ path: './.env' });
const { poolPromise } = require('./src/config/database');

poolPromise.then(async pool => {
  const query = `
    SELECT 'Cutting' as Source, DocNo, ItemNo, MCNo6Digit, MCType, MCNo, ToolingType 
    FROM [dbo].[tb_IssueCuttingTool_Request_Document] 
    WHERE DocNo LIKE '%260827%' OR ItemNo = 'HBS00049N'
    UNION ALL
    SELECT 'Setup' as Source, DocNo, ItemNo, MCNo6Digit, MCType, MCNo, ToolingType 
    FROM [dbo].[tb_IssueSetupTool_Request_Document] 
    WHERE DocNo LIKE '%260827%' OR ItemNo = 'HBS00049N'
  `;
  const result = await pool.request().query(query);
  console.table(result.recordset);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
