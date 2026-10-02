const { poolPromise } = require("../config/database");
const sql = require("mssql").TYPES;

/**
 * ==========================================
 * CUTTING TOOL DROPDOWNS (Cascading)
 * ==========================================
 */













// ==========================================
//              SETUP TOOL
// ==========================================

/**
 * API: ดึง Division
 * หน้าที่: ดึง Division ทั้งหมด เพื่อทำ Dropdown ขั้นแรกในฟอร์มของ Setup Tool
 */
exports.get_Setup_Division = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .execute('[trans].[Stored_Get_Dropdown_Division]');
    // Returns: Division_Id, Profit_Center, Division_Name
    res.json(result.recordset);
  } catch (error) {
    console.error("Error executing query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * API: ดึง Fac
 * หน้าที่: กรอง Fac อิงตาม Division ของ Setup Tool
 */
exports.get_Setup_Facility = async (req, res) => {
  try {
    const Division = req.body.Division || req.body.division;
    if (!Division) return res.status(400).json({ error: "Missing Division parameter" });

    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Profit_Center", sql.NVarChar, Division)
      .execute('[trans].[Stored_Get_Dropdown_Facility_By_Division]');
    // Returns: FacilityName
    res.json(result.recordset);
  } catch (error) {
    console.error("Error executing query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};









// ==========================================
//         CASE SET (CuttingTool + SetupTool)
// ==========================================





// ==========================================
//    CASE SET DETAIL (Box/Shelf/Rack Breakdown)
// ==========================================

/**
 * API: ดึงข้อมูลรายละเอียดกล่อง/ชั้นวางต่างๆ ของ Cutting Tool สำหรับ Case SET (Get CuttingTool Detail Breakdown)
 * หน้าที่: ตรวจสอบรายละเอียดแต่ละชิ้น ว่าไอเทมนี้เก็บไว้ที่ตู้ไหน ถาดไหน หรือช่องไหน (Box/Shelf breakdown)
 */
exports.get_CaseSET_CuttingTool_Detail = async (req, res) => {
  console.time('CaseSET_CuttingTool_Detail_QueryTime');
  try {
    const Division = req.body.Division || req.body.division;
    const ItemNo = req.body.ItemNo || req.body.itemNo;
    const FacilityName = req.body.FacilityName || req.body.facilityName;
    const PartNo = req.body.PartNo || req.body.partNo;
    const Process = req.body.Process || req.body.process;
    // console.log('CaseSET CuttingTool Detail Params:', { Division, ItemNo, FacilityName, PartNo, Process });

    const pool = await poolPromise;
    const request = pool.request();

    if (Division) request.input("Input_Division", sql.NVarChar, Division);
    if (ItemNo) request.input("Input_ItemNo", sql.NVarChar, ItemNo);
    if (FacilityName) request.input("Input_FacilityName", sql.NVarChar, FacilityName);
    if (PartNo) request.input("Input_PartNo", sql.NVarChar, PartNo);
    if (Process) request.input("Input_Process", sql.NVarChar, Process);

    const result = await request.execute("[trans].[Stored_Get_CaseSET_CuttingTool_Detail]");

    console.timeEnd('CaseSET_CuttingTool_Detail_QueryTime');
    // console.log(`Found ${result.recordset.length} Detail items.`);

    res.json(result.recordset);
  } catch (error) {
    console.timeEnd('CaseSET_CuttingTool_Detail_QueryTime');
    console.error("Error executing CaseSET CuttingTool Detail query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * API: ดึงไอเทมทั้ง Cutting และ Setup ของ Case SET คืนมาพร้อมกัน (Get Case SET All Unified)
 * หน้าที่: ดึงและรวมรายการทั้ง Cutting Tool และ Setup Tool ในบิล Case SET กลับมาในรูปแบบข้อมูลรวมก้อนเดียว
 */
exports.get_CaseSET_All = async (req, res) => {
  console.time('CaseSET_All_QueryTime');
  try {
    const Division = req.body.Division || req.body.division;
    const PartNo = req.body.PartNo || req.body.partNo;
    const Process = req.body.Process || req.body.process;
    const FacilityName = req.body.FacilityName || req.body.facilityName;
    const MC = req.body.MC || req.body.mc;
    const ItemNo = req.body.ItemNo || req.body.itemNo;
    // console.log('CaseSET All Params:', { Division, PartNo, Process, FacilityName, MC, ItemNo });

    const pool = await poolPromise;
    const request = pool.request();

    if (Division) request.input("Input_Division", sql.NVarChar, Division);
    if (PartNo) request.input("Input_PartNo", sql.NVarChar, PartNo);
    if (Process) request.input("Input_Process", sql.NVarChar, Process);
    if (FacilityName) request.input("Input_FacilityName", sql.NVarChar, FacilityName);
    if (MC) request.input("Input_MC", sql.NVarChar, MC);
    if (ItemNo) request.input("Input_ItemNo", sql.NVarChar, ItemNo);

    const result = await request.execute("[trans].[Stored_Get_CaseSET_All]");

    console.timeEnd('CaseSET_All_QueryTime');
    // console.log(`Found ${result.recordset.length} items (Cutting+Setup Mapped).`);

    res.json(result.recordset);
  } catch (error) {
    console.timeEnd('CaseSET_All_QueryTime');
    console.error("Error executing CaseSET All query:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * API: ดึงรายชื่อ Item No (Dropdown) ของ Case SET กรณีระบุ ToolingType แบบไม่เจาะจงเต็มรูปแบบ
 * หน้าที่: สร้าง Dropdown ของช่องเบอร์ Item สำหรับโหมด Case SET โดยใช้ ToolingType (Cutting tool หรือ Setup tool) ได้
 */
exports.get_CaseSET_Dropdown_ItemNo = async (req, res) => {
  try {
    const Division = req.body.Division || req.body.division;
    const ToolingType = req.body.ToolingType || req.body.toolingType;
    const PartNo = req.body.PartNo || req.body.partNo;
    // console.log('get_CaseSET_Dropdown_ItemNo - Division:', Division, 'ToolingType:', ToolingType, 'PartNo:', PartNo);
    const pool = await poolPromise;
    const result = await pool.request()
      .input("Division", sql.NVarChar, Division)
      .input("ToolingType", sql.NVarChar, ToolingType || 'Cutting tool')
      .input("Input_PartNo", sql.NVarChar, PartNo) // Added PartNo filtering
      .execute("[trans].[Stored_Get_CaseSET_Dropdown_ItemNo]");
    res.json(result.recordset);
  } catch (error) {
    console.error("Error get_CaseSET_Dropdown_ItemNo:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};



// ==========================================
//    CASE SET DROPDOWNS (PartNo, Process, MC)
// ==========================================

/**
 * API: ดึงรายชื่อพาร์ท Dropdown สำหรับ Case SET (Get Dropdown PartNo)
 * หน้าที่: ดึงข้อมูล PartNo ที่มีอยู่ในบิล กรณีเบิกแบบ Case SET
 */
exports.get_CaseSET_Dropdown_PartNo = async (req, res) => {
  try {
    const Division = req.body.Division || req.body.division || req.body.Profit_Center;
    const ItemNo = req.body.ItemNo || req.body.itemNo || req.body.Item_No;

    // console.log('CaseSET Dropdown PartNo - Division:', Division, 'ItemNo:', ItemNo);

    const pool = await poolPromise;
    const request = pool.request();

    if (Division) request.input("Input_Division", sql.NVarChar, Division);
    if (ItemNo) request.input("Input_ItemNo", sql.NVarChar, ItemNo);

    const result = await request.execute("[trans].[Stored_Get_CaseSET_Dropdown_PartNo]");
    //  console.log(`Found ${result.recordset.length} PartNo items.`);

    res.json(result.recordset);
  } catch (error) {
    console.error("Error CaseSET Dropdown PartNo:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * API: ดึงรายชื่อกระบวนการผลิต Dropdown สำหรับ Case SET (Get Dropdown Process)
 * หน้าที่: ดึงข้อมูล Process ตาม PartNo ในกรณีที่มีการใช้บิลแบบ Case SET
 */
exports.get_CaseSET_Dropdown_Process = async (req, res) => {
  try {
    const Division = req.body.Division || req.body.division;
    const PartNo = req.body.PartNo || req.body.partNo;
    const ItemNo = req.body.ItemNo || req.body.itemNo;
    // console.log('CaseSET Dropdown Process - Division:', Division, 'PartNo:', PartNo, 'ItemNo:', ItemNo);

    const pool = await poolPromise;
    const request = pool.request();

    if (Division) request.input("Input_Division", sql.NVarChar, Division);
    if (PartNo) request.input("Input_PartNo", sql.NVarChar, PartNo);
    if (ItemNo) request.input("Input_ItemNo", sql.NVarChar, ItemNo);

    const result = await request.execute("[trans].[Stored_Get_CaseSET_Dropdown_Process]");
    // console.log(`Found ${result.recordset.length} Process items.`);

    res.json(result.recordset);
  } catch (error) {
    console.error("Error CaseSET Dropdown Process:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

/**
 * API: ดึงรายชื่อเครื่องจักร Dropdown สำหรับ Case SET (Get Dropdown MC)
 * หน้าที่: ดึงข้อมูลเครื่องจักร (MC) เข้ามาทำ Dropdown ในกรณีมีการใช้บิลเบิกแบบ Case SET
 */
exports.get_CaseSET_Dropdown_MC = async (req, res) => {
  try {
    const Division = req.body.Division || req.body.division;
    const PartNo = req.body.PartNo || req.body.partNo;
    const Process = req.body.Process || req.body.process;
    const ItemNo = req.body.ItemNo || req.body.itemNo;
    // console.log('CaseSET Dropdown MC - Division:', Division, 'PartNo:', PartNo, 'Process:', Process, 'ItemNo:', ItemNo);

    const pool = await poolPromise;
    const request = pool.request();

    if (Division) request.input("Input_Division", sql.NVarChar, Division);
    if (PartNo) request.input("Input_PartNo", sql.NVarChar, PartNo);
    if (Process) request.input("Input_Process", sql.NVarChar, Process);
    if (ItemNo) request.input("Input_ItemNo", sql.NVarChar, ItemNo);

    const result = await request.execute("[trans].[Stored_Get_CaseSET_Dropdown_MC]");
    // console.log(`Found ${result.recordset.length} MC items.`);

    res.json(result.recordset);
  } catch (error) {
    console.error("Error CaseSET Dropdown MC:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};

// ==========================================
//    MC BY DIVISION (แสดงเฉยๆ ไม่ใช้กรอง)
// ==========================================


// ==========================================
//    TOOLING REQUEST BY UNIQUE ID (PlanList VIEW)
// ==========================================

/**
 * API: ดึงรายการ Request ตาม Unique_Id จาก PC Plan
 * หน้าที่: ใช้ตอนกด VIEW จากหน้า PlanList แท็บ PD
 *         เชื่อม Unique_Id กับ tb_IssueCuttingTool_Request_Document และ tb_IssueSetupTool_Request_Document
 */
exports.getToolingRequestByUniqueId = async (req, res) => {
  try {
    const { uniqueId } = req.body;
    if (!uniqueId) {
      return res.status(400).json({ error: "Missing uniqueId parameter" });
    }

    // Strip 'PLAN-' prefix if present (frontend adds PLAN- for display)
    const rawUuid = uniqueId.toString().replace(/^PLAN-/i, '').trim();

    const pool = await poolPromise;

    // console.log(`[getToolingRequestByUniqueId] Received uniqueId: ${uniqueId}`);
    // console.log(`[getToolingRequestByUniqueId] Stripped rawUuid: ${rawUuid}`);

    // Call Stored Procedure [trans].[Stored_Get_ToolingRequest_ByUniqueId]
    // Returns 2 recordsets: [0] = CuttingTool, [1] = SetupTool
    const result = await pool.request()
      .input('UniqueId', sql.NVarChar, rawUuid)
      .execute('[trans].[Stored_Get_ToolingRequest_ByUniqueId]');

    // console.log(`[getToolingRequestByUniqueId] CuttingTool rows: ${result.recordsets[0] ? result.recordsets[0].length : 0}`);
    // console.log(`[getToolingRequestByUniqueId] SetupTool rows: ${result.recordsets[1] ? result.recordsets[1].length : 0}`);

    const cuttingRecords = result.recordsets[0] || [];
    const setupRecords = result.recordsets[1] || [];

    // Build header info from first available record
    const firstRecord = cuttingRecords[0] || setupRecords[0] || null;

    res.json({
      header: firstRecord ? {
        partNo: firstRecord.PartNo,
        process: firstRecord.Process,
        mcType: firstRecord.MCType,
        mcNo: firstRecord.MCNo,
        fac: firstRecord.Fac,
        requester: firstRecord.Requester
      } : null,
      cuttingTool: cuttingRecords,
      setupTool: setupRecords
    });

  } catch (error) {
    console.error("Error getToolingRequestByUniqueId:", error.stack);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
};
