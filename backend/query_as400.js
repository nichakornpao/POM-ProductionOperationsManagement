require('dotenv').config({ path: './.env' });
const { poolPromise } = require('./src/config/database');

poolPromise.then(async pool => {
  const result = await pool.request().query(`
    SELECT ID_RequestSetupTool, DocNo, ItemNo, AS400STATUS, Status_To_PH, Date_Status_PH, DateTime_Record
    FROM [dbo].[tb_IssueSetupTool_Request_Document] 
    WHERE ItemNo = 'HBS00049N' AND DocNo = 'SETTN1260827'
  `);
  console.table(result.recordset);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
