const { poolPromise } = require("../config/database");
const sql = require('mssql');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { clearHistoryCache } = require('./PurchaseHistory.controller');

const AUTO_FIRE_CONFIG_PATH = path.join(__dirname, '../config/auto-fire.json');

// Helper to record log in [dbo].[tb_IssueAS400_Log] and update Request tables with Comment_Status
async function recordAS400Result(pool, {
  publicId,
  itemNo,
  docNo,
  division,
  status,
  commentStatus,
  apiMessage,
  apiPayload,
  triggerSource
}) {
  if (!publicId) return;
  const isCutting = publicId.startsWith('C');
  const targetTable = isCutting
    ? '[dbo].[tb_IssueCuttingTool_Request_Document]'
    : '[dbo].[tb_IssueSetupTool_Request_Document]';

  try {
    // 1. Insert into tb_IssueAS400_Log
    await pool.request()
      .input('Public_Id', sql.NVarChar, publicId)
      .input('ItemNo', sql.NVarChar, itemNo || null)
      .input('DocNo', sql.NVarChar, docNo || null)
      .input('Division', sql.NVarChar, division || null)
      .input('Status', sql.NVarChar, status)
      .input('Comment_Status', sql.NVarChar, commentStatus || null)
      .input('API_Message', sql.NVarChar, apiMessage ? String(apiMessage).slice(0, 4000) : null)
      .input('API_Payload', sql.NVarChar, apiPayload ? JSON.stringify(apiPayload).slice(0, 4000) : null)
      .input('Trigger_Source', sql.NVarChar, triggerSource || 'MANUAL_UI')
      .query(`
        INSERT INTO [dbo].[tb_IssueAS400_Log] 
          (Public_Id, ItemNo, DocNo, Division, Status, Comment_Status, API_Message, API_Payload, Trigger_Source, Created_Date)
        VALUES 
          (@Public_Id, @ItemNo, @DocNo, @Division, @Status, @Comment_Status, @API_Message, @API_Payload, @Trigger_Source, GETDATE())
      `);

    // 2. Update Request Table with Status and Comment_Status
    const updateQuery = status === 'DONE'
      ? `UPDATE ${targetTable} SET AS400STATUS = 'DONE', Comment_Status = @Comment_Status, DateComplete = SYSDATETIME() WHERE Public_Id = @Public_Id`
      : `UPDATE ${targetTable} SET AS400STATUS = @Status, Comment_Status = @Comment_Status WHERE Public_Id = @Public_Id`;

    await pool.request()
      .input('Public_Id', sql.NVarChar, publicId)
      .input('Status', sql.NVarChar, status)
      .input('Comment_Status', sql.NVarChar, commentStatus || null)
      .query(updateQuery);
  } catch (err) {
    console.error(`[AS400 LOG ERROR] Failed to record result for ${publicId}:`, err.message);
  }
}

// Helper to update Comment_Status in Request tables while keeping AS400STATUS = 'Pending'
async function updatePendingCommentStatus(pool, publicId, commentStatus) {
  if (!publicId) return;
  const isCutting = publicId.startsWith('C');
  const targetTable = isCutting
    ? '[dbo].[tb_IssueCuttingTool_Request_Document]'
    : '[dbo].[tb_IssueSetupTool_Request_Document]';

  try {
    await pool.request()
      .input('Public_Id', sql.NVarChar, publicId)
      .input('Comment_Status', sql.NVarChar, commentStatus)
      .query(`
        UPDATE ${targetTable}
        SET Comment_Status = @Comment_Status
        WHERE Public_Id = @Public_Id 
          AND (AS400STATUS = 'Pending' OR AS400STATUS IS NULL)
          AND (Comment_Status IS NULL OR Comment_Status <> @Comment_Status)
      `);
  } catch (err) {
    console.error(`[AS400 PENDING COMMENT ERROR] Failed to update for ${publicId}:`, err.message);
  }
}

// Reusable core AS400 Export function (used by both HTTP API endpoint and background daemon)
async function executeExportAS400(division, data, triggerSource = 'MANUAL_UI') {
  if (!division || !data || !Array.isArray(data) || data.length === 0) {
    return { success: false, error: 'Invalid or empty request data' };
  }

  // 🧪 Check if payload contains mock test items OR if we are on a non-production DB
  const isProductionDB = process.env.DB_SERVER && process.env.DB_SERVER.toLowerCase() === 'pbp155';
  
  const isMockData = !isProductionDB || data.some(item => 
    item.isMockTest || 
    (item.ItemNo && String(item.ItemNo).includes('(TEST)')) || 
    (item.Public_Id && String(item.Public_Id).startsWith('TEST-'))
  );

  if (isMockData) {
    const timeStr = new Date().toLocaleString('th-TH');
    const pmcLink = process.env.AS400_PMC_LINK || 'https://as400-pmc-api.minebea.co.th/api/v1/issue';
    const gmLink = process.env.AS400_GM_LINK || 'https://as400-gm-api.minebea.co.th/api/v1/issue';
    const targetUrl = (division === '71DZ' || division === 'PMC') ? pmcLink : gmLink;

    console.log(`========================================================================================`);
    console.log(`[MOCK AS400 EXPORT & SQL DRY RUN TEST LOG] - BACKEND CONTROLLER PROCESS`);
    console.log(`Time: ${timeStr} | Target Division: ${division} | Total Items to Cut: ${data.length} Item(s)`);
    console.log(`----------------------------------------------------------------------------------------`);
    data.forEach((item, index) => {
      console.log(`   [${index + 1}] ItemNo: ${item.ItemNo} | Mapped QTY: ${item.Quantity || item.QTY || 0} | Mapped DOCNo: ${item.DOCNo || item.DocNo || '-'} | Location: ${item.StockLocation || item.Stock_Location || '-'} | MC 6 Digit: ${item.MCNo6Digit || item.MC6Digit || item.MCNo || '-'}`);
    });
    console.log(`----------------------------------------------------------------------------------------`);

    try {
      const { poolRequestIndirrecPromise, poolPromise } = require("../config/database");
      const poolIndirrec = await poolRequestIndirrecPromise;
      const poolMain = await poolPromise;
      
      if (poolIndirrec && poolMain) {
        await Promise.all(data.map(async (item) => {
          const issueQty = parseInt(item.Quantity || item.QTY || 0, 10);
          
          if (item.Public_Id && item.Public_Id.startsWith('TEST-')) {
            await poolIndirrec.request()
              .input('IssueQty', sql.Int, issueQty)
              .input('Public_Id', sql.NVarChar, item.Public_Id)
              .query(`
                UPDATE [dbo].[TestIssueAs400] 
                SET AS400STATUS = 'DONE',
                    STOCK_ON_HAND = STOCK_ON_HAND - @IssueQty,
                    DateComplete = SYSDATETIME()
                WHERE Public_Id = @Public_Id;

                UPDATE [dbo].[TestPurchaseRequestList] 
                SET AS400STATUS = 'DONE',
                    STOCK_ON_HAND = STOCK_ON_HAND - @IssueQty,
                    DateComplete = SYSDATETIME()
                WHERE Public_Id = @Public_Id;
              `);
          } else {
            await recordAS400Result(poolMain, {
              publicId: item.Public_Id,
              itemNo: item.ItemNo,
              docNo: item.DOCNo || item.DocNo,
              division: division,
              status: 'DONE',
              commentStatus: 'ตัดสำเร็จ (Success)',
              apiMessage: 'Mock test successful',
              apiPayload: item,
              triggerSource
            });
          }
        }));
        console.log(`✅ [SQL UPDATED] Successfully updated AS400STATUS (Dry Run mode) for ${data.length} item(s).`);
      }
    } catch (err) {
      console.error('❌ [SQL ERROR] Failed to update mock data during Dry Run:', err);
    }

    clearHistoryCache();
    return {
      success: true,
      message: 'Mock test export verified by backend successfully (SQL Dry Run Complete)',
      itemCount: data.length,
      items: data.map(i => i.ItemNo),
      isMockTest: true
    };
  }

  let apiUrl = '';
  let token = '';

  if (division === '7122' || division === 'GM') {
    apiUrl = process.env.AS400_GM_LINK;
    token = process.env.AS400_GM_TOKEN;
  } else if (division === '71DZ' || division === 'PMC') {
    apiUrl = process.env.AS400_PMC_LINK;
    token = process.env.AS400_PMC_TOKEN;
  } else {
    return { success: false, error: 'Unsupported division' };
  }

  if (!apiUrl || !token) {
    return { success: false, error: 'API configurations are missing for this division' };
  }

  try {
    const apiPayload = data.map(item => {
      const { Public_Id, ...apiFields } = item;
      return {
        ...apiFields,
        EmpID: process.env.AS400_EMPLOYEE_ID,
        Pcname: process.env.AS400_PCNAME
      };
    });

    console.log('\n========================================================================================');
    console.log('🔥 [REAL AS400 EXPORT LOG] - LIVE PRODUCTION DATA');
    console.log(`Time: ${new Date().toLocaleString('th-TH')} | Target Division: ${division}`);
    console.log(`Target API URL: ${apiUrl}`);
    console.log('----------------------------------------------------------------------------------------');

    // Update Local Database Status to 'Processing' before calling external API
    try {
      const pool = await poolPromise;
      await Promise.all(data.map(async (item) => {
        if (item.Public_Id) {
          const isCutting = item.Public_Id.startsWith('C');
          const targetTable = isCutting
            ? '[dbo].[tb_IssueCuttingTool_Request_Document]'
            : '[dbo].[tb_IssueSetupTool_Request_Document]';
          await pool.request()
            .input('Public_Id', sql.NVarChar, item.Public_Id)
            .query(`UPDATE ${targetTable} SET AS400STATUS = 'Processing', Comment_Status = N'กำลังส่งตัด AS400...' WHERE Public_Id = @Public_Id`);
        }
      }));
    } catch (dbErr) {
      console.error('Failed to set Processing status:', dbErr);
    }

    const response = await postToExternalAPI(apiUrl, token, apiPayload);

    console.log('AS400 Response received:', JSON.stringify(response, null, 2));

    // Update Local Database Status and Log based on per-item result from AS400 API
    const pool = await poolPromise;
    const isResponseArray = Array.isArray(response);

    await Promise.all(data.map(async (item) => {
      if (item.Public_Id) {
        let statusToSet = 'DONE';
        let commentToSet = 'ตัดสำเร็จ (Success)';
        let rawApiMsg = '';

        if (isResponseArray) {
          const matchResp = response.find((resItem) => 
            resItem && resItem.itemno && resItem.itemno.toString().trim().toLowerCase() === (item.ItemNo || '').toString().trim().toLowerCase()
          );
          if (matchResp) {
            rawApiMsg = matchResp.message || '';
            if (rawApiMsg.toString().trim().toLowerCase() !== 'success') {
              statusToSet = 'FAIL';
              const lowerMsg = rawApiMsg.toLowerCase();
              if (lowerMsg.includes('on hand') || lowerMsg.includes('onhand') || lowerMsg.includes('stock')) {
                commentToSet = `On-Hand ไม่พอใน AS400: ${rawApiMsg}`;
              } else if (lowerMsg.includes('item') || lowerMsg.includes('master') || lowerMsg.includes('not found')) {
                commentToSet = `ไม่พบข้อมูล Item ใน AS400: ${rawApiMsg}`;
              } else if (lowerMsg.includes('loc') || lowerMsg.includes('warehouse')) {
                commentToSet = `Location หรือคลังผิดพลาดใน AS400: ${rawApiMsg}`;
              } else {
                commentToSet = `AS400 ปฏิเสธ: ${rawApiMsg}`;
              }
              console.warn(`⚠️ [AS400 ITEM REJECTED] ItemNo ${item.ItemNo} returned message: "${rawApiMsg}"`);
            }
          }
        }

        await recordAS400Result(pool, {
          publicId: item.Public_Id,
          itemNo: item.ItemNo,
          docNo: item.DOCNo || item.DocNo,
          division: division,
          status: statusToSet,
          commentStatus: commentToSet,
          apiMessage: rawApiMsg || (statusToSet === 'DONE' ? 'Success' : 'Unknown response'),
          apiPayload: item,
          triggerSource
        });
      }
    }));

    clearHistoryCache();
    return { success: true, message: 'Export processed', response };
  } catch (error) {
    console.error('[AS400] Export Error:', error.message);
    try {
      const pool = await poolPromise;
      const commentToSet = `เชื่อมต่อ AS400 ล้มเหลว: ${error.message}`;
      await Promise.all(data.map(async (item) => {
        if (item.Public_Id) {
          await recordAS400Result(pool, {
            publicId: item.Public_Id,
            itemNo: item.ItemNo,
            docNo: item.DOCNo || item.DocNo,
            division: division,
            status: 'FAIL',
            commentStatus: commentToSet,
            apiMessage: error.message,
            apiPayload: item,
            triggerSource
          });
        }
      }));
    } catch (dbErr) {
      console.error('[AS400] Failed to update fail status in DB:', dbErr.message);
    }
    return { success: false, error: 'Failed to export to AS400', details: error.message };
  }
}

function postToExternalAPI(url, token, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      timeout: 180000, // 3 minutes timeout prevention against indefinite hanging
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`
      },
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`Status Code: ${res.statusCode}, Body: ${body}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('AS400 External API Request Timed Out (after 180s)'));
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

exports.postAS400 = async (req, res) => {
  const { division, data } = req.body;

  if (!division || !data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const result = await executeExportAS400(division, data);
  if (result.success) {
    return res.json(result);
  } else {
    return res.status(500).json(result);
  }
};

exports.getAS400Config = (req, res) => {
  let isAutoFireEnabled = false;
  try {
    if (fs.existsSync(AUTO_FIRE_CONFIG_PATH)) {
      const configData = fs.readFileSync(AUTO_FIRE_CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(configData);
      isAutoFireEnabled = parsed.isAutoFireEnabled === true;
    }
  } catch (error) {
    console.error('Error reading auto-fire config:', error);
  }

  res.json({
    employeeId: process.env.AS400_EMPLOYEE_ID,
    pcName: process.env.AS400_PCNAME,
    isAutoFireEnabled: isAutoFireEnabled
  });
};

exports.postAutoFireConfig = (req, res) => {
  const { isEnabled } = req.body;
  if (typeof isEnabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid input, isEnabled must be a boolean' });
  }

  try {
    const configDir = path.dirname(AUTO_FIRE_CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(AUTO_FIRE_CONFIG_PATH, JSON.stringify({ isAutoFireEnabled: isEnabled }, null, 2));
    console.log(`[AUTO-FIRE CONFIG] Saved isAutoFireEnabled = ${isEnabled}`);
    res.json({ message: 'Auto-fire config updated successfully', isAutoFireEnabled: isEnabled });
  } catch (error) {
    console.error('Error writing auto-fire config:', error);
    res.status(500).json({ error: 'Failed to update auto-fire config' });
  }
};

// ----------------------------------------------------------------------------------------
// 🤖 BACKGROUND AUTO-FIRE DAEMON
// Runs continuously on backend server every 15s when isAutoFireEnabled = true
// ----------------------------------------------------------------------------------------
let isAutoFireDaemonRunning = false;

async function runAutoFireDaemon() {
  let isAutoFireEnabled = false;
  try {
    if (fs.existsSync(AUTO_FIRE_CONFIG_PATH)) {
      const configData = fs.readFileSync(AUTO_FIRE_CONFIG_PATH, 'utf8');
      isAutoFireEnabled = JSON.parse(configData).isAutoFireEnabled === true;
    }
  } catch (e) {}

  if (!isAutoFireEnabled) return;
  if (isAutoFireDaemonRunning) return;

  isAutoFireDaemonRunning = true;
  try {
    const pool = await poolPromise;
    if (!pool) return;

    // Get current month start date
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const pendingResult = await pool.request()
      .input('AS400Status', sql.NVarChar(50), 'Pending')
      .input('StartDate', sql.DateTime, new Date(startOfMonth))
      .execute('trans.Stored_Get_IssueAS400_History');
    const pendingItems = pendingResult.recordset || [];

    if (pendingItems.length === 0) return;

    console.log(`[AUTO-FIRE DAEMON] Found ${pendingItems.length} pending request(s) for current month.`);

    // Pre-validate items: only items with sufficient stock AND valid location AND in master are sent to AS400
    // Items with 0 stock or insufficient stock are KEPT in 'Pending' (NOT set to FAIL) so they can be cut automatically once restocked!
    const validItems = [];
    for (const item of pendingItems) {
      const onHand = Number(item.ON_HAND || 0);
      const loc = (item.Stock_Location || '').trim();
      const isMatchedMaster = item.Is_Matched_iPBASS === 1 || item.Is_Matched_iPBASS === true || !!item.ItemName;
      const qtyNeeded = Number(item.QTY || 0);

      if (!isMatchedMaster) {
        // ไม่พบใน Master: คงสถานะ PENDING ไว้ พร้อมอัปเดต Comment แจ้งเตือน
        await updatePendingCommentStatus(pool, item.Public_Id, 'ไม่พบใน Master (iPBASS)');
        console.warn(`[AUTO-FIRE DAEMON] Item ${item.ItemNo} (${item.Public_Id}) kept in PENDING: Not in Item Master`);
      } else if (!loc) {
        // ไม่มีเลขชั้นวาง: คงสถานะ PENDING ไว้รอคนระบุชั้นวาง
        await updatePendingCommentStatus(pool, item.Public_Id, 'ไม่มีเลขชั้นวาง (Location ว่าง)');
        console.warn(`[AUTO-FIRE DAEMON] Item ${item.ItemNo} (${item.Public_Id}) kept in PENDING: Missing Location`);
      } else if (onHand <= 0) {
        // ของหมดสต็อก: คงสถานะ PENDING ไว้รอของเข้าสต็อก (ไม่เปลี่ยนเป็น FAIL!)
        await updatePendingCommentStatus(pool, item.Public_Id, 'ของหมดสต็อก (On-Hand = 0)');
        console.log(`[AUTO-FIRE DAEMON] Item ${item.ItemNo} (${item.Public_Id}) kept in PENDING: On-Hand = 0 (waiting for stock)`);
      } else if (onHand < qtyNeeded) {
        // สต็อกไม่พอ: คงสถานะ PENDING ไว้รอของเข้าเพิ่ม (ไม่เปลี่ยนเป็น FAIL!)
        const commentMsg = `สต็อกไม่พอตัด (ขอ ${qtyNeeded} / มี ${onHand})`;
        await updatePendingCommentStatus(pool, item.Public_Id, commentMsg);
        console.log(`[AUTO-FIRE DAEMON] Item ${item.ItemNo} (${item.Public_Id}) kept in PENDING: ${commentMsg}`);
      } else {
        // ✅ มีของพร้อมตัดครบถ้วน (On-Hand >= QTY) -> ส่งตัด AS400 ทันที!
        validItems.push(item);
      }
    }

    if (validItems.length > 0) {
      // Group valid items by Division (7122/GM vs 71DZ/PMC)
      const divGroups = new Map();
      validItems.forEach(item => {
        const reqDiv = (item.Division || '').toString().trim().toUpperCase();
        const divKey = (reqDiv === '71DZ' || reqDiv === 'PMC') ? '71DZ' : '7122';
        if (!divGroups.has(divKey)) divGroups.set(divKey, []);
        divGroups.get(divKey).push(item);
      });

      const d = new Date();
      for (const [divKey, items] of divGroups.entries()) {
        const mappedData = items.map(req => {
          let warehouseVal = "";
          if (divKey === '7122') {
            warehouseVal = "A";
          } else {
            const isSetup = req.ToolingType === 'SetupTool' || (req.Public_Id && req.Public_Id.startsWith('S'));
            warehouseVal = "C";
          }
          return {
            "ItemNo": req.ItemNo || "",
            "Quantity": req.QTY || 0,
            "ON_HAND": req.ON_HAND || 0,
            "DOCNo": req.DocNo || "",
            "TransactionYear": d.getFullYear().toString(),
            "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'),
            "TransactionDay": d.getDate().toString().padStart(2, '0'),
            "WareHouse": warehouseVal,
            "StockLocation": req.Stock_Location || "",
            "MaterialLot": req.MatLot || "",
            "Mono": divKey === '7122' ? (req.MFGOrderNo || "") : (req.PartNo || ""),
            "EmpID": process.env.AS400_EMPLOYEE_ID || "",
            "Pcname": process.env.AS400_PCNAME || "",
            "MCNo6Digit": req.MCNo6Digit || "",
            "MC_No": req.MCNo || "",
            "MCType": req.MCType || "",
            "Public_Id": req.Public_Id
          };
        });

        console.log(`[AUTO-FIRE DAEMON] Executing auto-export for Division ${divKey} (${mappedData.length} items)...`);
        await executeExportAS400(divKey, mappedData, 'AUTO_DAEMON');
      }
    }
  } catch (err) {
    console.error('[AUTO-FIRE DAEMON ERROR]:', err.message);
  } finally {
    isAutoFireDaemonRunning = false;
  }
}

// Poll every 15 seconds
setInterval(runAutoFireDaemon, 15000);

