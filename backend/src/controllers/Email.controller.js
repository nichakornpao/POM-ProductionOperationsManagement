const { sendMultipleEMail } = require('../utils/Email');
const { getEmailTemplate } = require('../utils/EmailTemplate');
const { poolPromise } = require('../config/database');
const sql = require('mssql');
const { emitNotification } = require('./Notification.controller');

const sendEmailNotification = async (req, res) => {
  try {
    const { receiver, roles, names, actionBy, planDate, comment, status, orderNo, systemLink, partNo, attachedType } = req.body;
    let finalReceiver = receiver;

    const pool = await poolPromise;

    // If roles or specific names are provided, fetch emails from database dynamically
    if ((roles && Array.isArray(roles) && roles.length > 0) || (names && Array.isArray(names) && names.length > 0)) {
      let query = `
        SELECT DISTINCT Email
        FROM dbo.tb_CuttingTool_Employee
        WHERE Email IS NOT NULL AND Email != '' AND (Subscription = 1 OR Subscription IS NULL)
      `;

      if (roles && roles.length > 0) {
        query += ` AND LOWER(LTRIM(RTRIM(Role))) IN (SELECT LOWER(LTRIM(RTRIM(value))) FROM STRING_SPLIT(@roles, ','))`;
      }
      if (names && names.length > 0) {
        query += ` AND LOWER(LTRIM(RTRIM(Employee_Name))) IN (SELECT LOWER(LTRIM(RTRIM(value))) FROM STRING_SPLIT(@names, ','))`;
      }

      console.log(`[Email Controller] Resolving roles: [${(roles || []).join(', ')}], names: [${(names || []).join(', ')}]`);
      const result = await pool.request()
        .input('roles', sql.NVarChar, (roles || []).join(','))
        .input('names', sql.NVarChar, (names || []).join(','))
        .query(query);

      const emails = result.recordset
        .map(row => row.Email ? row.Email.trim() : '')
        .filter(email => email.length > 0);
      console.log(`[Email Controller] Matched active subscriber emails from DB:`, emails);
      if (emails.length > 0) {
        if (receiver) {
          const mergedEmails = new Set([
            ...receiver.split(',').map(e => e.trim()).filter(e => e.length > 0),
            ...emails
          ]);
          finalReceiver = Array.from(mergedEmails).join(', ');
        } else {
          finalReceiver = emails.join(', ');
        }
      } else if (!receiver) {
        finalReceiver = '';
      }
    }

    // Dynamic subscription check for any specified receiver emails (filter out unsubscribed users)
    if (finalReceiver) {
      const emailList = finalReceiver.split(',').map(e => e.trim()).filter(e => e.length > 0);
      if (emailList.length > 0) {
        // Find all explicitly unsubscribed employee emails
        const unsubscribedResult = await pool.request().query(`
          SELECT Email
          FROM dbo.tb_CuttingTool_Employee
          WHERE Email IS NOT NULL AND Email != ''
          GROUP BY Email
          HAVING MAX(CASE WHEN Subscription = 1 OR Subscription IS NULL THEN 1 ELSE 0 END) = 0
        `);
        const unsubscribedSet = new Set(
          unsubscribedResult.recordset.map(row => row.Email.trim().toLowerCase())
        );

        // Keep only emails that are not in the unsubscribed set AND do NOT end with @minebae.cp.th
        const subscribedEmails = emailList.filter(email => {
          const lowerEmail = email.toLowerCase();
          return !unsubscribedSet.has(lowerEmail) && !lowerEmail.endsWith('@minebae.cp.th');
        });
        finalReceiver = subscribedEmails.join(', ');
      }
    }

    // --- Sync Bell Notification (Web App pbgm8g:9696) ---
    try {
      await emitNotification(req, pool, {
        eventType: 'STATUS_UPDATE',
        subject: '', // handled by frontend template
        docNo: orderNo || partNo || '',
        actionBy: actionBy || 'System',
        targetRoles: (roles && roles.length > 0) ? roles.join(',') : 'ALL',
        ctaRoute: systemLink || '/',
        detailsJson: {
          Status: status || 'Update',
          Comment: comment || '-',
          Plan_No: orderNo || partNo || 'Update',
          PlanDate: planDate || ''
        }
      });
      console.log(`[Email Controller] Emitted Bell Notification for web app (targetRoles: ${(roles || []).join(',')}).`);
    } catch (notifyErr) {
      console.error('[Email Controller] Error emitting bell notification:', notifyErr);
    }

    if (!finalReceiver) {
      console.log('No email sent: all recipients are unsubscribed or empty (Bell notification emitted).');
      return res.status(200).json({ 
        message: 'Bell notification emitted (No email sent: all recipients unsubscribed/empty)', 
        info: { accepted: [], rejected: [] }
      });
    }

    console.log(`Sending email to: ${finalReceiver}`);

    const result = await sendMultipleEMail({
      to: finalReceiver,
      actionBy: actionBy,
      planDate: planDate,
      comment: comment,
      status: status,
      orderNo: orderNo,
      systemLink: systemLink,
      partNo: partNo,
      attachedType: attachedType
    });

    return res.status(200).json({
      message: 'Send Email successfully',
      info: result.info
    });

  } catch (error) {
    console.error('Email Controller Error:', error);
    return res.status(500).json({
      message: 'Email Controller Error',
      error: error.message
    });
  }
};

const previewEmailTemplate = (req, res) => {
  const displayName = "pmc.cost@minebea.co.th"
  const sampleComment = "HelloWorld";
  let html = getEmailTemplate(displayName, 'Username', '-', sampleComment);
  // Replace CID with local URL for browser preview (CID only works inside emails)
  html = html.replace('src="cid:logo"', 'src="http://localhost:9696/logominebea.png"');
  res.send(html);
};

module.exports = { sendEmailNotification, previewEmailTemplate }
