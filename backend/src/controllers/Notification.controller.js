const sql = require('mssql');
const { poolPromise } = require('../config/database');

// Helper: extract Username from request header (set by frontend via x-username)
const getUsername = (req) => {
  const raw = req.headers['x-username'];
  if (!raw || raw.trim() === '') {
    console.warn('[Notification] x-username header missing or empty.');
    return null;
  }
  return raw.trim();
};

// 1. Get Notifications (Inbox) - role + per-user state
exports.getNotifications = async (req, res) => {
  try {
    const role = req.query.role || null;
    const username = getUsername(req);

    // Security: Prevent browser caching to avoid ghost data (Enforced)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const pool = await poolPromise;
    const result = await pool.request()
      .input('Role', sql.NVarChar(50), role)
      .input('Is_Trash', sql.Bit, 0)
      .input('Username', sql.NVarChar(100), username)
      .execute('trans.Stored_Get_Notification_Log');

    // --- Post-SP Role Filtering (Safety Net) ---
    // Ensures notifications with specific Target_Roles (e.g. 'engineer,eng,en,qc')
    // are NOT shown to users with non-matching roles (e.g. 'pd', 'ph', 'gauge')
    let filtered = result.recordset;
    if (role) {
      const userRole = role.toLowerCase().trim();
      // Build set of all aliases for the user's role
      const roleAliases = new Set([userRole]);
      if (userRole === 'ph' || userRole === 'purchase') { roleAliases.add('ph'); roleAliases.add('purchase'); }
      if (userRole === 'pd' || userRole === 'production') { roleAliases.add('pd'); roleAliases.add('production'); }
      if (userRole === 'engineer' || userRole === 'eng' || userRole === 'en') { roleAliases.add('engineer'); roleAliases.add('eng'); roleAliases.add('en'); }
      if (userRole === 'qc' || userRole === 'quality' || userRole === 'quality control') { roleAliases.add('qc'); roleAliases.add('quality'); roleAliases.add('quality control'); }
      if (userRole === 'gauge' || userRole === 'gague') { roleAliases.add('gauge'); roleAliases.add('gague'); }
      if (userRole === 'pc' || userRole === 'planner' || userRole === 'production control') { roleAliases.add('pc'); roleAliases.add('planner'); roleAliases.add('production control'); }

      filtered = result.recordset.filter(n => {
        const target = (n.Target_Roles || 'ALL').toUpperCase();
        if (target === 'ALL') return true; // ALL = everyone sees it
        // Check if any of the user's role aliases appear in the target roles
        const targetParts = target.toLowerCase().split(',').map(r => r.trim());
        return targetParts.some(tp => roleAliases.has(tp)) || userRole === 'admin';
      });
    }

    res.status(200).json(filtered);
  } catch (err) {
    console.error('Error getNotifications:', err);
    res.status(500).send({ message: err.message });
  }
};

// 2. Mark as Read (per user)
exports.markAsRead = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).send({ message: 'Notification ID is required' });
    const username = getUsername(req);
    const pool = await poolPromise;
    await pool.request()
      .input('Action', sql.NVarChar(50), 'READ')
      .input('Username', sql.NVarChar(100), username)
      .input('Notification_ID', sql.Int, id)
      .execute('trans.Stored_Update_Notification_Status');
    res.status(200).send({ message: 'Notification marked as read', id });
  } catch (err) {
    console.error('Error markAsRead:', err);
    res.status(500).send({ message: err.message });
  }
};

// 3. Mark All as Read (per user)
exports.markAllRead = async (req, res) => {
  try {
    const username = getUsername(req);
    const pool = await poolPromise;
    const result = await pool.request()
      .input('Action', sql.NVarChar(50), 'MARK_ALL_READ')
      .input('Username', sql.NVarChar(100), username)
      .input('Notification_ID', sql.Int, null)
      .execute('trans.Stored_Update_Notification_Status');
    const updatedCount = result.recordset[0]?.UpdatedCount || 0;
    res.status(200).send({ message: 'All notifications marked as read', updatedCount });
  } catch (err) {
    console.error('Error markAllRead:', err);
    res.status(500).send({ message: err.message });
  }
};

// 4. Get Trash Notifications (per user)
exports.getTrashNotifications = async (req, res) => {
  try {
    const role = req.query.role || null;
    const username = getUsername(req);

    // Security: Prevent browser caching to avoid ghost data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const pool = await poolPromise;
    const result = await pool.request()
      .input('Role', sql.NVarChar(50), role)
      .input('Is_Trash', sql.Bit, 1)
      .input('Username', sql.NVarChar(100), username)
      .execute('trans.Stored_Get_Notification_Log');

    // --- Post-SP Role Filtering (Safety Net) ---
    let filtered = result.recordset;
    if (role) {
      const userRole = role.toLowerCase().trim();
      const roleAliases = new Set([userRole]);
      if (userRole === 'ph' || userRole === 'purchase') { roleAliases.add('ph'); roleAliases.add('purchase'); }
      if (userRole === 'pd' || userRole === 'production') { roleAliases.add('pd'); roleAliases.add('production'); }
      if (userRole === 'engineer' || userRole === 'eng' || userRole === 'en') { roleAliases.add('engineer'); roleAliases.add('eng'); roleAliases.add('en'); }
      if (userRole === 'qc' || userRole === 'quality' || userRole === 'quality control') { roleAliases.add('qc'); roleAliases.add('quality'); roleAliases.add('quality control'); }
      if (userRole === 'gauge' || userRole === 'gague') { roleAliases.add('gauge'); roleAliases.add('gague'); }
      if (userRole === 'pc' || userRole === 'planner' || userRole === 'production control') { roleAliases.add('pc'); roleAliases.add('planner'); roleAliases.add('production control'); }

      filtered = result.recordset.filter(n => {
        const target = (n.Target_Roles || 'ALL').toUpperCase();
        if (target === 'ALL') return true;
        const targetParts = target.toLowerCase().split(',').map(r => r.trim());
        return targetParts.some(tp => roleAliases.has(tp)) || userRole === 'admin';
      });
    }

    res.status(200).json(filtered);
  } catch (err) {
    console.error('Error getTrashNotifications:', err);
    res.status(500).send({ message: err.message });
  }
};

// 5. Soft-Delete All Read Notifications (per user)
exports.deleteReadNotifications = async (req, res) => {
  try {
    const username = getUsername(req);
    const pool = await poolPromise;
    const result = await pool.request()
      .input('Action', sql.NVarChar(50), 'DELETE_READ')
      .input('Username', sql.NVarChar(100), username)
      .input('Notification_ID', sql.Int, null)
      .execute('trans.Stored_Update_Notification_Status');
    const affectedRows = result.recordset[0]?.AffectedRows || 0;
    res.status(200).send({ message: 'Read notifications moved to trash', deletedCount: affectedRows });
  } catch (err) {
    console.error('Error deleteReadNotifications:', err);
    res.status(500).send({ message: err.message });
  }
};

// 5b. Soft-Delete Specific Notification IDs (per user) — targets ONLY selected items
// FIX: Old code called DELETE_READ which trashed ALL read notifications.
//      Now we directly set Is_Deleted=1 for ONLY the selected IDs.
exports.deleteByIds = async (req, res) => {
  try {
    const username = getUsername(req);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).send({ message: 'ids array is required' });
    }

    const pool = await poolPromise;

    // Use Promise.all to map database I/O concurrently rather than awaiting sequentially
    const deletePromises = ids.map(async (id) => {
      // Step 1: Ensure user state row exists and mark as read
      await pool.request()
        .input('Action', sql.NVarChar(50), 'READ')
        .input('Username', sql.NVarChar(100), username)
        .input('Notification_ID', sql.Int, id)
        .execute('trans.Stored_Update_Notification_Status');

      // Step 2: Trash ONLY this specific ID (direct SQL, not the blanket DELETE_READ)
      await pool.request()
        .input('Username', sql.NVarChar(100), username)
        .input('Notification_ID', sql.Int, id)
        .query(`
          UPDATE [master].[tb_Notification_User_State]
          SET Is_Deleted = 1, Deleted_At = GETDATE()
          WHERE Notification_ID = @Notification_ID
            AND Username = @Username
        `);
    });

    await Promise.all(deletePromises);

    res.status(200).send({ message: `Moved ${ids.length} notification(s) to trash`, deletedCount: ids.length });
  } catch (err) {
    console.error('Error deleteByIds:', err);
    res.status(500).send({ message: err.message });
  }
};

// 6. Restore a Notification from Trash (per user)
exports.restoreNotification = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).send({ message: 'Notification ID is required' });
    const username = getUsername(req);
    const pool = await poolPromise;
    await pool.request()
      .input('Action', sql.NVarChar(50), 'RESTORE')
      .input('Username', sql.NVarChar(100), username)
      .input('Notification_ID', sql.Int, id)
      .execute('trans.Stored_Update_Notification_Status');
    res.status(200).send({ message: 'Notification restored', id });
  } catch (err) {
    console.error('Error restoreNotification:', err);
    res.status(500).send({ message: err.message });
  }
};

// --------------------------------------------------------------------------------------------------------------------
// Auto-Purge Scheduler: runs every hour,
// permanently deletes trash older than 3 days
// --------------------------------------------------------------------------------------------------------------------
(async () => {
  const runPurge = async () => {
    try {
      const pool = await poolPromise;

      // 1. Permanently purge old trashed user states
      const purgeResult = await pool.request()
        .input('Action', sql.NVarChar(50), 'PURGE_OLD')
        .input('Notification_ID', sql.Int, null)
        .execute('trans.Stored_Update_Notification_Status');
      const purgedCount = purgeResult?.recordset?.[0]?.PurgedCount || 0;
      if (purgedCount > 0) {
        console.log(`[Notification Auto-Purge] Permanently deleted ${purgedCount} old trash items.`);
      }

      // 2. Globally wipe broadcast payloads older than 33 days to protect DB Capacity
      await pool.request()
        .input('Action', sql.NVarChar(50), 'PURGE_OLD_LOGS')
        .input('Notification_ID', sql.Int, null)
        .execute('trans.Stored_Update_Notification_Status');
    } catch (err) {
      console.error('[Notification Auto-Purge] Error:', err);
    }
  };

  const checkDueDateAlerts = async () => {
    try {
      const pool = await poolPromise;

      const result = await pool.request().query(`
        SELECT OriginalID, SourceTable, DocNo, Requester, DueDate, Public_Id, Status, Division
        FROM [db_Tooling].[viewer].[View_CaseSetup_Request]
        WHERE Status NOT IN ('Complete', 'CompletetoExcel', 'Cancelled')
          AND DueDate IS NOT NULL
      `);

      const pendingRequests = result.recordset || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const reqRow of pendingRequests) {
        const dueDate = new Date(reqRow.DueDate);
        dueDate.setHours(0, 0, 0, 0);

        const alertDate = new Date(reqRow.DueDate);
        alertDate.setDate(alertDate.getDate() - 2);
        alertDate.setHours(0, 0, 0, 0);

        // If today is equal to or past alertDate, but before/equal to DueDate
        if (today.getTime() >= alertDate.getTime() && today.getTime() <= dueDate.getTime()) {
          const checkSent = await pool.request()
            .input('Public_Id', sql.NVarChar, reqRow.Public_Id)
            .query(`
              SELECT COUNT(*) AS cnt 
              FROM master.tb_Notification_Log 
              WHERE Event_Type = 'DUE_ALERT' AND Doc_No = @Public_Id
            `);

          if (checkSent.recordset[0].cnt === 0) {
            const formattedDueDate = dueDate.toLocaleDateString('en-GB');
            const divId = resolveDivisionId(reqRow.Division);

            await exports.emitNotification(null, pool, {
              eventType: 'DUE_ALERT',
              subject: '', // handled by frontend template
              docNo: reqRow.Public_Id,
              actionBy: 'System',
              targetRoles: `${reqRow.Requester},production`,
              ctaRoute: '/purchase/detailcasesetup',
              division: reqRow.Division,
              divisionId: divId,
              excludeUsername: 'System',
              detailsJson: {
                Public_Id: reqRow.Public_Id,
                DueDate: reqRow.DueDate,
                DocNo: reqRow.DocNo,
                type: 'due_alert'
              }
            });
            console.log(`[DueDate Alert] Sent notification for ${reqRow.Public_Id} (DueDate: ${formattedDueDate})`);
          }
        }
      }
    } catch (err) {
      console.error('[DueDate Alert] Error checking due date alerts:', err);
    }
  };

  // Run once on startup (after 5s/10s), then every hour
  setTimeout(runPurge, 5000);
  setInterval(runPurge, 60 * 60 * 1000);

  setTimeout(checkDueDateAlerts, 10000);
  setInterval(checkDueDateAlerts, 60 * 60 * 1000);
})();

const { resolveRoles, resolveDivisionId } = require('../utils/notification.constants');

// --------------------------------------------------------------------------------------------------------------------
// Shared Helper: Insert notification and emit socket
// --------------------------------------------------------------------------------------------------------------------
exports.emitNotification = async (req, pool, {
  eventType,
  subject,
  // messageEN / messageTH intentionally removed — all body text is
  // rendered by the frontend from notification-templates.ts.
  // Only short event codes, Subject preview & compact Details_JSON are stored.
  docNo,
  actionBy,
  targetRoles,
  ctaRoute,
  detailsJson,
  division,
  divisionId, // Numeric: 2 for PMC, 3 for GM
  excludeUsername
}) => {
  try {
    const io = req ? req.app.get('socketio') : null;
    const resolvedTarget = resolveRoles(targetRoles);

    // Standardize details structure
    let finalDetailsJson = detailsJson || {};
    if (division) {
      finalDetailsJson.divisionName = division;
    }
    if (divisionId) {
      finalDetailsJson.divisionId = Number(divisionId);
    }

    // 1. Save to DB
    // Message / Message_TH / Subject are always empty — frontend renders all body text.
    // Only Event_Type, Doc_No, and Details_JSON are stored.
    const notifyResult = await pool.request()
      .input('Event_Type', sql.NVarChar, eventType)
      .input('Message', sql.NVarChar, '')   // Frontend-rendered: not stored
      .input('Doc_No', sql.NVarChar, docNo || '')
      .input('Action_By', sql.NVarChar, actionBy || 'System')
      .input('Subject', sql.NVarChar, '')   // Frontend-rendered: not stored
      .input('Message_TH', sql.NVarChar, '')   // Frontend-rendered: not stored
      .input('Target_Roles', sql.NVarChar, resolvedTarget)
      .input('CTA_Route', sql.NVarChar, ctaRoute || '')
      .input('Details_JSON', sql.NVarChar, finalDetailsJson && Object.keys(finalDetailsJson).length > 0 ? JSON.stringify(finalDetailsJson) : null)
      .input('Exclude_Username', sql.NVarChar, excludeUsername || (req ? getUsername(req) : null))
      .input('Division_Id', sql.Int, divisionId ? Number(divisionId) : null)
      .execute('trans.Stored_Insert_Notification_Log');

    const notificationId = notifyResult.recordset[0]?.Notification_ID;

    // 2. Emit Real-time Socket Event
    if (io) {
      const socketPayload = {
        id: notificationId,
        type: eventType,
        subject: subject || '',
        docNo: docNo || '',
        actionBy: actionBy || 'System',
        targetRoles: resolvedTarget,
        ctaRoute: ctaRoute || '',
        detailsJson: null,
        division: division || null,
        divisionId: divisionId || null,
        excludeUsername: excludeUsername || getUsername(req) || actionBy || '',
        timestamp: new Date()
      };
      io.emit('notification', socketPayload);
      console.log(`[Notification] Emitted: ${eventType} (ID: ${notificationId}) -> ${resolvedTarget}`);
    }

    return notificationId;
  } catch (err) {
    console.error('[Notification] emitNotification error:', err);
    return null;
  }
};

// 7. Get Rich Details for a notification (Lazy Loading / Pointer Resolver)
exports.getNotificationDetails = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).send({ message: 'Notification ID is required' });

    const pool = await poolPromise;
    const notifyResult = await pool.request()
      .input('Notification_ID', sql.Int, id)
      .query('SELECT Event_Type, Doc_No, Division_Id, Details_JSON FROM master.tb_Notification_Log WHERE Notification_ID = @Notification_ID');

    const notification = notifyResult.recordset[0];
    if (!notification) return res.status(404).send({ message: 'Notification not found' });

    const { Event_Type, Doc_No, Division_Id, Details_JSON } = notification;
    let details = { type: null, items: [], changes: [], divisionId: Division_Id, docNo: Doc_No };

    let parsedDetails = null;

    // --- Fast path: if a pre-built snapshot is stored, return it directly ---
    if (Details_JSON) {
      try {
        parsedDetails = JSON.parse(Details_JSON);
        if (parsedDetails.items && Array.isArray(parsedDetails.items) && Event_Type !== 'NEW_PLAN') {
          const total = parsedDetails.items.length;
          const complete = parsedDetails.items.filter(i => (i.Status || '').toUpperCase() === 'COMPLETE' || (i.Status || '').toUpperCase() === 'FINISHED').length;
          return res.status(200).json({
            ...parsedDetails,
            total,
            complete,
            totalItems: parsedDetails.totalItems ?? total,
            isFinished: total > 0 && complete === total,
            divisionId: Division_Id,
            docNo: Doc_No
          });
        }
      } catch (e) { /* JSON parse failed, fall through to resolver */ }
    }
    const PC_FIELDS = ['PlanDate', 'MC_Type', 'Bar_Type', 'Facility', 'Before_Part', 'Process', 'MC_No', 'PartNo', 'QTY'];

    const compareData = (a, b, field) => {
      if (a == null && b == null) return false;
      if (a == null || b == null) return true;

      // Value-based comparison for dates and numbers to avoid reference/type mismatches
      if (field === 'PlanDate' || a instanceof Date || (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a))) {
        const da = new Date(a).toISOString().split('T')[0];
        const db = new Date(b).toISOString().split('T')[0];
        return da !== db;
      }
      return String(a).trim() !== String(b).trim();
    };

    // --- resolver logic ---
    if (Event_Type.includes('PLAN')) {
      const histResult = await pool.request().input('GroupId', sql.NVarChar, Doc_No).execute('trans.Stored_PCPlan_GetHistory');
      const history = histResult.recordset || [];

      if (Event_Type === 'PLAN_REVISION') {
        details.type = 'revision';
        // Find items that were modified in the latest global batch for this GroupId
        const maxRev = Math.max(...history.map(h => h.Revision));
        const currentItems = history.filter(h => h.Revision === maxRev);

        // Identify each item's status (New vs Edit)
        details.items = currentItems.map(cur => {
          const fieldChanges = [];
          // Find previous revision for this SPECIFIC item (Unique_Id)
          const prev = history.find(h => h.Revision < cur.Revision && h.Unique_Id === cur.Unique_Id);

          if (prev) {
            // --- EDITED ITEM ---
            PC_FIELDS.forEach(f => {
              if (compareData(cur[f], prev[f], f)) {
                fieldChanges.push({ field: f, old: prev[f], new: cur[f] });
              }
            });
            return { ...cur, fieldChanges, editStatus: 'EDIT' };
          } else {
            // --- NEW ITEM (First time in this Group) ---
            fieldChanges.push({ field: 'Status', old: '-', new: 'NEW ITEM ADDED' });
            fieldChanges.push({ field: 'PartNo', old: '', new: cur.PartNo });
            fieldChanges.push({ field: 'QTY', old: 0, new: cur.QTY });
            return { ...cur, fieldChanges, editStatus: 'NEW' };
          }
        });

        details.count = currentItems.length;

        // 1. If exactly ONE item was affected, populate top-level details.changes for the simple table view
        if (currentItems.length === 1) {
          details.changes = details.items[0].fieldChanges;
          // Keep details.items populated so the "Grid" fallback works if someone prefers it
        } else {
          // 2. For Batch Revisions, we leave details.changes empty so the UI uses the BATCH ITEM GRID
          details.changes = [];
        }
      } else if (Event_Type === 'NEW_PLAN') {
        details.type = 'new_plan';

        // --- Batch Path Completion Check ---
        // Parse stored groupIds from the notification's Details_JSON
        let groupIds = [];
        if (parsedDetails && parsedDetails.groupIds && Array.isArray(parsedDetails.groupIds)) {
          groupIds = parsedDetails.groupIds;
        } else if (history.length > 0) {
          // Fallback: use GroupId from history (single item case)
          groupIds = [Doc_No];
        }

        // Query path status for ALL individual items in this batch
        let pathStatusItems = [];
        if (groupIds.length > 0) {
          const pathRequest = pool.request();
          const placeholders = groupIds.map((gid, i) => {
            pathRequest.input(`gid${i}`, sql.NVarChar, gid);
            return `@gid${i}`;
          }).join(', ');

          const pathResult = await pathRequest.query(`
                        WITH LatestRev AS (
                            SELECT GroupId, MAX(Revision) as MaxRev
                            FROM [master].[tb_PC_Plan]
                            WHERE GroupId IN (${placeholders})
                              AND IsActive = 1
                              AND ISNULL(PlanStatus, '') != 'Cancelled'
                            GROUP BY GroupId
                        )
                        SELECT m.GroupId, m.PartNo, m.Path_Dwg, m.Path_Layout, m.Path_IIQC
                        FROM [master].[tb_PC_Plan] m
                        JOIN LatestRev l ON m.GroupId = l.GroupId AND m.Revision = l.MaxRev
                        WHERE m.IsActive = 1
                          AND ISNULL(m.PlanStatus, '') != 'Cancelled'
                    `);
          pathStatusItems = pathResult.recordset || [];
        }

        // FIX: Check ALL individual items (not just group count).
        // EN is DONE when EVERY item has BOTH Drawing AND Layout.
        // QC is DONE only when EVERY item has IIQC.
        const isEmptyPath = (p) => !p || p.trim() === '' || p.trim() === '-';
        const totalItems = pathStatusItems.length;
        const enCompleteCount = pathStatusItems.filter(r => !isEmptyPath(r.Path_Dwg) && !isEmptyPath(r.Path_Layout)).length;
        const qcCompleteCount = pathStatusItems.filter(r => !isEmptyPath(r.Path_IIQC)).length;

        const enDone = totalItems > 0 && enCompleteCount >= totalItems;
        const qcDone = totalItems > 0 && qcCompleteCount >= totalItems;
        const allDone = enDone && qcDone;

        let attachedFilesList = [];
        pathStatusItems.forEach(r => {
          if (!isEmptyPath(r.Path_Dwg)) attachedFilesList.push({ name: 'Drawing: ' + r.PartNo, url: r.Path_Dwg });
          if (!isEmptyPath(r.Path_Layout)) attachedFilesList.push({ name: 'Layout: ' + r.PartNo, url: r.Path_Layout });
          if (!isEmptyPath(r.Path_IIQC)) attachedFilesList.push({ name: 'IIQC: ' + r.PartNo, url: r.Path_IIQC });
        });
        details.AttachedFiles = attachedFilesList;

        // Build items for display
        // FIX: For batch imports, Doc_No is a batchId (e.g. PLAN-2-260427-1149),
        // NOT a real GroupId. So Stored_PCPlan_GetHistory returns empty.
        // When history is empty, query using individual groupIds or fall back to parsedDetails.items.
        let displayItems = [];
        if (history.length > 0) {
          const minRev = Math.min(...history.map(h => h.Revision));
          displayItems = history.filter(h => h.Revision === minRev);
        } else if (groupIds.length > 0) {
          // Query items using individual groupIds (batch case)
          const itemsRequest = pool.request();
          const itemPlaceholders = groupIds.map((gid, i) => {
            itemsRequest.input(`igid${i}`, sql.NVarChar, gid);
            return `@igid${i}`;
          }).join(', ');
          const itemsResult = await itemsRequest.query(`
            WITH LatestRev AS (
              SELECT GroupId, MAX(Revision) as MaxRev
              FROM [master].[tb_PC_Plan]
              WHERE GroupId IN (${itemPlaceholders}) AND IsActive = 1
              GROUP BY GroupId
            )
            SELECT m.PlanDate, m.PartNo, m.MC_Type, m.Bar_Type, m.Facility,
                   m.Before_Part, m.Process, m.MC_No, m.QTY, m.[Time], m.Comment
            FROM [master].[tb_PC_Plan] m
            JOIN LatestRev l ON m.GroupId = l.GroupId AND m.Revision = l.MaxRev
            WHERE m.IsActive = 1
              AND ISNULL(m.PlanStatus, '') != 'Cancelled'
          `);
          displayItems = itemsResult.recordset || [];
        } else if (parsedDetails && parsedDetails.items && Array.isArray(parsedDetails.items)) {
          // Last resort: use items stored at notification creation time
          displayItems = parsedDetails.items;
        }

        // Map to display-relevant fields only (avoid raw DB noise like Plan_ID, IsActive, Unique_Id)
        const DISPLAY_FIELDS = ['PlanDate', 'PartNo', 'MC_Type', 'Bar_Type', 'Facility', 'Before_Part', 'Process', 'MC_No', 'QTY', 'Time', 'Comment'];
        details.items = displayItems.map(row => {
          const clean = {};
          DISPLAY_FIELDS.forEach(f => {
            if (row[f] !== undefined && row[f] !== null && row[f] !== '') {
              clean[f] = row[f];
            }
          });
          return clean;
        });
        details.totalItems = details.items.length;

        // Attach path completion status
        details.enStatus = enDone ? 'done' : 'pending';
        details.qcStatus = qcDone ? 'done' : 'pending';
        details.allDone = allDone;
        details.enCompleteCount = enCompleteCount;
        details.qcCompleteCount = qcCompleteCount;
        details.totalOrders = totalItems;
        details.pathStatusItems = pathStatusItems.map(r => ({
          GroupId: r.GroupId,
          PartNo: r.PartNo,
          hasDwg: !isEmptyPath(r.Path_Dwg),
          hasLayout: !isEmptyPath(r.Path_Layout),
          hasIIQC: !isEmptyPath(r.Path_IIQC)
        }));
        details.groupIds = groupIds;
      } else if (Event_Type === 'CANCEL_PLAN') {
        details.type = 'cancel';
        // FIX: Same batch issue as NEW_PLAN — Doc_No may be a batchId, not a real GroupId.
        if (history.length > 0) {
          // Show items that were marked as cancelled in the latest revision of this GroupId
          const maxRevs = history.reduce((acc, h) => {
            acc[h.Unique_Id] = Math.max(acc[h.Unique_Id] || 0, h.Revision);
            return acc;
          }, {});
          const cancelledRows = history.filter(h => h.Revision === maxRevs[h.Unique_Id] && h.PlanStatus === 'Cancelled');
          const CANCEL_DISPLAY_FIELDS = ['PlanDate', 'PartNo', 'MC_Type', 'Process', 'MC_No', 'QTY', 'Time', 'Comment'];
          details.items = cancelledRows.map(row => {
            const clean = {};
            CANCEL_DISPLAY_FIELDS.forEach(f => {
              if (row[f] !== undefined && row[f] !== null && row[f] !== '') {
                clean[f] = row[f];
              }
            });
            return clean;
          });
        } else if (parsedDetails && parsedDetails.items && Array.isArray(parsedDetails.items)) {
          // Fallback: use items stored at notification creation time
          details.items = parsedDetails.items;
        }
        details.totalItems = details.items.length;
      }
    }
    else if (Event_Type.includes('REQUEST')) {
      let reqResult = null;
      if (parsedDetails && parsedDetails.lookupType === 'uniqueId' && parsedDetails.uniqueId) {
        reqResult = await pool.request().input('uId', sql.NVarChar, parsedDetails.uniqueId)
          .query(`SELECT DocNo, ItemNo, ItemName, QTY, Status, SPEC, Requester, DateTime_Record, After_DueDate
                            FROM dbo.tb_IssueCuttingTool_Request_Document WHERE Unique_Id = @uId
                            UNION ALL
                            SELECT DocNo, ItemNo, ItemName, QTY, Status, SPEC, Requester, DateTime_Record, After_DueDate
                            FROM dbo.tb_IssueSetupTool_Request_Document WHERE Unique_Id = @uId`);
      } else if (parsedDetails && parsedDetails.lookupType === 'publicId' && parsedDetails.publicId) {
        reqResult = await pool.request().input('pId', sql.NVarChar, parsedDetails.publicId)
          .query(`SELECT DocNo, ItemNo, ItemName, QTY, Status, SPEC, Requester, DateTime_Record, After_DueDate
                            FROM dbo.tb_IssueCuttingTool_Request_Document WHERE Public_Id = @pId
                            UNION ALL
                            SELECT DocNo, ItemNo, ItemName, QTY, Status, SPEC, Requester, DateTime_Record, After_DueDate
                            FROM dbo.tb_IssueSetupTool_Request_Document WHERE Public_Id = @pId`);
      } else {
        reqResult = await pool.request().input('Doc_No', sql.NVarChar, Doc_No)
          .query(`SELECT DocNo, ItemNo, ItemName, QTY, Status, SPEC, Requester, DateTime_Record, After_DueDate
                            FROM dbo.tb_IssueCuttingTool_Request_Document WHERE DocNo = @Doc_No
                            UNION ALL
                            SELECT DocNo, ItemNo, ItemName, QTY, Status, SPEC, Requester, DateTime_Record, After_DueDate
                            FROM dbo.tb_IssueSetupTool_Request_Document WHERE DocNo = @Doc_No`);
      }
      details.items = reqResult.recordset || [];

      const total = details.items.length;
      const complete = details.items.filter(i => (i.Status || '').toUpperCase() === 'COMPLETE' || (i.Status || '').toUpperCase() === 'FINISHED').length;

      details.total = total;
      details.complete = complete;
      details.isFinished = total > 0 && complete === total;
      details.totalItems = total;

      details.type = (Event_Type === 'NEW_REQUEST' || Event_Type.includes('SENT') || Event_Type.includes('ML')) ? 'new_request' : 'request_completed';
      if (Event_Type.includes('COMPLETED') && total > 1) {
        details.type = 'grouped_request_completed';
      }
    }
    else if (Event_Type.includes('RETURN')) {
      const retResult = await pool.request().input('Doc_No', sql.NVarChar, Doc_No)
        .query('SELECT PartNo as partNo, ItemNo as itemNo, QTY as qty, Status, DateTime_Record as Created_At FROM master.tb_Return_List WHERE Doc_No = @Doc_No');
      details.items = retResult.recordset;
      details.type = (Event_Type === 'RETURN_SENT') ? 'return_sent' : 'return_completed';
    }

    res.status(200).json(details);
  } catch (err) {
    console.error('Error getNotificationDetails:', err);
    res.status(500).send({ message: err.message });
  }
};
