const sql=require('mssql');
const config=require('./src/config/database');

async function run(){ 
  const pool = await config.poolRequestIndirrecPromise; 
  let query = 'INSERT INTO [dbo].[TestIssueAs400] ([Public_Id], [Division], [PartNo], [ItemNo], [MFGOrderNo], [DocNo], [MAIN_LOCATION], [MatLot], [QTY], [STOCK_ON_HAND], [MCType], [MCNo], [Status], [AS400STATUS], [DateComplete], [Remark]) VALUES '; 
  
  const values = []; 
  for(let i = 8; i <= 37; i++){ 
    const pad = String(i).padStart(3, '0'); 
    values.push(`('TEST-${pad}', '71DZ', 'TEST-PART-${pad}', 'P999${pad} (TEST)', 'TEST-MFG-${pad}', 'TEST-DOC-${pad}', 'LOC-${pad} Test', 'LOT-TEST-${pad}', ${Math.floor(Math.random() * 10) + 1}, ${Math.floor(Math.random() * 50) + 20}, 'BM165', '415', 'Complete', 'Pending', GETDATE(), 'Mock Test Item ${i}')`); 
  } 
  query += values.join(',') + ';'; 
  
  await pool.request().query(query); 
  console.log('Inserted 30 mock items'); 
  process.exit(0); 
} 
run();
