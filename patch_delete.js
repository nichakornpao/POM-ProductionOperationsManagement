const fs = require('fs');
const path = './backend/src/controllers/DetailPurchaseRequestlist.controller.js';
let content = fs.readFileSync(path, 'utf8');

const targetStr = `    const executeDelete = async (type, idValue, isPublic = false) => {
      const isCutting = type === 'Cutting';
      const targetTable = isCutting ? '[dbo].[tb_IssueCuttingTool_Request_Document]' : '[dbo].[tb_IssueSetupTool_Request_Document]';
      const idCol = isPublic ? "Public_Id" : (isCutting ? "ID_Request" : "ID_RequestSetupTool");

      return await pool.request()
        .input("ID_Val", isPublic ? sql.NVarChar : sql.Int, isPublic ? idValue : Number(idValue))
        .query(\`DELETE FROM \${targetTable} WHERE \${idCol} = @ID_Val\`);
    };

    const isPublic = upperId.startsWith('C') || upperId.startsWith('S');`;

const replStr = `    const executeDelete = async (type, idValue, isPublic = false) => {
      const isCutting = type === 'Cutting';
      const targetTable = isCutting ? '[dbo].[tb_IssueCuttingTool_Request_Document]' : '[dbo].[tb_IssueSetupTool_Request_Document]';
      const idCol = isPublic ? "Public_Id" : (isCutting ? "ID_Request" : "ID_RequestSetupTool");

      return await pool.request()
        .input("ID_Val", isPublic ? sql.NVarChar : sql.Int, isPublic ? idValue : Number(idValue))
        .query(\`DELETE FROM \${targetTable} WHERE \${idCol} = @ID_Val\`);
    };

    // === MOCK DATA INTERCEPTION ===
    const hasTestWord = upperId.includes('TEST');
    if (hasTestWord) {
      try {
        const { poolRequestIndirrecPromise } = require('../config/database');
        const poolIndirrec = await poolRequestIndirrecPromise;
        const sqlReq = require('mssql');
        await poolIndirrec.request()
          .input("ID_Val", sqlReq.NVarChar, String(id))
          .query(\`DELETE FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id = @ID_Val\`);
        return res.json({ success: true, message: 'Mock data deleted successfully' });
      } catch (mockErr) {
        return res.status(500).json({ success: false, message: "Failed to delete mock data", error: mockErr.message });
      }
    }
    // ================================

    const isPublic = upperId.startsWith('C') || upperId.startsWith('S');`;

content = content.replace(targetStr, replStr);
fs.writeFileSync(path, content, 'utf8');
