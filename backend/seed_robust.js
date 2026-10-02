const { poolRequestIndirrecPromise } = require('./src/config/database');

async function seed() {
  const pool = await poolRequestIndirrecPromise;
  
  // Clear old
  await pool.request().query(`
    DELETE FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-%';
    DELETE FROM [dbo].[TestCaseSetupList] WHERE Public_Id LIKE 'TEST-CS-%' OR Public_Id LIKE 'TEST-%';
  `);

  const partNos = ['T7175CM1C', 'T7193-M1D', 'ASC93-2AM1A', 'A5C93-2-M2A', 'T9503AM1B'];
  const reqItems = ['P113089A', 'P122824A', 'P130454A', 'P133465A', 'P142385A'];
  const mcTypes = ['M32', 'ML-400', 'BM165', 'DM165', 'RL-20'];
  const processes = ['TURNING', 'BORING', 'MILLING', 'GRINDING'];
  
  let rlItems = [];
  let csItems = [];
  const ts = Date.now().toString().slice(-6);

  let i = 1;
  for (const div of ['PMC', '71DZ']) {
    for (let j = 0; j < 30; j++) {
      const pad = String(i).padStart(3, '0');
      const rlId = `TEST-RL-Z-${ts}${pad}`;
      const csId = `TEST-CS-Z-${ts}${pad}`;
      
      const partNo = partNos[i % partNos.length];
      const itemNo = reqItems[i % reqItems.length];
      const mcType = mcTypes[i % mcTypes.length];
      const process = processes[i % processes.length];
      const qty = 1;
      
      // First 15 are zero stock, next 15 are 100 stock
      const stock = j < 15 ? 0 : 100;
      const remark = '';

      rlItems.push(`(
        '${rlId}', '${div}', '${partNo}', '${itemNo}', 'MT-RL${i}', 'INVRL${i}260828', 'RACK-A${i}', 'LOT-RL${i}',
        ${qty}, ${stock}, ${qty}, '${mcType}', '${10+i},${20+i}', 'Waiting', NULL, NULL, GETDATE(),
        '${remark}', 'MockUser', '${process}', 'INV', 0
      )`);

      csItems.push(`(
        '${csId}', '${div}', '${partNo}', 'SETUP-ITEM ${i}', '${itemNo}', 'MT-CS${i}', 'INVCS${i}260828', 'RACK-B${i}', 'LOT-CS${i}',
        ${qty}, ${stock}, ${qty}, '${mcType}', '${10+i},${20+i}', 'Waiting', NULL, NULL, GETDATE(),
        '${remark}', 'MockUser', '${process}', 'INV', NULL, NULL
      )`);
      i++;
    }
  }

  // Insert RL
  const rlQuery = `
    INSERT INTO [dbo].[TestPurchaseRequestList]
    (Public_Id, Division, PartNo, ItemNo, MFGOrderNo, DocNo, MAIN_LOCATION, MatLot,
     QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, Status, AS400STATUS, DateComplete,
     DateTime_Record, Remark, Requester, Process, [CASE], FreshQty)
    VALUES ${rlItems.join(',\n')};
  `;
  await pool.request().query(rlQuery);

  // Insert CS
  const csQuery = `
    INSERT INTO [dbo].[TestCaseSetupList]
    (Public_Id, Division, PartNo, ItemName, ItemNo, MFGOrderNo, DocNo, MAIN_LOCATION, MatLot,
     QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, Status, AS400STATUS, DateComplete,
     DateTime_Record, Remark, Requester, Process, [CASE], SourceTable, OriginalID)
    VALUES ${csItems.join(',\n')};
  `;
  await pool.request().query(csQuery);

  console.log('Inserted successfully!');
  process.exit(0);
}

seed();
