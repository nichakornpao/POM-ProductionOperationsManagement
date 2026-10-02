require('dotenv').config({ path: './.env' });
const { poolPromise } = require('./src/config/database');

const sqlSetup = `
UPDATE [dbo].[tb_IssueSetupTool_Request_Document]
SET DocNo = SUBSTRING(DocNo, 1, LEN(DocNo) - 6) + RIGHT('0' + CAST(YEAR(DueDate) % 100 AS VARCHAR(2)), 2) + RIGHT('0' + CAST(MONTH(DueDate) AS VARCHAR(2)), 2) + RIGHT('0' + CAST(DAY(DueDate) AS VARCHAR(2)), 2)
WHERE DocNo IS NOT NULL 
AND DueDate IS NOT NULL 
AND LEN(DocNo) >= 6 
AND ISNUMERIC(RIGHT(DocNo, 6)) = 1 
AND RIGHT(DocNo, 6) NOT LIKE '%[^0-9]%';
`;

const sqlCutting = `
UPDATE [dbo].[tb_IssueCuttingTool_Request_Document]
SET DocNo = SUBSTRING(DocNo, 1, LEN(DocNo) - 6) + RIGHT('0' + CAST(YEAR(DueDate) % 100 AS VARCHAR(2)), 2) + RIGHT('0' + CAST(MONTH(DueDate) AS VARCHAR(2)), 2) + RIGHT('0' + CAST(DAY(DueDate) AS VARCHAR(2)), 2)
WHERE DocNo IS NOT NULL 
AND DueDate IS NOT NULL 
AND LEN(DocNo) >= 6 
AND ISNUMERIC(RIGHT(DocNo, 6)) = 1 
AND RIGHT(DocNo, 6) NOT LIKE '%[^0-9]%';
`;

poolPromise.then(async pool => {
  try {
    const result1 = await pool.request().query(sqlSetup);
    console.log('Updated Setup Tool rows:', result1.rowsAffected[0]);

    const result2 = await pool.request().query(sqlCutting);
    console.log('Updated Cutting Tool rows:', result2.rowsAffected[0]);

    process.exit(0);
  } catch (err) {
    console.error('Error executing update:', err);
    process.exit(1);
  }
}).catch(e => {
  console.error('Failed to connect:', e);
  process.exit(1);
});
