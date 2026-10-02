require('dotenv').config({ path: './.env' });
const { poolPromise } = require('./src/config/database');

const sqlCutting = `
UPDATE r
SET r.MCNo6Digit = ISNULL((SELECT TOP 1 MC_Code FROM [dbo].[tb_Machine_Model] WHERE LTRIM(RTRIM(MC_Name)) = LTRIM(RTRIM(r.MCType))), '') + 
    SUBSTRING(
        REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', ''), 
        1, 
        CASE 
            WHEN CHARINDEX(',', REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) > 0 
            THEN CHARINDEX(',', REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) - 1 
            ELSE LEN(REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) 
        END
    )
FROM [dbo].[tb_IssueCuttingTool_Request_Document] r
WHERE r.MCNo6Digit IS NULL;
`;

const sqlSetup = `
UPDATE r
SET r.MCNo6Digit = ISNULL((SELECT TOP 1 MC_Code FROM [dbo].[tb_Machine_Model] WHERE LTRIM(RTRIM(MC_Name)) = LTRIM(RTRIM(r.MCType))), '') + 
    SUBSTRING(
        REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', ''), 
        1, 
        CASE 
            WHEN CHARINDEX(',', REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) > 0 
            THEN CHARINDEX(',', REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) - 1 
            ELSE LEN(REPLACE(REPLACE(ISNULL(r.MCNo, ''), '-', ','), ' ', '')) 
        END
    )
FROM [dbo].[tb_IssueSetupTool_Request_Document] r
WHERE r.MCNo6Digit IS NULL;
`;

poolPromise.then(async pool => {
  const result1 = await pool.request().query(sqlCutting);
  console.log('Updated Cutting Tool rows:', result1.rowsAffected[0]);
  
  const result2 = await pool.request().query(sqlSetup);
  console.log('Updated Setup Tool rows:', result2.rowsAffected[0]);

  process.exit(0);
}).catch(e => {
  console.error('Failed:', e);
  process.exit(1);
});
