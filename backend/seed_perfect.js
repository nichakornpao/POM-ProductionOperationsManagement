const { poolRequestIndirrecPromise } = require('./src/config/database');

async function resetAndSeed() {
  const pool = await poolRequestIndirrecPromise;
  
  // 1. DELETE all test items
  await pool.request().query(`
    DELETE FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-%' OR Public_Id LIKE 'TEST-RL-%';
    DELETE FROM [dbo].[TestCaseSetupList] WHERE Public_Id LIKE 'TEST-CS-%' OR Public_Id LIKE 'TEST-%';
  `);
  console.log('✅ Cleared old mock data.');

  const partNos = ['T7175CM1C', 'T7193-M1D', 'ASC93-2AM1A', 'A5C93-2-M2A', 'T9503AM1B'];
  const reqItems = ['P113089A', 'P122824A', 'P130454A', 'P133465A', 'P142385A']; // Use real ItemNos from DB so autoFill works!
  const mcTypes = ['M32', 'ML-400', 'BM165', 'DM165', 'RL-20'];
  const processes = ['TURNING', 'BORING', 'MILLING', 'GRINDING'];

  const ts = Date.now();
  const rlItems = [];
  const csItems = [];

  // Generate 30 items with STOCK=0, 30 items with STOCK=100
  for (let i = 1; i <= 60; i++) {
    const pad = String(ts).slice(-4) + String(i).padStart(2, '0');
    
    // RL
    const rlId = `TEST-RL-${pad}`;
    const rlStock = i <= 30 ? 0 : 100;
    const rlRemark = i <= 30 ? 'Mock Test - ZERO STOCK (ON_HAND=0)' : 'Mock Test - STOCK 100';
    
    // CS
    const csId = `TEST-CS-${pad}`;
    const csStock = i <= 30 ? 0 : 100;
    const csRemark = i <= 30 ? 'Mock Test - ZERO STOCK (ON_HAND=0)' : 'Mock Test - STOCK 100';

    const partNo = partNos[i % partNos.length];
    const itemNo = reqItems[i % reqItems.length];
    const mcType = mcTypes[i % mcTypes.length];
    const process = processes[i % processes.length];
    const qty = Math.floor(Math.random() * 3) + 1;

    rlItems.push(`(
      '${rlId}', 'PMC', '${partNo}', '${itemNo}', 'MT-RL${i}', 'INVRL${i}260828', NULL, NULL,
      ${qty}, ${rlStock}, ${qty}, '${mcType}', '${10+i},${20+i}', 'Waiting', NULL, NULL, GETDATE(),
      '${rlRemark}', 'MockUser', '${process}', 'INV', 0
    )`);

    csItems.push(`(
      '${csId}', 'PMC', '${partNo}', 'SETUP-ITEM ${i}', '${itemNo}', 'MT-CS${i}', 'INVCS${i}260828', NULL,
      ${qty}, ${csStock}, ${qty}, '${mcType}', '${10+i},${20+i}', 'Waiting', NULL, NULL, GETDATE(),
      '${csRemark}', 'MockUser', '${process}', 'INV', NULL, NULL
    )`);
  }

  // Insert RL
  const rlQuery = `
    INSERT INTO [dbo].[TestPurchaseRequestList]
    (Public_Id, Division, PartNo, ItemNo, MFGOrderNo, DocNo, MAIN_LOCATION, MatLot,
     QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, Status, AS400STATUS, DateComplete,
     DateTime_Record, Remark, Requester, Process, [CASE], FreshQty)
    VALUES ${rlItems.join(',\n')}
  `;
  await pool.request().query(rlQuery);
  console.log('✅ Inserted 60 records into TestPurchaseRequestList');

  // Insert CS
  const csQuery = `
    INSERT INTO [dbo].[TestCaseSetupList]
    (Public_Id, Division, PartNo, ItemName, ItemNo, MFGOrderNo, DocNo, MatLot,
     QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, Status, AS400STATUS, DateComplete,
     DateTime_Record, Remark, Requester, Process, [CASE], SourceTable, OriginalID)
    VALUES ${csItems.join(',\n')}
  `;
  await pool.request().query(csQuery);
  console.log('✅ Inserted 60 records into TestCaseSetupList');

  process.exit(0);
}

resetAndSeed().catch(err => { console.error(err); process.exit(1); });
