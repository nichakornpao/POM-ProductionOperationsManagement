const { poolPromise } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const query = `
      ALTER PROCEDURE [trans].[Stored_Get_ToolingStockOnRack]
      AS
      BEGIN
          SET NOCOUNT ON;

          SELECT 
              COALESCE(pma.itemNo, ph.itemNo) AS itemNo,
              ISNULL(pma.stkPd, 0) AS stkPd,
              ISNULL(ph.stkPh, 0) AS stkPh
          FROM 
          (
              SELECT ToolingName AS itemNo, SUM(Qty) AS stkPd
              FROM [db_SmartCuttingTool_PMA].[viewer].[ToolingStockOnRack] 
              GROUP BY ToolingName
          ) pma
          FULL OUTER JOIN 
          (
              SELECT ToolingName AS itemNo, SUM(Qty) AS stkPh
              FROM [db_ToolingSmartRack].[viewer].[ToolingStockOnRack] 
              GROUP BY ToolingName
          ) ph ON pma.itemNo = ph.itemNo;
      END
    `;
    await pool.request().query(query);
    console.log('SP Stored_Get_ToolingStockOnRack Altered successfully!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
