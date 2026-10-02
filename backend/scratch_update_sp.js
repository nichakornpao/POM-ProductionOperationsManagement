const { poolPromise, sql } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const query = `
      ALTER PROCEDURE [trans].[Stored_Get_Incoming_PO] 
          @Year INT,
          @Month INT
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @StartDate DATE = DATEFROMPARTS(@Year, @Month, 1);

          SELECT 
              ItemNo,
              YEAR([Date]) AS targetYear,
              MONTH([Date]) AS targetMonth,
              SUM(Quantity) AS totalQty
          FROM 
              [db_Cost_Data_Centralized].[master].[tb_MRP_PO_71DZ]
          WHERE 
              [Status] = 'P/O Approved'
              AND [Date] >= @StartDate
          GROUP BY 
              ItemNo,
              YEAR([Date]),
              MONTH([Date])
      END
    `;
    await pool.request().query(query);
    console.log('SP Updated successfully!');
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
