const sql = require('mssql');
const { poolPromise, poolRequestIndirrecPromise } = require('../config/database');
const { EVENT_TYPES, resolveDivisionId } = require('../utils/notification.constants');
const { emitNotification } = require('./Notification.controller');
const SSEManager = require('../utils/SSEManager');

// --- Helper: Two-Way Division Mapping ---
// DB needs strings ('71DZ', '7122'), UI needs IDs ('2', '3')
const mapDivisionToDB = (div) => {
  const d = (div || '').toString().toUpperCase();
  if (d === '2' || d === 'PMC') return '71DZ';
  if (d === '3' || d === 'GM') return '7122';
  return div;
};

const mapDivisionToUI = (div) => {
  const d = (div || '').toString().toUpperCase();
  if (d === '71DZ' || d === 'PMC') return '2';
  if (d === '7122' || d === 'GM') return '3';
  return div;
};

/**
 * API: ดึงข้อมูล Division สำหรับ PC Plan
 * หน้าที่: ดึงข้อมูล Master ของแผนก (เช่น PMC, GM) เพื่อนำไปป้อนลงใน Dropdown เลือกแผนกหน้า PC Plan
 */
exports.getDivisions = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .execute('trans.Stored_Get_Dropdown_PC_Plan_Division');

    console.log(`[getDivisions] Sending ${result.recordset.length} divisions to frontend`);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error('Error getDivisions:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: ดึงข้อมูล Master Data รวมทั้งหมดตาม Division (Get Master Data By Division)
 * หน้าที่: ดึงข้อมูล Machines, Facilities, Processes และ PartNo
 * แบบรวดเดียว โดยอิงตาม Division ที่เลือก และรองรับ Mode ลดโหลด (FAST, SLOW, ALL)
 */
exports.getMasterDataByDivision = async (req, res) => {
  try {
    const divCode = req.params.divCode; // Now this is Division_Id
    const mode = req.query.mode || 'ALL'; // FAST, SLOW, ALL (Default)

    if (!divCode) {
      return res.status(400).send({ message: "Division is required." });
    }

    const pool = await poolPromise;
    console.log(`Fetching Master Data for Division_Id: ${divCode}, Mode: ${mode}...`);

    // Use updated SP: Stored_Get_Dropdown_PC_Plan_Data
    // Input: @Division_Id (INT), @Mode
    const result = await pool.request()
      .input('Division_Id', sql.Int, parseInt(divCode, 10))  // Now INT, not NVarChar
      .input('Mode', sql.NVarChar(10), mode)
      .execute('trans.Stored_Get_Dropdown_PC_Plan_Data');

    // Fetch Facility data specifically using Stored_Get_Dropdown_Facility_By_Division
    let profitCenter = '';
    if (divCode === '2') profitCenter = '71DZ'; // PMC -> 71DZ
    else if (divCode === '3') profitCenter = '7122'; // GM -> 7122
    else profitCenter = divCode;

    const facResult = await pool.request()
      .input('Profit_Center', sql.NVarChar(50), profitCenter)
      .execute('trans.Stored_Get_Dropdown_Facility_By_Division');

    let response = {};

    if (mode === 'FAST') {
      // Returns only Machine [0] from main SP, and facilities from facResult
      response = {
        machines: result.recordsets[0] || [],
        facilities: facResult.recordset || [],
        processes: [],
        partNos: [],
        partBefs: []
      };
    } else if (mode === 'SLOW') {
      // Returns Process [0] and PartNo [1] from main SP
      response = {
        machines: [],
        facilities: [],
        processes: result.recordsets[0] || [],
        partNos: result.recordsets[1] || [],
        partBefs: result.recordsets[1] || [] // Same as PartNo
      };
    } else {
      // ALL (Default) - Returns 4 sets order: MC, Fac(from main SP, skip), Process, PartNo
      // Instead of result.recordsets[1], we use facResult.recordset for facilities
      response = {
        machines: result.recordsets[0] || [],
        facilities: facResult.recordset || [],
        processes: result.recordsets[2] || [],
        partNos: result.recordsets[3] || [],
        partBefs: result.recordsets[3] || []
      };
    }

    res.status(200).json(response);

  } catch (err) {
    console.error('Error getMasterDataByDivision:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: นำเข้า/เพิ่มแผนงาน PC Plan ใหม่ (Insert/Import PC Plan)
 * หน้าที่: รับข้อมูลแบบ Array จากหน้าเว็บ (ดึงมาจากไฟล์ Excel หรือกด Add New) เพื่อทยอย Insert ลงฐานข้อมูล
 * และรองรับการจัดการ Revision ระบบแจ้งเตือน (Notification) แบบเปรียบเทียบ Before/After อัตโนมัติเวลาที่มีการแก้ไขแผน
 */
exports.insertPCPlan = async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).send({ message: "Data must be an array." });
    }

    if (items.length === 0) {
      return res.status(200).send({ message: "No items to process.", successCount: 0 });
    }

    const pool = await poolPromise;

    // 1. ตรวจสอบ Division จากไอเท็มแรก (สมมติว่ามาเป็น Batch เดียวกัน)
    // ตอนนี้ Frontend ส่ง Division_Id มา (2=PMC, 3=GM)
    const division = items[0].division || 'Unknown';

    // รองรับทั้ง Division_Id และค่าเก่า (Profit_Center/Name)
    const isPMC = (
      division === '2' ||                    // Division_Id for PMC
      division.toUpperCase() === 'PMC' ||
      division === '71DZ'
    );

    // ตรวจสอบ PlanDate เพื่อใช้ในการ Snapshot (สมมติว่าเป็นเดือนเดียวกันหมด)
    const sampleDate = items[0].date;
    const divisionCode = items[0].division || 'Unknown';
    console.log(`[insertPCPlan] Received Division: ${divisionCode}, Sample Date: ${sampleDate}`);

    // Generate Batch ID for tracing, but GroupId will be unique per item for TRUE revision tracking
    const dateObj = new Date();
    const yymmdd = dateObj.toISOString().slice(2, 10).replace(/-/g, '');
    const hhmm = dateObj.toTimeString().slice(0, 5).replace(/:/g, '');
    const batchId = `PLAN-${division}-${yymmdd}-${hhmm}`;

    console.log(`Processing Snapshot for Div: ${division}, Date: ${sampleDate}, BatchID: ${batchId}`);

    // 2. Lookup existing latest records for items with Unique_Id (for per-field diffing)
    let idMapping = {};
    const uniqueIds = items.map(i => (i.uniqueId || '').toString().replace(/^PLAN-/i, '').trim()).filter(Boolean);
    if (uniqueIds.length > 0) {
      try {
        const lookupRequest = pool.request();
        const placeholders = uniqueIds.map((id, i) => {
          const paramName = `uid${i}`;
          lookupRequest.input(paramName, sql.NVarChar, id);
          return `@${paramName}`;
        }).join(', ');

        const lookupResult = await lookupRequest.query(`
                    WITH LatestRev AS (
                        SELECT GroupId, MAX(Revision) as MaxRev
                        FROM [master].[tb_PC_Plan]
                        WHERE Unique_Id IN (${placeholders})
                        GROUP BY GroupId
                    )
                    SELECT m.Unique_Id, m.GroupId, m.Revision, m.PlanDate, m.MC_Type, m.Facility,
                           m.Bar_Type, m.Before_Part, m.Process, m.MC_No, m.PartNo, m.QTY, m.Time, m.Comment, m.PlanStatus
                    FROM [master].[tb_PC_Plan] m
                    JOIN LatestRev l ON m.GroupId = l.GroupId AND m.Revision = l.MaxRev
                `);
        lookupResult.recordset.forEach(row => {
          idMapping[row.Unique_Id.toLowerCase()] = row;
        });
      } catch (err) { console.error('[insertPCPlan] Unique_Id Lookup Error:', err.message); }
    }

    // Prepare JSON Data and track hits
    const jsonItems = items.map((item, index) => {
      let status = item.planStatus || 'Active';
      // If the user explicitly typed 'cancel' in the Excel comment, treat it as a cancellation
      if ((item.comment || '').trim().toLowerCase() === 'cancel') {
        status = 'Cancelled';
      }
      const rawUniqueId = (item.uniqueId || '')
        .toString()
        .replace(/^PLAN-/i, '')
        .trim() || null;

      let resolvedGroupId = item.groupId;
      let resolvedRevision = item.revision || 0;
      let hasActualChanges = false;
      let fieldChanges = [];

      if (rawUniqueId && idMapping[rawUniqueId.toLowerCase()]) {
        const existing = idMapping[rawUniqueId.toLowerCase()];
        resolvedGroupId = existing.GroupId;

        const normalize = (v) => (v === null || v === undefined) ? '' : String(v).trim();
        const formatDate = (v) => v ? new Date(v).toISOString().slice(0, 10) : '';

        const valMap = {
          'PlanDate': formatDate(item.date),
          'PartNo': normalize(item.partNo),
          'Before_Part': normalize(item.partBef || item.partBefore),
          'Process': normalize(item.process),
          'MC_Type': normalize(item.mcType),
          'Bar_Type': normalize(item.barType),
          'Facility': normalize(item.fac),
          'MC_No': normalize(item.mcNo),
          'QTY': String(parseFloat(item.qty) || 0),
          'Time': String(parseInt(item.time) || 0),
          'Comment': normalize(item.comment),
          'PlanStatus': normalize(status) // IMPORTANT: Include Status to detect Un-cancel/Re-activate
        };

        const oldMap = {
          'PlanDate': formatDate(existing.PlanDate),
          'PartNo': normalize(existing.PartNo),
          'Before_Part': normalize(existing.Before_Part),
          'Process': normalize(existing.Process),
          'MC_Type': normalize(existing.MC_Type),
          'Bar_Type': normalize(existing.Bar_Type),
          'Facility': normalize(existing.Facility),
          'MC_No': normalize(existing.MC_No),
          'QTY': String(parseFloat(existing.QTY) || 0),
          'Time': String(parseInt(existing.Time) || 0),
          'Comment': normalize(existing.Comment),
          'PlanStatus': normalize(existing.PlanStatus)
        };

        // --- STRICT LOCKOUT FOR CANCELLED ITEMS ---
        if (existing.PlanStatus === 'Cancelled') {
          console.log(`[insertPCPlan] Lockheed: ${rawUniqueId} is already Cancelled. Blocking further updates.`);
          item.isLocked = true;
          item.isActualEdit = false;
          resolvedRevision = existing.Revision;
        } else {
          for (const field in valMap) {
            if (valMap[field] !== oldMap[field]) {
              hasActualChanges = true;
              fieldChanges.push({ field, old: oldMap[field], new: valMap[field] });
            }
          }

          if (hasActualChanges) {
            resolvedRevision = existing.Revision + 1;
            item.isActualEdit = true;
            item.fieldChanges = fieldChanges;
          } else {
            // NO CHANGES -> Mark for filtering to prevent duplicates in DB
            resolvedRevision = existing.Revision;
            item.isActualEdit = false;
          }
        }
      } else {
        // Not found in mapping = NEW item (even if it has a rawUniqueId)
        item.isNew = true;
        if (!resolvedGroupId) {
          resolvedGroupId = `${batchId}-${index}-${Math.floor(Math.random() * 1000)}`;
        }
      }

      return {
        PlanDate: new Date(item.date),
        Employee_ID: item.employeeId || '',
        Division: mapDivisionToDB(division),
        MC_Type: item.mcType || '',
        Facility: item.fac || '',
        Before_Part: item.partBefore || item.partBef || '',
        Process: item.process || '',
        MC_No: item.mcNo || '',
        PartNo: item.partNo || '',
        Bar_Type: item.barType || null,
        QTY: parseFloat(item.qty) || 0,
        Time: parseInt(item.time) || 0,
        MC_QTY: parseFloat(item.mcQty) || 0,
        Comment: item.comment || '',
        PlanStatus: status,
        GroupId: resolvedGroupId,
        Revision: resolvedRevision,
        Path_Dwg: (item.pathDwg && item.pathDwg !== '-') ? item.pathDwg : null,
        Path_Layout: (item.pathLayout && item.pathLayout !== '-') ? item.pathLayout : null,
        Path_IIQC: (item.iiqc && item.iiqc !== '-') ? item.iiqc : null,
        Unique_Id: rawUniqueId,
        isActualEdit: item.isActualEdit,
        fieldChanges: item.fieldChanges,
        isNew: item.isNew || !rawUniqueId,
        isLocked: item.isLocked || false
      };
    });

    // --- PREVENT DUPLICATES & ENFORCE LOCKOUT ---
    // Only insert: 1. Brand new items OR 2. Items with changes AND NOT locked
    const filteredJsonItems = jsonItems.filter(ji => (ji.isNew || ji.isActualEdit) && !ji.isLocked);

    if (filteredJsonItems.length === 0) {
      console.log(`[insertPCPlan] Skip Save: No new items or valid changes detected (all identical or locked).`);
      return res.status(200).send({
        message: `No updates processed (Items may be identical or already Cancelled).`,
        successCount: items.length,
        batchId: batchId
      });
    }

    const jsonString = JSON.stringify(filteredJsonItems);
    console.log(`[insertPCPlan] Attempting DB Insert with ${filteredJsonItems.length} items...`);

    await pool.request()
      .input('JsonData', sql.NVarChar(sql.MAX), jsonString)
      .input('Division', sql.NVarChar(50), mapDivisionToDB(division))
      .input('TargetDate', sql.Date, new Date(sampleDate))
      .execute('trans.Stored_PCPlan_Insert_All_Snapshot_Excel');

    console.log(`[insertPCPlan] DB Insert Successful for ${division}. Processing status updates...`);

    // --- AUTO-PULL PATHS: DISABLED (Switched to manual path entry per user request) ---
    /*
    try {
      const fs   = require('fs');
      const path = require('path');
      const EN_PMC_ROOT = String.raw`\\pbgm06\D\PartEN PMC`;
      const DWG_KEYWORDS    = ['dwg', 'drawing', 'process'];
      const LAYOUT_KEYWORDS = ['layout', 'lay'];

      function classifyByPath(filePath) {
        const lower = filePath.toLowerCase();
        if (LAYOUT_KEYWORDS.some(k => lower.includes(k))) return 'layout';
        if (DWG_KEYWORDS.some(k => lower.includes(k)))    return 'dwg';
        return 'unknown';
      }

      function getSearchKeys(partNo) {
        const clean = (partNo || '').trim().toUpperCase();
        if (!clean) return [];

        const keys = new Set([clean]);
        const m = clean.match(/^([A-Z0-9]{5,7})/);
        if (m) keys.add(m[1]);

        const parts = clean.split(/[-_]/);
        if (parts[0]) keys.add(parts[0]);
        if (parts.length >= 2 && parts[0] && parts[1]) {
          keys.add(`${parts[0]}-${parts[1]}`);
          keys.add(`${parts[0]}_${parts[1]}`);
        }

        if (clean.startsWith('A5') || clean.startsWith('A6') || clean.startsWith('A9')) {
          const num = clean.substring(1, 5);
          keys.add(`AS-${num}`);
          keys.add(`AS${num}`);
        }
        if (clean.startsWith('T7') || clean.startsWith('T9')) {
          const num = clean.substring(1, 5);
          keys.add(`OT-${num}`);
          keys.add(`OT${num}`);
        }

        return Array.from(keys);
      }

      async function findPdfsAsync(dir, key, depth = 0) {
        if (depth > 5) return [];
        let results = [];
        try {
          const fsPromises = fs.promises;
          const entries = await fsPromises.readdir(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
              if (['OBSOLATE', 'OLD', 'NO USE'].some(s => e.name.toUpperCase().includes(s))) continue;
              const sub = await findPdfsAsync(full, key, depth + 1);
              results = results.concat(sub);
            } else if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
              const filename = e.name.toUpperCase();
              const fullUpper = full.toUpperCase();
              if (filename.includes(key.toUpperCase()) || fullUpper.includes(key.toUpperCase())) {
                results.push(full);
              }
            }
          }
        } catch (_) {}
        return results;
      }

      const uniquePartNos = [...new Set(filteredJsonItems.map(item => item.PartNo).filter(Boolean))];
      if (uniquePartNos.length > 0) {
        console.log(`[insertPCPlan] Synchronous auto-scanning for ${uniquePartNos.length} parts...`);
        let updateSql = '';
        let updateCount = 0;

        const pbpDwgRoot = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts`;
        const pbpLayRoot = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC`;

        for (const partNo of uniquePartNos) {
          const keys = getSearchKeys(partNo);
          let foundDwg    = null;
          let foundLayout = null;

          for (const k of keys) {
            if (foundDwg && foundLayout) break;

            let matched = await findPdfsAsync(EN_PMC_ROOT, k);
            matched.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
            for (const pdf of matched) {
              const type = classifyByPath(pdf);
              if (type === 'layout' && !foundLayout) foundLayout = pdf;
              if (type === 'dwg'    && !foundDwg)    foundDwg    = pdf;
            }

            if (!foundDwg) {
              const dwgMatched = await findPdfsAsync(pbpDwgRoot, k);
              dwgMatched.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
              for (const pdf of dwgMatched) {
                if (!foundDwg) foundDwg = pdf;
              }
            }

            if (!foundLayout) {
              const layMatched = await findPdfsAsync(pbpLayRoot, k);
              layMatched.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
              for (const pdf of layMatched) {
                if (!foundLayout) foundLayout = pdf;
              }
            }
          }

          const safePartNo   = partNo.replace(/'/g, "''");
          const safePathDwg  = (foundDwg    || '').replace(/'/g, "''");
          const safePathLay  = (foundLayout || '').replace(/'/g, "''");

          if (!safePathDwg && !safePathLay) continue;

          updateSql += `
            UPDATE [master].[tb_PC_Plan]
            SET Path_Dwg    = CASE WHEN (Path_Dwg IS NULL OR Path_Dwg = '' OR Path_Dwg = '-') AND '${safePathDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN '${safePathDwg}' ELSE Path_Dwg END,
                Path_Layout = CASE WHEN (Path_Layout IS NULL OR Path_Layout = '' OR Path_Layout = '-') AND '${safePathLay}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN '${safePathLay}' ELSE Path_Layout END,
                Path_Dwg_Source = CASE WHEN (Path_Dwg IS NULL OR Path_Dwg = '' OR Path_Dwg = '-') AND '${safePathDwg}' <> '' AND (Path_Dwg_Source IS NULL OR Path_Dwg_Source <> 'manual') THEN 'auto' ELSE Path_Dwg_Source END,
                Path_Layout_Source = CASE WHEN (Path_Layout IS NULL OR Path_Layout = '' OR Path_Layout = '-') AND '${safePathLay}' <> '' AND (Path_Layout_Source IS NULL OR Path_Layout_Source <> 'manual') THEN 'auto' ELSE Path_Layout_Source END
            WHERE PartNo = '${safePartNo}';
          `;
          updateCount++;

          if (updateCount % 20 === 0) {
            await pool.request().query(updateSql);
            updateSql = '';
          }
        }

        if (updateSql) {
          await pool.request().query(updateSql);
        }
        console.log(`[insertPCPlan] Synchronous auto-pulled EN paths for ${updateCount} parts.`);
      }
    } catch (pullErr) {
      console.error('[insertPCPlan] Synchronous auto-pull EN paths error:', pullErr.message);
    }
    */

    // --- CATEGORIZE HITS FOR NOTIFICATIONS ---
    const cancelHits = filteredJsonItems.filter(ji => ji.isActualEdit && ji.PlanStatus === 'Cancelled');
    const editHits = filteredJsonItems.filter(ji => ji.isActualEdit && ji.PlanStatus !== 'Cancelled');
    const newHits = filteredJsonItems.filter(ji => ji.isNew);

    // Update Status_To_PH and After_DueDate if changes occurred (Concurrent N+1 mitigation)
    const statusUpdatePromises = filteredJsonItems.map(async (ji) => {
      if (ji.Unique_Id) {
        try {
          let statusToPH = null;
          let targetAfterDueDate = null;

          if (ji.PlanStatus === 'Cancelled') {
            statusToPH = 'Cancelled';
          } else if (ji.isActualEdit) {
            statusToPH = 'PC Edit';
            // Trigger Date Sync: If PlanDate was among the changed fields, propagate it to After_DueDate
            const dateChange = (ji.fieldChanges || []).find(fc => fc.field === 'PlanDate');
            if (dateChange) {
              targetAfterDueDate = ji.PlanDate;
            }
          }

          if (statusToPH || targetAfterDueDate) {
            await pool.request()
              .input('Unique_Id', sql.NVarChar(100), ji.Unique_Id)
              .input('NewStatus', sql.NVarChar(50), statusToPH)
              .input('NewAfterDueDate', sql.Date, targetAfterDueDate)
              .execute('trans.Stored_UpdateStatusToPH');
          }
        } catch (phErr) { console.error('[Status_To_PH/Date] Error:', phErr.message); }
      }
    });

    await Promise.all(statusUpdatePromises);

    // === Notification Trigger (Batch-Aware) ===
    console.log(`[insertPCPlan] Starting Notification block. cancel:${cancelHits.length}, edit:${editHits.length}, new:${newHits.length}`);
    try {
      const userName = items[0]?.employeeId || 'PC User';
      const userRole = (req.user && req.user.Role) ? req.user.Role : 'PC';
      const divId = resolveDivisionId(items[0].division);
      const divisionName = divId === 2 ? 'PMC' : divId === 3 ? 'GM' : (items[0].division || 'PC');

      // 1. Handle Cancellations
      if (cancelHits.length > 0) {
        const first = cancelHits[0];
        const docNo = cancelHits.length === 1 ? first.GroupId : batchId;
        await emitNotification(req, pool, {
          eventType: EVENT_TYPES.CANCEL_PLAN,
          subject: cancelHits.length === 1 ? `⚫ [Cancelled] Plan Deleted: ${first.GroupId}` : `⚫ [Cancelled] ${cancelHits.length} Plans Deleted`,
          docNo: docNo, actionBy: userName, targetRoles: 'engineer,qc', ctaRoute: '/pc/plan-list', division: divisionName, divisionId: divId,
          detailsJson: {
            type: 'cancel',
            totalItems: cancelHits.length,
            groupIds: cancelHits.map(h => h.GroupId),
            items: cancelHits.map(h => ({
              PlanDate: h.PlanDate, PartNo: h.PartNo, MC_Type: h.MC_Type,
              Process: h.Process, MC_No: h.MC_No, QTY: h.QTY, Time: h.Time, Comment: h.Comment
            }))
          }
        });
      }

      // 2. Handle Revisions (Edits)
      if (editHits.length > 0) {
        if (editHits.length === 1) {
          const firstHit = editHits[0];

          // Use the perfectly computed field changes from earlier in the function
          // Filter out PlanStatus as it's not a standard editable field for the summary
          let changes = (firstHit.fieldChanges || []).filter(c => c.field !== 'PlanStatus');

          let subjectPrefix = 'Plan Revised';
          if (changes.length > 0) {
            const labelMap = { 'PlanDate': 'Date', 'MC_Type': 'MC Type', 'Bar_Type': 'Bar Type', 'Facility': 'Fac', 'Before_Part': 'Part Before', 'Process': 'Process', 'MC_No': 'MC No', 'PartNo': 'Part No' };
            const labels = changes.map(c => labelMap[c.field] || c.field);
            subjectPrefix = labels.length <= 2 ? `Edit ${labels.join(', ')}` : `Edit ${labels[0]} and ${labels.length - 1} others`;
          }
          await emitNotification(req, pool, {
            eventType: EVENT_TYPES.PLAN_REVISION,
            subject: `🔵 [FYI] ${subjectPrefix} - ${firstHit.PartNo || '-'}`,
            docNo: `${firstHit.GroupId}-Rev${firstHit.Revision}`, // UNIQUE: Prevents notification overwrite
            actionBy: userName, targetRoles: 'engineer,qc', ctaRoute: '/pc/plan-list', division: divisionName, divisionId: divId,
            // FIX: Pass computed changes + key fields so the frontend can render
            // the Changes Summary table and interpolate [Plan_Date]/[Part_No] in body text.
            detailsJson: {
              type: 'revision',
              changes: changes,
              PartNo: firstHit.PartNo,
              newValues: { PlanDate: firstHit.PlanDate, PartNo: firstHit.PartNo },
              divisionId: divId
            }
          });
        } else {
          await emitNotification(req, pool, {
            eventType: EVENT_TYPES.PLAN_REVISION,
            subject: `🔵 [FYI] Batch Edit: ${editHits.length} items updated`,
            docNo: batchId, actionBy: userName, targetRoles: 'engineer,qc', ctaRoute: '/pc/plan-list', division: divisionName, divisionId: divId,
            detailsJson: {
              type: 'revision',
              changes: [],
              count: editHits.length,
              divisionId: divId
            }
          });
        }
      }

      // 3. Handle New Plans
      if (newHits.length > 0) {
        const firstHit = newHits[0];
        await emitNotification(req, pool, {
          eventType: EVENT_TYPES.NEW_PLAN,
          subject: `🔵 [FYI] New Plan Imported: ${batchId}`,
          docNo: batchId, actionBy: userName, targetRoles: 'engineer,qc', ctaRoute: '/pc/plan-list', division: divisionName, divisionId: divId,
          detailsJson: {
            type: 'new_plan',
            PartNo: newHits.length === 1 ? firstHit.PartNo : 'Multiple',
            totalItems: newHits.length,
            // Store all GroupIds so we can track per-order path completion
            groupIds: newHits.map(h => h.GroupId),
            items: newHits.map(h => ({
              PlanDate: h.PlanDate,
              PartNo: h.PartNo,
              MC_Type: h.MC_Type,
              Process: h.Process,
              MC_No: h.MC_No,
              QTY: h.QTY,
              Time: h.Time,
              Comment: h.Comment,
              GroupId: h.GroupId
            }))
          }
        });
      }
    } catch (notifyErr) { console.error('Notification Error:', notifyErr); }

    SSEManager.broadcast({ type: 'PLANLIST_UPDATE' });

    return res.status(200).send({
      message: `Snapshot processed for ${division}. Success: ${items.length}`,
      successCount: items.length,
      batchId: batchId
    });

  } catch (err) {
    console.error('Error insertPCPlan:', err);
    res.status(500).send({ message: err.message });
  }
};



/**
 * API: ดึงรายการ PC Plan ทั้งหมด (Get PC Plan List)
 * หน้าที่: เรียกดูรายการแผนงาน PC Plan ทั้งหมดในระบบจากฐานข้อมูล รองรับพารามิเตอร์ showHistory เพื่อแยกดูตัวปัจจบัน หรือดูประวัติเก่า
 */
exports.getPlanList = async (req, res) => {
  try {
    const showHistory = req.query.showHistory === 'true'; // Check query param

    const pool = await poolPromise;
    const result = await pool.request()
      .input('ShowHistory', sql.Bit, showHistory ? 1 : 0)
      .execute('trans.Stored_PCPlan_Query');

    console.log(`[getPlanList] Rows fetched (History=${showHistory}):`, result.recordset.length); // DEBUG LOG

    // Reverse map the division codes for frontend UI compatibility
    const mappedResult = result.recordset.map(row => {
      return {
        ...row,
        Division: mapDivisionToUI(row.Division)
      };
    });

    res.status(200).json(mappedResult);
  } catch (err) {
    console.error('Error getPlanList:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: ดึงรายการ PC Plan สำหรับ PD Tab (Get PC Plan List for PD)
 * หน้าที่: เรียกดูรายการแผนงานพร้อม ReqStatus (Status จาก Request tables)
 *          เพื่อใช้ Drive การแสดง Lock icon บนปุ่ม REQUEST ใน PD tab
 *          ใช้ Stored_PCPlan_Query_PD ซึ่งเป็น SP ใหม่แยกต่างหาก ไม่กระทบ SP เดิม
 */
exports.getPlanListPD = async (req, res) => {
  try {
    const showHistory = req.query.showHistory === 'true';

    const pool = await poolPromise;
    const result = await pool.request()
      .input('ShowHistory', sql.Bit, showHistory ? 1 : 0)
      .execute('trans.Stored_PCPlan_Query_PD');

    console.log(`[getPlanListPD] Rows fetched (History=${showHistory}):`, result.recordset.length);

    const mappedResult = result.recordset.map(row => ({
      ...row,
      Division: mapDivisionToUI(row.Division)
    }));

    res.status(200).json(mappedResult);
  } catch (err) {
    console.error('Error getPlanListPD:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: ดึงรายการแบบ Server-Side Pagination (Paginated Plan List)
 * หน้าที่: รองรับ pagination + sub-tab filtering + dropdown filters
 * เรียก Stored_PCPlan_Query (สำหรับทุก dept) หรือ Stored_PCPlan_Query_PD (สำหรับ PD)
 * Query Params: page, pageSize, department, subTab, showHistory, filterDate, filterMachine, filterFac, filterProcess, filterPartNo, sortDir
 * Returns: { data: [...], pagination: { page, pageSize, totalCount, totalPages }, counts: { ... } }
 */
exports.getPlanListPaginated = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '100', 10);
    const department = (req.query.department || 'PC').trim();
    const subTab = (req.query.subTab || 'ALL').trim();
    const showHistory = req.query.showHistory === 'true';

    // Optional dropdown filters
    const filterDate = req.query.filterDate || null;
    const filterMachine = req.query.filterMachine || null;
    const filterFac = req.query.filterFac || null;
    const filterProcess = req.query.filterProcess || null;
    const filterPartNo = req.query.filterPartNo || null;
    const rawDivision = (req.query.filterDivision || '').trim();
    const filterDivision = (rawDivision && rawDivision.toLowerCase() !== 'all' && rawDivision.toLowerCase() !== 'null' && rawDivision.toLowerCase() !== 'undefined')
      ? rawDivision
      : null;
    const filterStatus = req.query.filterStatus || null;
    const sortDir = req.query.sortDir === 'ASC' ? 'ASC' : 'DESC';

    const pool = await poolPromise;

    // Cross-row path propagation disabled per requirement (EN paths must be manually attached by EN)
    /*
    try {
      await pool.request().query(`
        UPDATE target
        SET target.Path_Dwg = CASE WHEN (target.Path_Dwg IS NULL OR target.Path_Dwg = '' OR target.Path_Dwg = '-') AND src.Path_Dwg IS NOT NULL THEN src.Path_Dwg ELSE target.Path_Dwg END,
            target.Path_Layout = CASE WHEN (target.Path_Layout IS NULL OR target.Path_Layout = '' OR target.Path_Layout = '-') AND src.Path_Layout IS NOT NULL THEN src.Path_Layout ELSE target.Path_Layout END,
            target.Path_Dwg_Source = CASE WHEN (target.Path_Dwg IS NULL OR target.Path_Dwg = '' OR target.Path_Dwg = '-') AND src.Path_Dwg IS NOT NULL THEN 'auto' ELSE target.Path_Dwg_Source END,
            target.Path_Layout_Source = CASE WHEN (target.Path_Layout IS NULL OR target.Path_Layout = '' OR target.Path_Layout = '-') AND src.Path_Layout IS NOT NULL THEN 'auto' ELSE target.Path_Layout_Source END
        FROM [master].[tb_PC_Plan] target
        INNER JOIN (
            SELECT PartNo, 
                   MAX(CASE WHEN Path_Dwg IS NOT NULL AND Path_Dwg <> '' AND Path_Dwg <> '-' THEN Path_Dwg END) AS Path_Dwg,
                   MAX(CASE WHEN Path_Layout IS NOT NULL AND Path_Layout <> '' AND Path_Layout <> '-' THEN Path_Layout END) AS Path_Layout
            FROM [master].[tb_PC_Plan]
            WHERE (Path_Dwg IS NOT NULL AND Path_Dwg <> '' AND Path_Dwg <> '-')
               OR (Path_Layout IS NOT NULL AND Path_Layout <> '' AND Path_Layout <> '-')
            GROUP BY PartNo
        ) src ON target.PartNo = src.PartNo
        WHERE ((target.Path_Dwg IS NULL OR target.Path_Dwg = '' OR target.Path_Dwg = '-') AND src.Path_Dwg IS NOT NULL AND (target.Path_Dwg_Source IS NULL OR target.Path_Dwg_Source <> 'manual'))
           OR ((target.Path_Layout IS NULL OR target.Path_Layout = '' OR target.Path_Layout = '-') AND src.Path_Layout IS NOT NULL AND (target.Path_Layout_Source IS NULL OR target.Path_Layout_Source <> 'manual'));
      `);
    } catch (_) {}
    */

    const request = pool.request()
      .input('ShowHistory', sql.Bit, showHistory ? 1 : 0)
      .input('PageNumber', sql.Int, page)
      .input('PageSize', sql.Int, pageSize)
      .input('SubTab', sql.NVarChar(20), subTab)
      .input('FilterDate', sql.Date, filterDate || null)
      .input('FilterMachine', sql.NVarChar(sql.MAX), filterMachine || null)
      .input('FilterFac', sql.NVarChar(sql.MAX), filterFac || null)
      .input('FilterProcess', sql.NVarChar(sql.MAX), filterProcess || null)
      .input('FilterPartNo', sql.NVarChar(sql.MAX), filterPartNo || null)
      .input('FilterDivision', sql.NVarChar(50), filterDivision ? mapDivisionToDB(filterDivision) : null);

    let result;
    if (department === 'PD') {
      // FilterStatus is only supported by Stored_PCPlan_Query_PD
      request.input('FilterStatus', sql.NVarChar(sql.MAX), filterStatus || null);
      result = await request.execute('trans.Stored_PCPlan_Query_PD');
    } else {
      request.input('Department', sql.NVarChar(10), department);
      request.input('SortDir', sql.NVarChar(4), sortDir);
      result = await request.execute('trans.Stored_PCPlan_Query');
    }

    // Result Set 1: paginated rows
    let rows = (result.recordsets[0] || []).map(row => ({
      ...row,
      Division: mapDivisionToUI(row.Division),
      drawingSource: row.Path_Dwg_Source || null,
      layoutSource: row.Path_Layout_Source || null
    }));

    // Result Set 2: counts (TotalCount, UpcomingCount, RequiredCount, CompletedCount, ReturnCount)
    const countsRow = (result.recordsets[1] || [{}])[0] || {};
    const totalCount = countsRow.TotalCount || 0;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    console.log(`[getPlanListPaginated] dept=${department} subTab=${subTab} page=${page}/${totalPages} rows=${rows.length}/${totalCount}`);

    res.status(200).json({
      data: rows,
      pagination: { page, pageSize, totalCount, totalPages },
      counts: {
        upcoming: countsRow.UpcomingCount || 0,
        required: countsRow.RequiredCount || 0,
        completed: countsRow.CompletedCount || 0,
        return: countsRow.ReturnCount || 0
      }
    });
  } catch (err) {
    console.error('Error getPlanListPaginated:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: ลบข้อมูล PC Plan แบบลบบางตัวหรือ Soft Delete (Delete PC Plan)
 * หน้าที่: ลบข้อมูลรายการที่มี Plan_ID ตรงกัน เปลี่ยนสถานะในระบบให้ไม่แสดงผล (Soft Delete)
 */
exports.deletePCPlan = async (req, res) => {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).send({ message: "Plan ID is required." });
    }

    const pool = await poolPromise;
    await pool.request()
      .input('Plan_ID', sql.Int, id) // Correct Parameter Name
      .execute('trans.Stored_PCPlan_Delete'); // Correct SP for Hard Delete

    res.status(200).json({ message: "Deleted successfully", id: id });

  } catch (err) {
    console.error('Error deletePCPlan:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: ลบแผนงาน PC Plan ยกกลุ่ม (Delete PC Plan Group - All Revisions)
 * หน้าที่: ลบแผนงานใน GroupId เดียวกันแบบ Soft Delete (ลบประวัติ Revision ทั้งหมดของไอเทมนั้น) และส่ง Event แจ้งเตือนกระดานข่าว
 */
exports.deletePCPlanGroup = async (req, res) => {
  try {
    const groupId = req.params.groupId;

    if (!groupId) {
      return res.status(400).send({ message: "GroupId is required." });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('GroupId', sql.NVarChar(50), groupId)
      .execute('trans.Stored_PCPlan_Delete_Group');

    console.log(`[deletePCPlanGroup] GroupId: ${groupId}, Deleted Rows: ${result.rowsAffected[0]}`);

    // === Notification Trigger (V2) ===
    try {
      const { emitNotification } = require('./Notification.controller');
      const divId = groupId.includes('PLAN-2') ? 2 : groupId.includes('PLAN-3') ? 3 : null;
      await emitNotification(req, pool, {
        eventType: EVENT_TYPES.CANCEL_PLAN,
        subject: `⚫ [Cancelled] Plan Deleted/Cancelled: ${groupId}`,
        docNo: groupId,
        actionBy: req.headers['x-username'] || 'PC',
        targetRoles: 'engineer,qc',
        ctaRoute: '/pc/plan-list',
        division: divId === 2 ? 'PMC' : divId === 3 ? 'GM' : null,
        divisionId: divId,
        detailsJson: { divisionId: divId, docNo: groupId, editCount: 1 }
      });
    } catch (e) { console.error('Notify Error:', e); }

    SSEManager.broadcast({ type: 'PLANLIST_UPDATE' });

    res.status(200).json({
      message: "Group deleted successfully",
      groupId: groupId,
      deletedCount: result.rowsAffected[0]
    });

  } catch (err) {
    console.error('Error deletePCPlanGroup:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: ดึงประวัติการแก้ไข PC Plan ตาม GroupId (Get Plan History)
 * หน้าที่: ดึงข้อมูลรายการแผนงานเก่า (Revision เก่าๆ) ของไอเทมที่อยู่ใน GroupId นั้นมาแสดงให้ผู้ใช้ดูประวัติย้อนหลังได้
 */
exports.getPlanHistory = async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!groupId) return res.status(400).send({ message: "GroupId is required" });

    const pool = await poolPromise;
    const result = await pool.request()
      .input('GroupId', sql.NVarChar, groupId)
      .execute('trans.Stored_PCPlan_GetHistory');

    // Reverse map the division codes for frontend UI compatibility
    const mappedResult = result.recordset.map(row => {
      return {
        ...row,
        Division: mapDivisionToUI(row.Division)
      };
    });

    res.status(200).json(mappedResult);
  } catch (err) {
    console.error('Error getPlanHistory:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: อัปเดตเฉพาะเส้นทางไฟล์แนบ (Update Paths Only)
 * หน้าที่: อัปเดตลิงก์พาทของไฟล์เอกสารต่างๆ (Drawing, Layout, IIQC Table) แบบ In-place โดยไม่เปลี่ยน Revision
 * Status is live-resolved when the user expands the original NEW_PLAN notification.
 */
exports.updatePaths = async (req, res) => {
  try {
    let { groupId, planId, pathDwg, pathLayout, iiqc, pathDwgSource, pathLayoutSource, revision, mcQty, pathDwgRev, pathLayoutRev } = req.body;

    if (!groupId && !planId) return res.status(400).send({ message: "GroupId or planId is required" });

    const pool = await poolPromise;
    const request = pool.request();
    let updates = [];

    if (groupId) request.input('GroupId', sql.NVarChar, groupId);
    if (planId) request.input('PlanId', sql.Int, planId);

    // Find PartNo for this GroupId / PlanId so we can propagate manual status if cleared
    let targetPartNo = null;
    try {
      if (groupId) {
        const pRes = await pool.request().input('GId', sql.NVarChar, groupId)
          .query("SELECT TOP 1 PartNo FROM [master].[tb_PC_Plan] WHERE GroupId = @GId");
        if (pRes.recordset.length > 0) targetPartNo = pRes.recordset[0].PartNo;
      } else if (planId) {
        const pRes = await pool.request().input('PId', sql.Int, planId)
          .query("SELECT TOP 1 PartNo FROM [master].[tb_PC_Plan] WHERE Plan_ID = @PId");
        if (pRes.recordset.length > 0) targetPartNo = pRes.recordset[0].PartNo;
      }
    } catch (_) { }

    // Strip accidental quotes from path strings
    if (pathDwg !== undefined && typeof pathDwg === 'string') {
      pathDwg = pathDwg.trim().replace(/^"(.*)"$/, '$1');
    }
    if (pathLayout !== undefined && typeof pathLayout === 'string') {
      pathLayout = pathLayout.trim().replace(/^"(.*)"$/, '$1');
    }

    // 1. Path_Dwg & Path_Dwg_Source
    let dwgIsManualCleared = false;
    if (pathDwg !== undefined) {
      const isCleared = !pathDwg || pathDwg.trim() === '' || pathDwg.trim() === '-';
      const val = isCleared ? '-' : pathDwg.trim();
      const sourceVal = isCleared ? 'manual' : (pathDwgSource ? pathDwgSource.trim() : 'manual');
      if (isCleared) dwgIsManualCleared = true;

      request.input('Path_Dwg', sql.NVarChar, val);
      request.input('Path_Dwg_Source', sql.NVarChar(50), sourceVal);
      updates.push("Path_Dwg = @Path_Dwg", "Path_Dwg_Source = @Path_Dwg_Source");
    }

    // 2. Path_Layout & Path_Layout_Source
    let layoutIsManualCleared = false;
    if (pathLayout !== undefined) {
      const isCleared = !pathLayout || pathLayout.trim() === '' || pathLayout.trim() === '-';
      const val = isCleared ? '-' : pathLayout.trim();
      const sourceVal = isCleared ? 'manual' : (pathLayoutSource ? pathLayoutSource.trim() : 'manual');
      if (isCleared) layoutIsManualCleared = true;

      request.input('Path_Layout', sql.NVarChar, val);
      request.input('Path_Layout_Source', sql.NVarChar(50), sourceVal);
      updates.push("Path_Layout = @Path_Layout", "Path_Layout_Source = @Path_Layout_Source");
    }

    // 3. Path_IIQC
    if (iiqc !== undefined) {
      const isCleared = !iiqc || iiqc.trim() === '' || iiqc.trim() === '-';
      const val = isCleared ? '-' : iiqc.trim();
      request.input('Path_IIQC', sql.NVarChar, val);
      updates.push("Path_IIQC = @Path_IIQC");
    }

    // 4. Path_Dwg_Rev & Path_Layout_Rev (Separate manual document revisions)
    if (pathDwgRev !== undefined) {
      const isCleared = pathDwgRev === null || String(pathDwgRev).trim() === '' || String(pathDwgRev).trim() === '-';
      const val = isCleared ? null : String(pathDwgRev).trim();
      request.input('Path_Dwg_Rev', sql.NVarChar(50), val);
      updates.push("Path_Dwg_Rev = @Path_Dwg_Rev");
    }
    if (pathLayoutRev !== undefined) {
      const isCleared = pathLayoutRev === null || String(pathLayoutRev).trim() === '' || String(pathLayoutRev).trim() === '-';
      const val = isCleared ? null : String(pathLayoutRev).trim();
      request.input('Path_Layout_Rev', sql.NVarChar(50), val);
      updates.push("Path_Layout_Rev = @Path_Layout_Rev");
    }

    // 5. MC_QTY (Save to [master].[tb_PC_Plan].[MC_QTY])
    if (mcQty !== undefined && mcQty !== null && !isNaN(Number(mcQty))) {
      request.input('McQtyVal', sql.Float, parseFloat(mcQty));
      updates.push("MC_QTY = @McQtyVal");
    }

    if (updates.length === 0) {
      return res.status(200).json({ message: "No path updates provided", affectedRows: 0 });
    }

    const hasValidGroupId = groupId && String(groupId).trim() !== '' && String(groupId).trim() !== '-';
    const whereClause = hasValidGroupId ? "GroupId = @GroupId" : "Plan_ID = @PlanId";

    const sqlQuery = `
      UPDATE [master].[tb_PC_Plan]
      SET ${updates.join(', ')}
      WHERE ${whereClause}
        AND IsActive = 1
        AND Revision = (
            SELECT MAX(Revision)
            FROM [master].[tb_PC_Plan]
            WHERE ${whereClause} AND IsActive = 1
        );
    `;

    const result = await request.query(sqlQuery);
    const affectedRows = result.rowsAffected[0] || 0;
    console.log(`[updatePaths] ${whereClause}, Updates: ${updates.join(', ')}, Affected Rows: ${affectedRows}`);

    if (affectedRows > 0) {
      SSEManager.broadcast({ type: 'PLANLIST_UPDATE' });
    }

    res.status(200).json({
      message: affectedRows > 0 ? "Paths updated successfully" : "No records satisfied update criteria",
      affectedRows: affectedRows
    });
  } catch (err) {
    console.error('Error updatePaths:', err);
    res.status(500).send({ message: err.message });
  }
};

// ====================================================================
// NEW: Cancel Plan + Auto-Create Return to Store Entry
// POST /api/pc-plan/cancel-with-return
// Body: { plan: { ... item fields ... }, cancelledBy: 'Employee Name' }
// ====================================================================
exports.cancelWithReturn = async (req, res) => {
  const { plan, cancelledBy } = req.body;

  if (!plan) return res.status(400).json({ message: 'plan data is required' });

  try {
    const pool = await poolPromise;

    // ── Step 1: Cancel the plan (create new Cancelled revision) ──
    const divisionCode = mapDivisionToDB(plan.division || plan.divisionCode || '');
    const dateISO = plan.dateISO || null;

    await pool.request()
      .input('date', sql.NVarChar, dateISO)
      .input('employeeId', sql.NVarChar, String(plan.empId || plan.employeeId || ''))
      .input('division', sql.NVarChar, divisionCode)
      .input('mcType', sql.NVarChar, plan.mcType || '')
      .input('barType', sql.NVarChar, plan.barType || '')
      .input('fac', sql.NVarChar, plan.fac || '')
      .input('partBefore', sql.NVarChar, plan.partBefore || '')
      .input('mcNo', sql.NVarChar, plan.mcNo || '')
      .input('partNo', sql.NVarChar, plan.partNo || '')
      .input('process', sql.NVarChar, plan.process || '')
      .input('qty', sql.Int, parseInt(plan.qty) || 0)
      .input('time', sql.NVarChar, String(plan.time || ''))
      .input('comment', sql.NVarChar, plan.comment || '')
      .input('pathDwg', sql.NVarChar, plan.pathDwg || '')
      .input('pathLayout', sql.NVarChar, plan.pathLayout || '')
      .input('iiqc', sql.NVarChar, plan.iiqc || '')
      .input('groupId', sql.NVarChar, plan.groupId || '')
      .input('revision', sql.Int, (parseInt(plan.revision) || 0) + 1)
      .input('planStatus', sql.NVarChar, 'Cancelled')
      .input('uniqueId', sql.NVarChar, plan.uniqueId || null)
      .execute('trans.Stored_PCPlan_Insert');

    // ── Step 2: Auto-create Return to Store entry ──
    // Generate Doc No: RET-CANCEL-<groupId>-<timestamp>
    const nowTs = Date.now();
    const autoDocNo = `RET-CANCEL-${(plan.groupId || 'AUTO').replace('PLAN-', '')}-${nowTs.toString().slice(-6)}`;
    const divisionName = divisionCode === '71DZ' ? 'PMC (71DZ)' : divisionCode === '7122' ? 'GM (7122)' : (plan.division || '');

    await pool.request()
      .input('Doc_No', sql.NVarChar, autoDocNo)
      .input('Employee_ID', sql.NVarChar, String(plan.empId || plan.employeeId || ''))
      .input('Return_By', sql.NVarChar, cancelledBy || 'PC')
      .input('Division', sql.NVarChar, divisionName)
      .input('Process', sql.NVarChar, plan.process || '')
      .input('Facility', sql.NVarChar, plan.fac || '')
      .input('Phone_No', sql.NVarChar, '')
      .input('ItemNo', sql.NVarChar, '')
      .input('PartNo', sql.NVarChar, plan.partNo || '')
      .input('ItemName', sql.NVarChar, `Auto-return from cancelled plan (${plan.mcType || ''})`)
      .input('Spec', sql.NVarChar, `Part Before: ${plan.partBefore || '-'} | MC No: ${plan.mcNo || '-'}`)
      .input('QTY', sql.Int, parseInt(plan.qty) || 1)
      .input('Used_Qty', sql.Int, 0)
      .input('Remark', sql.NVarChar, `ยกเลิกแผนงาน Group: ${plan.groupId || ''} Rev: ${plan.revision || 0}`)
      .execute('trans.Stored_Save_Return_Request');

    // ── Step 3: Notify PD (production) ──
    try {
      const { emitNotification } = require('./Notification.controller');
      const planDate = plan.date || dateISO || '';
      const groupId = plan.groupId || '';

      const divId = resolveDivisionId(plan.division || plan.divisionCode || null);
      await emitNotification(req, pool, {
        eventType: 'PLAN_CANCELLED_WITH_RETURN',
        subject: `🔴 [Action Required] แผนงานถูกยกเลิก – ต้องนำ Tooling คืน: ${autoDocNo}`,
        docNo: autoDocNo,
        actionBy: cancelledBy || 'PC',
        targetRoles: 'production',
        ctaRoute: '/pc/plan-list',
        division: divisionName,
        divisionId: divId,
        detailsJson: { divisionId: divId, divisionName, docNo: autoDocNo, editCount: 1 }
      });
    } catch (notifErr) {
      console.error('Notification Error (cancelWithReturn):', notifErr);
    }

    SSEManager.broadcast({ type: 'PLANLIST_UPDATE' });

    res.status(200).json({
      message: 'Plan cancelled and Return-to-Store entry created successfully.',
      returnDocNo: autoDocNo
    });

  } catch (err) {
    console.error('Error cancelWithReturn:', err);
    res.status(500).send({ message: err.message });
  }
};

// ====================================================================
// NEW: Check Complete Status for a batch of Unique_Ids (for Excel Validation)
// POST /api/pc-plan/check-complete-status
// Body: { uniqueIds: ["PLAN-xxx", "PLAN-yyy", ...] }
// Returns: [{ uniqueId, isComplete: true|false }]
// ====================================================================
exports.checkCompleteStatus = async (req, res) => {
  const { uniqueIds } = req.body;

  if (!uniqueIds || !Array.isArray(uniqueIds) || uniqueIds.length === 0) {
    return res.status(200).json([]); // No IDs to check → nothing is complete
  }

  try {
    const pool = await poolPromise;

    // Strip PLAN- prefix for DB lookup (Unique_Id stored as UNIQUEIDENTIFIER without prefix)
    const cleanIds = uniqueIds
      .map(id => (id || '').toString().replace(/^PLAN-/i, '').trim())
      .filter(id => id.length > 0);

    if (cleanIds.length === 0) return res.status(200).json([]);

    // Build a JSON array string for SQL OPENJSON
    const jsonParam = JSON.stringify(cleanIds.map(id => ({ id })));

    const result = await pool.request()
      .input('JsonIds', sql.NVarChar(sql.MAX), jsonParam)
      .query(`
                DECLARE @Ids TABLE (Unique_Id NVARCHAR(36));
                INSERT INTO @Ids (Unique_Id)
                SELECT [value] FROM OPENJSON(@JsonIds) WITH ([value] NVARCHAR(36) '$.id');

                SELECT
                    CAST(p.Unique_Id AS NVARCHAR(36)) AS uniqueId,
                    p.PlanDate,
                    p.MC_Type,
                    p.Facility,
                    p.Before_Part,
                    p.Process,
                    p.MC_No,
                    p.PartNo,
                    p.Bar_Type,
                    p.QTY,
                    p.[Time],
                    p.Comment,
                    p.Revision,
                    p.GroupId,
                    (
                        SELECT COUNT(*) FROM [db_Tooling].[dbo].[tb_IssueCuttingTool_Request_Document] ct WHERE ct.Unique_Id = p.Unique_Id
                    ) + (
                        SELECT COUNT(*) FROM [db_Tooling].[dbo].[tb_IssueSetupTool_Request_Document] st WHERE st.Unique_Id = p.Unique_Id
                    ) as TotalRequests,
                    (
                        SELECT COUNT(*) FROM [db_Tooling].[dbo].[tb_IssueCuttingTool_Request_Document] ct WHERE ct.Unique_Id = p.Unique_Id AND ct.[Status] IN ('Complete', 'Completed')
                    ) + (
                        SELECT COUNT(*) FROM [db_Tooling].[dbo].[tb_IssueSetupTool_Request_Document] st WHERE st.Unique_Id = p.Unique_Id AND st.[Status] IN ('Complete', 'Completed')
                    ) as CompleteRequests,
                    (
                        SELECT COUNT(*) FROM [db_Tooling].[dbo].[tb_IssueCuttingTool_Request_Document] ct WHERE ct.Unique_Id = p.Unique_Id AND ct.[Status] IN ('Waiting', 'In Progress')
                    ) + (
                        SELECT COUNT(*) FROM [db_Tooling].[dbo].[tb_IssueSetupTool_Request_Document] st WHERE st.Unique_Id = p.Unique_Id AND st.[Status] IN ('Waiting', 'In Progress')
                    ) as WaitingRequests
                FROM [master].[tb_PC_Plan] p
                INNER JOIN @Ids i ON CAST(p.Unique_Id AS NVARCHAR(36)) = i.Unique_Id
                WHERE p.IsActive = 1;
            `);

    const response = result.recordset.map(r => {
      const total = r.TotalRequests || 0;
      const complete = r.CompleteRequests || 0;
      const waiting = r.WaitingRequests || 0;

      return {
        uniqueId: `PLAN-${r.uniqueId}`, // Re-add PLAN- prefix to match frontend format
        hasComplete: complete > 0,
        hasWaiting: waiting > 0,
        allComplete: total > 0 && complete === total,
        // Extra info for comparison
        PlanDate: r.PlanDate,
        MC_Type: r.MC_Type,
        Facility: r.Facility,
        Before_Part: r.Before_Part,
        Process: r.Process,
        MC_No: r.MC_No,
        PartNo: r.PartNo,
        Bar_Type: r.Bar_Type,
        QTY: r.QTY,
        Time: r.Time,
        Comment: r.Comment,
        Revision: r.Revision,
        GroupId: r.GroupId
      };
    });

    res.status(200).json(response);

  } catch (err) {
    console.error('Error checkCompleteStatus:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: Export PC Plan History by Month + Year
 * ใช้ SP Stored_Export_PC_Plan_History กรองข้อมูลจาก tb_PC_Plan ตามเดือนและปีที่ระบุ
 */
exports.exportHistory = async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);

    if (!month || !year || month < 1 || month > 12 || year < 2000) {
      return res.status(400).send({ message: 'Valid month (1-12) and year are required.' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('TargetMonth', sql.Int, month)
      .input('TargetYear', sql.Int, year)
      .execute('trans.Stored_Export_PC_Plan_History');

    console.log(`[exportHistory] Month=${month}, Year=${year} → ${result.recordset.length} rows`);
    res.status(200).json(result.recordset);

  } catch (err) {
    console.error('Error exportHistory:', err);
    res.status(500).send({ message: err.message });
  }
};

/**
 * API: Mark items as Completed for EN department
 * POST /api/pc-plan/mark-en-completed
 * Body: { planIds: [1635, 1636], uniqueIds: ['xxx', 'yyy'] }
 */
exports.markEnCompleted = async (req, res) => {
  try {
    const { planIds, uniqueIds } = req.body;

    if ((!planIds || planIds.length === 0) && (!uniqueIds || uniqueIds.length === 0)) {
      return res.status(400).json({ message: 'planIds or uniqueIds required' });
    }

    const pool = await poolPromise;
    const request = pool.request();

    let whereClause = [];
    if (planIds && Array.isArray(planIds) && planIds.length > 0) {
      const validPlanIds = planIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (validPlanIds.length > 0) {
        whereClause.push(`Plan_ID IN (${validPlanIds.join(',')})`);
      }
    }
    if (uniqueIds && Array.isArray(uniqueIds) && uniqueIds.length > 0) {
      const cleanUnique = uniqueIds.map(u => (u || '').replace(/^PLAN-/i, '').trim()).filter(Boolean);
      if (cleanUnique.length > 0) {
        whereClause.push(`Unique_Id IN (${cleanUnique.map(u => `'${u}'`).join(',')})`);
      }
    }

    if (whereClause.length === 0) {
      return res.status(400).json({ message: 'No valid IDs provided' });
    }

    const SSEManager = require('../utils/SSEManager');
    SSEManager.broadcast({ type: 'PLANLIST_UPDATE' });

    res.status(200).json({ success: true, count: 0 });

  } catch (err) {
    console.error('Error markEnCompleted:', err);
    res.status(500).json({ message: err.message });
  }
};

