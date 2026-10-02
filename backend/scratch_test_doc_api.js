const sql = require('mssql');
const { poolPromise } = require('./src/config/database');

async function testDocSearch(docBarcode) {
  try {
    const pool = await poolPromise;
    console.log(`Searching for docBarcode: "${docBarcode}"...`);

    // Safe query casting columns to NVARCHAR to prevent SQL conversion error
    const resPlan = await pool.request()
      .input('Barcode', sql.NVarChar, docBarcode.trim())
      .query(`
        SELECT 
          Plan_ID, 
          CAST(Unique_Id AS NVARCHAR(100)) AS Unique_Id, 
          CAST(RequestNo AS NVARCHAR(100)) AS RequestNo, 
          CAST(GroupId AS NVARCHAR(100)) AS GroupId, 
          Division, Facility, Process, PartNo, MC_No, QTY, Comment,
          [Return Balance], Is_Return_OK
        FROM master.tb_PC_Plan
        WHERE CAST(RequestNo AS NVARCHAR(100)) = @Barcode 
           OR CAST(Unique_Id AS NVARCHAR(100)) = @Barcode 
           OR CAST(GroupId AS NVARCHAR(100)) = @Barcode
           OR CAST(RequestNo AS NVARCHAR(100)) LIKE '%' + @Barcode + '%'
      `);

    console.log(`Found ${resPlan.recordset.length} rows in tb_PC_Plan:`);
    console.table(resPlan.recordset);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

testDocSearch('PLAN-79');
