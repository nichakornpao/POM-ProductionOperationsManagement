const { poolRequestIndirrecPromise } = require('./src/config/database');

async function run() {
  const pool = await poolRequestIndirrecPromise;

  // ===== SEED 20 records into TestPurchaseRequestList =====
  // Items 1-16 = have stock, Items 17-20 = ON_HAND = 0
  const requestListItems = [];

  const partNos = ['T7175CM1C', 'T7193-M1D', 'ASC93-2AM1A', 'A5C93-2-M2A', 'T9503AM1B'];
  const mcTypes = ['M32', 'ML-400', 'BM165', 'DM165', 'RL-20'];
  const processes = ['TURNING', 'BORING', 'MILLING', 'GRINDING'];
  const divisions = ['PMC'];

  const ts = Date.now();

  for (let i = 1; i <= 20; i++) {
    const pad = String(ts).slice(-4) + String(i).padStart(2, '0');
    const publicId = `TEST-RT-S${pad}`;
    const partNo = partNos[i % partNos.length];
    const mcType = mcTypes[i % mcTypes.length];
    const process = processes[i % processes.length];
    const hasStock = i <= 16; // Items 17-20 have ON_HAND = 0
    const stockOnHand = hasStock ? (Math.floor(Math.random() * 20) + 5) : 0;
    const qty = Math.floor(Math.random() * 3) + 1;

    requestListItems.push(`(
      '${publicId}',
      'PMC',
      '${partNo}',
      'PTEST-RL-${String(i).padStart(3,'0')}',
      'MT-SEED-RL${i}',
      'INVTEST${i}260826',
      NULL,
      NULL,
      ${qty},
      ${stockOnHand},
      ${qty},
      '${mcType}',
      '${10 + i},${20 + i}',
      'Waiting',
      NULL,
      NULL,
      GETDATE(),
      '${hasStock ? 'Mock Test - Has Stock' : 'Mock Test - ZERO STOCK (ON_HAND=0)'}',
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
  console.log('✅ Inserted 20 records into TestPurchaseRequestList (items 17-20 have STOCK_ON_HAND=0)');

  // ===== SEED 20 records into TestCaseSetupList =====
  const caseSetupItems = [];

  for (let i = 1; i <= 20; i++) {
    const pad = String(ts).slice(-4) + String(i).padStart(2, '0');
    const publicId = `TEST-CS-S${pad}`;
    const partNo = partNos[i % partNos.length];
    const mcType = mcTypes[i % mcTypes.length];
    const process = processes[i % processes.length];
    const hasStock = i <= 16; // Items 17-20 have ON_HAND = 0
    const stockOnHand = hasStock ? (Math.floor(Math.random() * 20) + 5) : 0;
    const qty = Math.floor(Math.random() * 3) + 1;

    caseSetupItems.push(`(
      '${publicId}',
      'PMC',
      '${partNo}',
      'PTEST-CS-${String(i).padStart(3,'0')}',
      'SETUP-ITEM ${i}',
      'MT-SEED-CS${i}',
      'INVCS${i}260826',
      NULL,
      ${qty},
      ${stockOnHand},
      ${qty},
      '${mcType}',
      '${10 + i},${20 + i}',
      'Waiting',
      NULL,
      NULL,
      GETDATE(),
      '${hasStock ? 'Case Setup Mock - Has Stock' : 'Case Setup Mock - ZERO STOCK (ON_HAND=0)'}',
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
  console.log('✅ Inserted 20 records into TestCaseSetupList (items 17-20 have STOCK_ON_HAND=0)');

  // Summary
  const countResult = await pool.request().query(`
    SELECT 
      (SELECT COUNT(*) FROM [dbo].[TestPurchaseRequestList] WHERE Status IN ('Waiting','Hold','In Progress')) AS RequestListCount,
      (SELECT COUNT(*) FROM [dbo].[TestCaseSetupList] WHERE Status IN ('Waiting','Hold','In Progress')) AS CaseSetupCount
  `);
  console.log('\n📊 Updated counts:', countResult.recordset[0]);

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
