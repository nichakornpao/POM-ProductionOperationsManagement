const { poolRequestIndirrecPromise } = require('./src/config/database');

async function run() {
  const pool = await poolRequestIndirrecPromise;

  const partNos = ['T7175CM1C', 'T7193-M1D', 'ASC93-2AM1A', 'A5C93-2-M2A', 'T9503AM1B'];
  const mcTypes = ['M32', 'ML-400', 'BM165', 'DM165', 'RL-20'];
  const processes = ['TURNING', 'BORING', 'MILLING', 'GRINDING'];

  const ts = Date.now();

  // ===== SEED 30 ZERO-STOCK records into TestPurchaseRequestList =====
  const requestListItems = [];
  for (let i = 1; i <= 30; i++) {
    const pad = String(ts).slice(-4) + String(i).padStart(2, '0');
    const publicId = `TEST-ZRL-${pad}`;
    const partNo = partNos[i % partNos.length];
    const mcType = mcTypes[i % mcTypes.length];
    const process = processes[i % processes.length];
    const qty = Math.floor(Math.random() * 3) + 1;

    requestListItems.push(`(
      '${publicId}',
      'PMC',
      '${partNo}',
      'PTEST-ZERO-RL-${String(i).padStart(3,'0')}',
      'MT-ZERO-RL${i}',
      'INVZERO${i}260828',
      NULL,
      NULL,
      ${qty},
      0, 
      ${qty},
      '${mcType}',
      '${10 + i},${20 + i}',
      'Waiting',
      NULL,
      NULL,
      GETDATE(),
      'Mock Test - ZERO STOCK (ON_HAND=0)',
      NULL,
      '${process}',
      'INV',
      0
    )`);
  }

  const rlQuery = `
    INSERT INTO [dbo].[TestPurchaseRequestList]
    (Public_Id, Division, PartNo, ItemNo, MFGOrderNo, DocNo, MAIN_LOCATION, MatLot,
     QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, Status, AS400STATUS, DateComplete,
     DateTime_Record, Remark, Requester, Process, [CASE], FreshQty)
    VALUES ${requestListItems.join(',\n')}
  `;
  await pool.request().query(rlQuery);
  console.log('✅ Inserted 30 ZERO STOCK records into TestPurchaseRequestList');

  // ===== SEED 30 ZERO-STOCK records into TestCaseSetupList =====
  const caseSetupItems = [];
  for (let i = 1; i <= 30; i++) {
    const pad = String(ts).slice(-4) + String(i).padStart(2, '0');
    const publicId = `TEST-ZCS-${pad}`;
    const partNo = partNos[i % partNos.length];
    const mcType = mcTypes[i % mcTypes.length];
    const process = processes[i % processes.length];
    const qty = Math.floor(Math.random() * 3) + 1;

    caseSetupItems.push(`(
      '${publicId}',
      'PMC',
      '${partNo}',
      'SETUP-ITEM ${i}',
      'PTEST-ZERO-CS-${String(i).padStart(3,'0')}',
      'MT-ZERO-CS${i}',
      'INVCSZ${i}260828',
      NULL,
      ${qty},
      0, 
      ${qty},
      '${mcType}',
      '${10 + i},${20 + i}',
      'Waiting',
      NULL,
      NULL,
      GETDATE(),
      'Mock Test - ZERO STOCK (ON_HAND=0)',
      NULL,
      '${process}',
      'INV',
      NULL,
      NULL
    )`);
  }

  const csQuery = `
    INSERT INTO [dbo].[TestCaseSetupList]
    (Public_Id, Division, PartNo, ItemName, ItemNo, MFGOrderNo, DocNo, MatLot,
     QTY, STOCK_ON_HAND, Req_QTY, MCType, MCNo, Status, AS400STATUS, DateComplete,
     DateTime_Record, Remark, Requester, Process, [CASE], SourceTable, OriginalID)
    VALUES ${caseSetupItems.join(',\n')}
  `;
  await pool.request().query(csQuery);
  console.log('✅ Inserted 30 ZERO STOCK records into TestCaseSetupList');

  // Summary
  const countResult = await pool.request().query(`
    SELECT 
      (SELECT COUNT(*) FROM [dbo].[TestPurchaseRequestList] WHERE Status IN ('Waiting','Hold','In Progress') AND STOCK_ON_HAND = 0) AS Z_ReqList,
      (SELECT COUNT(*) FROM [dbo].[TestCaseSetupList] WHERE Status IN ('Waiting','Hold','In Progress') AND STOCK_ON_HAND = 0) AS Z_CaseSetup
  `);
  console.log('\n📊 Total ZERO STOCK (Waiting) items:', countResult.recordset[0]);

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
