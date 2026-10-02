const { poolPromise, sql } = require('./src/config/database');

poolPromise.then(async pool => {
  try {
    const query = `
      CREATE PROCEDURE [trans].[Stored_Get_Incoming_PR] 
          @Year INT,
          @Month INT
      AS
      BEGIN
          SET NOCOUNT ON;

          DECLARE @StartDate DATE = DATEFROMPARTS(@Year, @Month, 1);

          SELECT 
              ItemNo,
              YEAR(DueDate) AS targetYear,
              MONTH(DueDate) AS targetMonth,
              SUM(LocalAmountBT) AS totalQty
          FROM 
              [db_Cost_Data_Centralized].[master].[tb_MRP_PRStatus_71DZ]
          WHERE 
              Status IN ('P/R Waiting for approval', 'P/R Approved', 'P/O Waiting for approval')
              AND DueDate >= @StartDate
          GROUP BY 
              ItemNo,
              YEAR(DueDate),
              MONTH(DueDate)
      END
    `;
    await pool.request().query(query);
    console.log('SP PR Created successfully!');
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
