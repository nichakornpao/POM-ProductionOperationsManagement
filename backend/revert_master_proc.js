const sql = require('mssql');
require('dotenv').config();
const config = {
  user: process.env.DB_USER_APP,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

const alterProc = `
ALTER PROCEDURE [trans].[Stored_Get_ToolingMaster] 
AS
BEGIN
	SET NOCOUNT ON;

    -- Fetch Master Data & JOIN with Price View
	SELECT 
		p.PartNo, 
		p.ItemNo, 
		p.Process, 
		p.MC, 
		p.Usage_pcs, 
		p.CT_sec,
		ISNULL(v.[UnitPrice_Bath], 0) AS unitPrice
	FROM dbo.PartItem p
	LEFT JOIN [db_Tooling].[dbo].[View_CuttingTool_Price_Exchange] v
		ON p.ItemNo COLLATE DATABASE_DEFAULT = v.ItemNo COLLATE DATABASE_DEFAULT
		AND p.PartNo COLLATE DATABASE_DEFAULT = v.PartNo COLLATE DATABASE_DEFAULT;
END
`;

sql.connect(config).then(pool => {
  return pool.request().query(alterProc);
}).then(result => {
  console.log('Stored Procedure Reverted Successfully.');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
