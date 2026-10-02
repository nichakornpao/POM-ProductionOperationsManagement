USE [db_Tooling]
GO
/****** Object:  StoredProcedure [trans].[Stored_Import_Master_Tooling_PMC_JSON] ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      System / Antigravity
-- Create Date: 2026-02-27
-- Modified:    2026-02-28
--   Added data-cleansing rules for invalid Excel values:
--   (1) Setup_ID  : "-" Holder_Spec + "#N/A" Holder_No = -1
--                   valid Holder_Spec + "#N/A" Holder_No = NULL
--   (2) Position_Code : "NO DATA" = NULL ; "0" = "-1"
--   (3) Cutting_ID : Spec or ItemNo is "0", "-", "#DIV/0!" = -1
--   (4) Usage_pcs, CT_sec, Conner, Usage_Conner : "0","-","#DIV/0!" = -1
--   (5) Holder_Maker : "0","-","#DIV/0!" = "-1"
-- Update:      เพิ่มล้างอักขระซ่อนเร้นให้ MC/Process และอัปเดต Process_Id
-- Description: Import Master Tooling PMC Excel data into [master].[tb_Mapping_All] (Version ฟ้อง Error)
-- =============================================
ALTER PROCEDURE [trans].[Stored_Import_Master_Tooling_PMC_JSON]
    @JsonData               NVARCHAR(MAX),
    @UploadedBy             NVARCHAR(100) = 'System',
    @Recorder_ID_Internal   INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- ============================================================
        -- STEP 0: Cleanup and Prepare Temp Tables (Outside Transaction)
        -- ============================================================
        DROP TABLE IF EXISTS #TempRaw;
        DROP TABLE IF EXISTS #TempMapped;
        DROP TABLE IF EXISTS #TempAggregated;

        CREATE TABLE #TempRaw (
            ExcelRow            INT,
            Spec                NVARCHAR(100),
            PartNo              NVARCHAR(100),
            ItemNo              NVARCHAR(100),
            Process             NVARCHAR(100),
            MC                  NVARCHAR(100),
            DwgRev              NVARCHAR(50),
            DwgUpdate           NVARCHAR(50),
            Usage_pcs           NVARCHAR(50),
            CT_sec              NVARCHAR(50),
            [Position]          NVARCHAR(50),
            Res                 NVARCHAR(50),
            Date_update         NVARCHAR(50),
            Insert_Maker        NVARCHAR(50),
            Holder_Spec         NVARCHAR(100),
            Holder_No           NVARCHAR(100),
            Holder_Maker        NVARCHAR(50),
            Conner              NVARCHAR(50),
            Usage_Conner        NVARCHAR(50),
            Cutting_Layout_No   NVARCHAR(100),
            Cutting_Layout_Rev  NVARCHAR(50),
            Program_cutting_No  NVARCHAR(100),
            Position_Code       NVARCHAR(100),
            Fac                 NVARCHAR(50)
        );

        CREATE TABLE #TempMapped (
            ExcelRow            INT,
            Spec                NVARCHAR(100),
            PartNo              NVARCHAR(100),
            ItemNo              NVARCHAR(100),
            Process             NVARCHAR(100),
            MC                  NVARCHAR(100),
            Holder_Spec         NVARCHAR(100),
            Holder_No           NVARCHAR(100),
            Holder_Maker        NVARCHAR(50),
            DwgRev              NVARCHAR(50),
            DwgUpdate           NVARCHAR(50),
            Usage_pcs           NVARCHAR(50),
            CT_sec              NVARCHAR(50),
            [Position]          NVARCHAR(50),
            Res                 NVARCHAR(50),
            Date_update         NVARCHAR(50),
            Insert_Maker        NVARCHAR(50),
            Conner              NVARCHAR(50),
            Usage_Conner        NVARCHAR(50),
            Cutting_Layout_No   NVARCHAR(100),
            Cutting_Layout_Rev  NVARCHAR(50),
            Program_cutting_No  NVARCHAR(100),
            Position_Code       NVARCHAR(100),
            Fac                 NVARCHAR(50),
            Part_Id             INT,
            MC_Group_Id         INT,
            Setup_ID            INT,
            Cutting_ID          INT,
            Process_Id          INT
        );

        CREATE TABLE #TempAggregated (
            ExcelRow             INT,
            Part_Id              INT,
            Cutting_ID           INT,
            Process_Id           INT,
            MC_Group_Id          INT,
            Setup_ID             INT,
            Usage_pcs            NVARCHAR(50),
            [Position]           NVARCHAR(50),
            Position_Code        NVARCHAR(100),
            Required_Cutting_QTY INT,
            Required_Holder_QTY  INT,
            Process              NVARCHAR(100),
            DwgRev               NVARCHAR(50),
            DwgUpdate            NVARCHAR(50),
            CT_sec               NVARCHAR(50),
            Res                  NVARCHAR(50),
            Date_update          NVARCHAR(50),
            Insert_Maker         NVARCHAR(50),
            Conner               NVARCHAR(50),
            Usage_Conner         NVARCHAR(50),
            Cutting_Layout_No    NVARCHAR(100),
            Cutting_Layout_Rev   NVARCHAR(50),
            Program_cutting_No   NVARCHAR(100),
            Holder_Maker         NVARCHAR(50),
            Fac                  NVARCHAR(50),
            Has_Spec_ItemNo      BIT,
            Has_HolderSpec_HolderNo BIT
        );

        BEGIN TRANSACTION;

        INSERT INTO #TempRaw
        SELECT
            TRY_CAST(J.ExcelRow          AS INT),
            NULLIF(LTRIM(RTRIM(J.Spec)),           ''),
            NULLIF(LTRIM(RTRIM(J.PartNo)),         ''),
            NULLIF(LTRIM(RTRIM(J.ItemNo)),         ''),
            -- ★ ดักล้างอักขระล่องหน Space พิเศษ(160) และ Enter(13,10) ออกจากฝั่ง Excel
            NULLIF(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(J.Process, CHAR(160), ' '), CHAR(13), ''), CHAR(10), ''))), ''),
            NULLIF(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(J.MC, CHAR(160), ' '), CHAR(13), ''), CHAR(10), ''))), ''),
            NULLIF(LTRIM(RTRIM(J.DwgRev)),         ''),
            NULLIF(LTRIM(RTRIM(J.DwgUpdate)),      ''),
            NULLIF(LTRIM(RTRIM(J.Usage_pcs)),      ''),
            NULLIF(LTRIM(RTRIM(J.CT_sec)),         ''),
            NULLIF(LTRIM(RTRIM(J.[Position])),     ''),
            NULLIF(LTRIM(RTRIM(J.Res)),            ''),
            NULLIF(LTRIM(RTRIM(J.Date_update)),    ''),
            NULLIF(LTRIM(RTRIM(J.Insert_Maker)),   ''),
            NULLIF(LTRIM(RTRIM(J.Holder_Spec)),    ''),
            NULLIF(LTRIM(RTRIM(J.Holder_No)),      ''),
            NULLIF(LTRIM(RTRIM(J.Holder_Maker)),   ''),
            NULLIF(LTRIM(RTRIM(J.Conner)),         ''),
            NULLIF(LTRIM(RTRIM(J.Usage_Conner)),   ''),
            NULLIF(LTRIM(RTRIM(J.Cutting_Layout_No)),  ''),
            NULLIF(LTRIM(RTRIM(J.Cutting_Layout_Rev)), ''),
            NULLIF(LTRIM(RTRIM(J.Program_cutting_No)), ''),
            NULLIF(LTRIM(RTRIM(J.Position_Code)),  ''),
            NULLIF(LTRIM(RTRIM(J.Fac)),            '')
        FROM OPENJSON(@JsonData)
        WITH (
            ExcelRow            INT             '$.ExcelRow',
            Spec                NVARCHAR(100)   '$.Spec',
            PartNo              NVARCHAR(100)   '$.PartNo',
            ItemNo              NVARCHAR(100)   '$.ItemNo',
            Process             NVARCHAR(100)   '$.Process',
            MC                  NVARCHAR(100)   '$.MC',
            DwgRev              NVARCHAR(50)    '$.DwgRev',
            DwgUpdate           NVARCHAR(50)    '$.DwgUpdate',
            Usage_pcs           NVARCHAR(50)    '$.Usage_pcs',
            CT_sec              NVARCHAR(50)    '$.CT_sec',
            [Position]          NVARCHAR(50)    '$.Position',
            Res                 NVARCHAR(50)    '$.Res',
            Date_update         NVARCHAR(50)    '$.Date_update',
            Insert_Maker        NVARCHAR(50)    '$.Insert_Maker',
            Holder_Spec         NVARCHAR(100)   '$.Holder_Spec',
            Holder_No           NVARCHAR(100)   '$.Holder_No',
            Holder_Maker        NVARCHAR(50)    '$.Holder_Maker',
            Conner              NVARCHAR(50)    '$.Conner',
            Usage_Conner        NVARCHAR(50)    '$.Usage_Conner',
            Cutting_Layout_No   NVARCHAR(100)   '$.Cutting_Layout_No',
            Cutting_Layout_Rev  NVARCHAR(50)    '$.Cutting_Layout_Rev',
            Program_cutting_No  NVARCHAR(100)   '$.Program_cutting_No',
            Position_Code       NVARCHAR(100)   '$.Position_Code',
            Fac                 NVARCHAR(50)    '$.Fac'
        ) AS J;

        -- ============================================================
        -- STEP 1.5: Auto-Insert new Process and MC Group if not exists
        -- Insert Process first (MC Group has FK to Process)
        -- ============================================================

        -- 1.5a: Insert new Process names into tb_Master_Machine_Process
        INSERT INTO [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Process]
            (Process_Name)
        SELECT DISTINCT R.Process
        FROM #TempRaw R
        WHERE R.Process IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Process] MP
              -- ★ ดักตัวเล็กใหญ่ และล้างขยะฝั่ง DB ให้ Process
              WHERE UPPER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(MP.Process_Name, CHAR(160), ' '), CHAR(13), ''), CHAR(10), '')))) COLLATE DATABASE_DEFAULT
                  = UPPER(R.Process) COLLATE DATABASE_DEFAULT
          );

        -- 1.5b: Insert new MC Group names into tb_Master_Machine_Group
        INSERT INTO [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Group]
            (MC_Group)
        SELECT MC
        FROM (
            SELECT DISTINCT
                R.MC
            FROM #TempRaw R
            WHERE R.MC IS NOT NULL
        ) AS Pairs
        WHERE NOT EXISTS (
            SELECT 1
            FROM [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Group] MCG
            -- ★ ดักตัวเล็กใหญ่ และล้างขยะฝั่ง DB ให้ MC
            WHERE UPPER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(MCG.MC_Group, CHAR(160), ' '), CHAR(13), ''), CHAR(10), '')))) COLLATE DATABASE_DEFAULT
                = UPPER(Pairs.MC) COLLATE DATABASE_DEFAULT
        )
        GROUP BY MC;

        -- ============================================================
        -- STEP 2: ID Lookups + Data Cleansing Rules into #TempMapped
        -- ============================================================

        INSERT INTO #TempMapped
        SELECT
            R.ExcelRow,
            R.Spec,
            R.PartNo,
            R.ItemNo,
            R.Process,
            R.MC,
            R.Holder_Spec,
            R.Holder_No,
            -- Rule 5: Holder_Maker
            CASE
                WHEN R.Holder_Maker IN ('0', '-', '#DIV/0!') THEN '-1'
                ELSE R.Holder_Maker
            END AS Holder_Maker,
            R.DwgRev,
            R.DwgUpdate,
            -- Rule 4: Usage_pcs
            CASE
                WHEN R.Usage_pcs IN ('0', '-', '#DIV/0!') THEN '-1'
                ELSE R.Usage_pcs
            END AS Usage_pcs,
            -- Rule 4: CT_sec
            CASE
                WHEN R.CT_sec IN ('0', '-', '#DIV/0!') THEN '-1'
                ELSE R.CT_sec
            END AS CT_sec,
            R.[Position],
            R.Res,
            R.Date_update,
            R.Insert_Maker,
            -- Rule 4: Conner
            CASE
                WHEN R.Conner IN ('0', '-', '#DIV/0!') THEN '-1'
                ELSE R.Conner
            END AS Conner,
            -- Rule 4: Usage_Conner
            CASE
                WHEN R.Usage_Conner IN ('0', '-', '#DIV/0!') THEN '-1'
                ELSE R.Usage_Conner
            END AS Usage_Conner,
            R.Cutting_Layout_No,
            R.Cutting_Layout_Rev,
            R.Program_cutting_No,
            -- Rule 2: Position_Code
            CASE
                WHEN R.Position_Code = 'NO DATA' THEN NULL
                WHEN R.Position_Code = '0'       THEN '-1'
                ELSE R.Position_Code
            END AS Position_Code,
            R.Fac,
            -- Part_Id lookup
            PN.PN_ID AS Part_Id,
            -- MC_Group_Id lookup
            MCG.MC_Group_Id AS MC_Group_Id,
            -- Rule 1: Setup_ID
            CASE
                WHEN R.Holder_No = '#N/A' AND R.Holder_Spec = '-' THEN -1 
                WHEN R.Holder_No = '#N/A'                          THEN NULL
                ELSE SETUP_IM.IM_Id
            END AS Setup_ID,
            -- Rule 3: Cutting_ID
            CASE
                WHEN R.Spec   IN ('0', '-', '#DIV/0!')
                  OR R.ItemNo IN ('0', '-', '#DIV/0!') THEN -1
                ELSE CUT_IM.IM_Id
            END AS Cutting_ID,
            -- Process_Id lookup
            MP.Process_Id AS Process_Id
        FROM #TempRaw R
        LEFT JOIN [db_Production_Report_PMA].[master].[tb_part_no] PN
            ON LTRIM(RTRIM(PN.Part_No_ID)) COLLATE DATABASE_DEFAULT = R.PartNo COLLATE DATABASE_DEFAULT
        LEFT JOIN [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Group] MCG
            -- ★ ตอนจับคู่ ID ดักอักขระขยะฝั่ง DB ให้ตรงกัน
            ON UPPER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(MCG.MC_Group, CHAR(160), ' '), CHAR(13), ''), CHAR(10), '')))) COLLATE DATABASE_DEFAULT = UPPER(R.MC) COLLATE DATABASE_DEFAULT
        LEFT JOIN [db_SmartCuttingTool_PMA].[viewer].[tb_Item_MasterAll_PH] SETUP_IM
            ON R.Holder_No IS NOT NULL
           AND R.Holder_No <> '#N/A'
           AND LTRIM(RTRIM(SETUP_IM.ITEM_NO)) COLLATE DATABASE_DEFAULT = R.Holder_No COLLATE DATABASE_DEFAULT
        LEFT JOIN [db_SmartCuttingTool_PMA].[viewer].[tb_Item_MasterAll_PH] CUT_IM
            ON R.ItemNo IS NOT NULL
           AND NOT (R.Spec IN ('0', '-', '#DIV/0!'))
           AND NOT (R.ItemNo IN ('0', '-', '#DIV/0!'))
           AND LTRIM(RTRIM(CUT_IM.ITEM_NO)) COLLATE DATABASE_DEFAULT = R.ItemNo COLLATE DATABASE_DEFAULT
        LEFT JOIN [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Process] MP
            -- ★ ตอนจับคู่ ID ดักอักขระขยะฝั่ง DB ให้ตรงกัน
            ON UPPER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(MP.Process_Name, CHAR(160), ' '), CHAR(13), ''), CHAR(10), '')))) COLLATE DATABASE_DEFAULT = UPPER(R.Process) COLLATE DATABASE_DEFAULT;

        -- ============================================================
        -- STEP 2.5: Capture unmatched PartNo rows and filter them out
        -- ============================================================
        DROP TABLE IF EXISTS #TempUnmatched;
        CREATE TABLE #TempUnmatched (
            PartNo      NVARCHAR(100),
            Process     NVARCHAR(100),
            MC          NVARCHAR(100),
            ExcelRow    INT
        );

        INSERT INTO #TempUnmatched (PartNo, Process, MC, ExcelRow)
        SELECT M.PartNo, M.Process, M.MC, M.ExcelRow
        FROM #TempMapped M
        WHERE M.Part_Id IS NULL AND M.PartNo IS NOT NULL
        ORDER BY M.ExcelRow;

        -- Filter out unmatched rows so valid rows proceed to MERGE
        DELETE FROM #TempMapped WHERE Part_Id IS NULL AND PartNo IS NOT NULL;

        -- ============================================================
        -- STEP 3: Deduplication and Aggregation into #TempAggregated
        -- ============================================================


        ;WITH Grouped AS (
            SELECT
                Part_Id,
                Cutting_ID,
                Process_Id,
                MC_Group_Id,
                Setup_ID,
                Usage_pcs,
                [Position],
                Position_Code,
                MIN(ExcelRow) AS MinExcelRow,
                COUNT(*)      AS DupCount,
                MAX(CASE
                    WHEN Spec   IS NOT NULL AND Spec   NOT IN ('0', '-', '#DIV/0!')
                     AND ItemNo IS NOT NULL AND ItemNo NOT IN ('0', '-', '#DIV/0!')
                    THEN 1 ELSE 0
                END) AS Has_Spec_ItemNo,
                MAX(CASE
                    WHEN Holder_Spec IS NOT NULL
                     AND Holder_No   IS NOT NULL
                     AND Holder_No  <> '#N/A'
                    THEN 1 ELSE 0
                END) AS Has_HolderSpec_HolderNo
            FROM #TempMapped
            GROUP BY
                Part_Id, Cutting_ID, Process_Id, MC_Group_Id, Setup_ID,
                Usage_pcs, [Position], Position_Code
        ),
        FirstRow AS (
            SELECT
                M.Part_Id,
                M.Cutting_ID,
                M.Process_Id,
                M.MC_Group_Id,
                M.Setup_ID,
                M.Usage_pcs,
                M.[Position],
                M.Position_Code,
                M.Process,
                M.DwgRev,
                M.DwgUpdate,
                M.CT_sec,
                M.Res,
                M.Date_update,
                M.Insert_Maker,
                M.Conner,
                M.Usage_Conner,
                M.Cutting_Layout_No,
                M.Cutting_Layout_Rev,
                M.Program_cutting_No,
                M.Holder_Maker,
                M.Fac,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        M.Part_Id, M.Cutting_ID, M.Process_Id, M.MC_Group_Id, M.Setup_ID,
                        M.Usage_pcs, M.[Position], M.Position_Code
                    ORDER BY M.ExcelRow ASC
                ) AS rn
            FROM #TempMapped M
        )
        INSERT INTO #TempAggregated
        SELECT
            G.MinExcelRow,
            G.Part_Id,
            G.Cutting_ID,
            G.Process_Id,
            G.MC_Group_Id,
            G.Setup_ID,
            G.Usage_pcs,
            G.[Position],
            G.Position_Code,
            CASE WHEN G.Has_Spec_ItemNo = 1 THEN G.DupCount ELSE 0 END,
            CASE WHEN G.Has_HolderSpec_HolderNo = 1 THEN G.DupCount ELSE 0 END,
            FR.Process,
            FR.DwgRev,
            FR.DwgUpdate,
            FR.CT_sec,
            FR.Res,
            FR.Date_update,
            FR.Insert_Maker,
            FR.Conner,
            FR.Usage_Conner,
            FR.Cutting_Layout_No,
            FR.Cutting_Layout_Rev,
            FR.Program_cutting_No,
            FR.Holder_Maker,
            FR.Fac,
            G.Has_Spec_ItemNo,
            G.Has_HolderSpec_HolderNo
        FROM Grouped G
        INNER JOIN FirstRow FR
            ON  (FR.Part_Id      = G.Part_Id      OR (FR.Part_Id      IS NULL AND G.Part_Id      IS NULL))
            AND (FR.Cutting_ID   = G.Cutting_ID   OR (FR.Cutting_ID   IS NULL AND G.Cutting_ID   IS NULL))
            AND (FR.Process_Id   = G.Process_Id   OR (FR.Process_Id   IS NULL AND G.Process_Id   IS NULL))
            AND (FR.MC_Group_Id  = G.MC_Group_Id  OR (FR.MC_Group_Id  IS NULL AND G.MC_Group_Id  IS NULL))
            AND (FR.Setup_ID     = G.Setup_ID     OR (FR.Setup_ID     IS NULL AND G.Setup_ID     IS NULL))
            AND (FR.Usage_pcs    = G.Usage_pcs    OR (FR.Usage_pcs    IS NULL AND G.Usage_pcs    IS NULL))
            AND (FR.[Position]   = G.[Position]   OR (FR.[Position]   IS NULL AND G.[Position]   IS NULL))
            AND (FR.Position_Code = G.Position_Code OR (FR.Position_Code IS NULL AND G.Position_Code IS NULL))
            AND FR.rn = 1;

        -- ============================================================
        -- STEP 4: UPSERT into [master].[tb_Mapping_All] via MERGE
        -- ============================================================
        MERGE [master].[tb_Mapping_All] AS Target
        USING (SELECT * FROM #TempAggregated ORDER BY ExcelRow ASC OFFSET 0 ROWS) AS Source
        ON (
            Target.[Division_Id]  = 2
            AND (Target.[Part_Id]      = Source.Part_Id      OR (Target.[Part_Id]      IS NULL AND Source.Part_Id      IS NULL))
            AND (Target.[Cutting_ID]   = Source.Cutting_ID   OR (Target.[Cutting_ID]   IS NULL AND Source.Cutting_ID   IS NULL))
            AND (Target.[Process_Id]   = Source.Process_Id   OR (Target.[Process_Id]   IS NULL AND Source.Process_Id   IS NULL))
            AND (Target.[MC_Group_Id]  = Source.MC_Group_Id  OR (Target.[MC_Group_Id]  IS NULL AND Source.MC_Group_Id  IS NULL))
            AND (Target.[Setup_ID]     = Source.Setup_ID     OR (Target.[Setup_ID]     IS NULL AND Source.Setup_ID     IS NULL))
            AND (
                Target.[Usage_pcs] COLLATE DATABASE_DEFAULT = Source.Usage_pcs COLLATE DATABASE_DEFAULT
                OR (Target.[Usage_pcs] IS NULL AND Source.Usage_pcs IS NULL)
            )
            AND (
                Target.[Position] COLLATE DATABASE_DEFAULT = Source.[Position] COLLATE DATABASE_DEFAULT
                OR (Target.[Position] IS NULL AND Source.[Position] IS NULL)
            )
            AND (
                Target.[Position_Code] COLLATE DATABASE_DEFAULT = Source.Position_Code COLLATE DATABASE_DEFAULT
                OR (Target.[Position_Code] IS NULL AND Source.Position_Code IS NULL)
            )
        )
        WHEN MATCHED THEN UPDATE SET
            Target.[Process]               = Source.Process,
            Target.[DwgRev]                = Source.DwgRev,
            Target.[DwgUpdate]             = CASE
                                                WHEN ISNUMERIC(Source.DwgUpdate) = 1 AND Source.DwgUpdate NOT LIKE '%[^0-9]%'
                                                THEN CONVERT(NVARCHAR(50), DATEADD(DAY, TRY_CAST(Source.DwgUpdate AS INT), '1899-12-30'), 23)
                                                ELSE Source.DwgUpdate
                                             END,
            Target.[Usage_pcs]             = Source.Usage_pcs,
            Target.[CT_sec]                = TRY_CAST(Source.CT_sec AS DECIMAL(10,2)),
            Target.[Res.]                  = Source.Res,
            Target.[Date update]           = CASE
                                                WHEN ISNUMERIC(Source.Date_update) = 1 AND Source.Date_update NOT LIKE '%[^0-9]%'
                                                THEN CONVERT(NVARCHAR(50), DATEADD(DAY, TRY_CAST(Source.Date_update AS INT), '1899-12-30'), 23)
                                                ELSE Source.Date_update
                                             END,
            Target.[Insert Maker]          = Source.Insert_Maker,
            Target.[Conner]                = TRY_CAST(Source.Conner AS INT),
            Target.[Usage/Conner]          = TRY_CAST(Source.Usage_Conner AS INT),
            Target.[Cutting Layout No.]    = Source.Cutting_Layout_No,
            Target.[Cutting Layout Rev.]   = TRY_CAST(Source.Cutting_Layout_Rev AS INT),
            Target.[Program Cutting No.]   = Source.Program_cutting_No,
            Target.[Holder Maker]          = Source.Holder_Maker,
            Target.[DateTime_Record]       = GETDATE(),
            Target.[Fac]                   = Source.Fac,
            Target.[Required_Cutting_QTY]  = Source.Required_Cutting_QTY,
            Target.[Required_Holder_QTY]   = Source.Required_Holder_QTY,
            Target.[Recorder_ID_Internal]  = @Recorder_ID_Internal
        WHEN NOT MATCHED BY TARGET THEN INSERT
        (
            [Cutting_ID], [Setup_ID], [Division_Id], [Part_Id],
            [Process], [MC_Group_Id], [DwgRev], [DwgUpdate],
            [Usage_pcs], [CT_sec], [Position], [Res.],
            [Date update], [Insert Maker], [Conner], [Usage/Conner],
            [Cutting Layout No.], [Cutting Layout Rev.], [Program Cutting No.],
            [Position_Code], [Holder Maker], [DateTime_Record],
            [Process_Id], [Fac], [Required_Cutting_QTY], [Required_Holder_QTY],
            [Recorder_ID_Internal]
        )
        VALUES
        (
            Source.Cutting_ID,
            Source.Setup_ID,
            2,
            Source.Part_Id,
            Source.Process,
            Source.MC_Group_Id,
            Source.DwgRev,
            CASE WHEN ISNUMERIC(Source.DwgUpdate) = 1 AND Source.DwgUpdate NOT LIKE '%[^0-9]%'
                 THEN CONVERT(NVARCHAR(50), DATEADD(DAY, TRY_CAST(Source.DwgUpdate AS INT), '1899-12-30'), 23)
                 ELSE Source.DwgUpdate END,
            Source.Usage_pcs,
            TRY_CAST(Source.CT_sec AS DECIMAL(10,2)),
            Source.[Position],
            Source.Res,
            CASE WHEN ISNUMERIC(Source.Date_update) = 1 AND Source.Date_update NOT LIKE '%[^0-9]%'
                 THEN CONVERT(NVARCHAR(50), DATEADD(DAY, TRY_CAST(Source.Date_update AS INT), '1899-12-30'), 23)
                 ELSE Source.Date_update END,
            Source.Insert_Maker,
            TRY_CAST(Source.Conner AS INT),
            TRY_CAST(Source.Usage_Conner AS INT),
            Source.Cutting_Layout_No,
            TRY_CAST(Source.Cutting_Layout_Rev AS INT),
            Source.Program_cutting_No,
            Source.Position_Code,
            Source.Holder_Maker,
            GETDATE(),
            Source.Process_Id,
            Source.Fac,
            Source.Required_Cutting_QTY,
            Source.Required_Holder_QTY,
            @Recorder_ID_Internal
        );

        -- ============================================================
        -- STEP 5: Commit and return skipped unmatched rows
        -- ============================================================
        COMMIT TRANSACTION;

        SELECT PartNo, Process, MC, ExcelRow
        FROM #TempUnmatched
        ORDER BY ExcelRow;

        DROP TABLE IF EXISTS #TempRaw;
        DROP TABLE IF EXISTS #TempMapped;
        DROP TABLE IF EXISTS #TempAggregated;
        DROP TABLE IF EXISTS #TempUnmatched;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DROP TABLE IF EXISTS #TempRaw;
        DROP TABLE IF EXISTS #TempMapped;
        DROP TABLE IF EXISTS #TempAggregated;
        DROP TABLE IF EXISTS #TempUnmatched;

        THROW;
    END CATCH
END
