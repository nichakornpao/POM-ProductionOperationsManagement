USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      System / Antigravity
-- Create Date: 2026-02-27
-- Description: Import Master Tooling PMC Excel data into [master].[tb_Mapping_All]
--              - Performs ID lookups (Part_Id, MC_Group_Id, Setup_ID, Cutting_ID, Process_Id)
--              - Preserves original Excel row order
--              - Handles NULL / blank data (Setup_ID = NULL when Holder_No is blank)
--              - Deduplicates on 8 keys and aggregates Required_Cutting_QTY / Required_Holder_QTY
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Import_Master_Tooling_PMC_JSON]
    @JsonData    NVARCHAR(MAX),
    @UploadedBy  NVARCHAR(100) = 'System'
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- ============================================================
        -- STEP 1: Parse JSON → #TempRaw  (preserve original row order)
        -- The backend already sends ExcelRow (1-based row index from xlsx)
        -- ============================================================
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

        INSERT INTO #TempRaw
        SELECT
            TRY_CAST(J.ExcelRow          AS INT),
            NULLIF(LTRIM(RTRIM(J.Spec)),           ''),
            NULLIF(LTRIM(RTRIM(J.PartNo)),         ''),
            NULLIF(LTRIM(RTRIM(J.ItemNo)),         ''),
            NULLIF(LTRIM(RTRIM(J.Process)),        ''),
            NULLIF(LTRIM(RTRIM(J.MC)),             ''),
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
        -- STEP 2: ID Lookups → #TempMapped
        --   All lookups use LEFT JOIN so missing matches stay NULL.
        --   Setup_ID rule: if Holder_No IS NULL → Setup_ID = NULL (naturally handled by LEFT JOIN)
        -- ============================================================
        CREATE TABLE #TempMapped (
            ExcelRow            INT,
            -- Raw text fields kept for aggregation logic & final INSERT
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
            -- Looked-up IDs
            Part_Id             INT,
            MC_Group_Id         INT,
            Setup_ID            INT,
            Cutting_ID          INT,
            Process_Id          INT
        );

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
            R.Holder_Maker,
            R.DwgRev,
            R.DwgUpdate,
            R.Usage_pcs,
            R.CT_sec,
            R.[Position],
            R.Res,
            R.Date_update,
            R.Insert_Maker,
            R.Conner,
            R.Usage_Conner,
            R.Cutting_Layout_No,
            R.Cutting_Layout_Rev,
            R.Program_cutting_No,
            R.Position_Code,
            R.Fac,
            -- Part_Id: PartNo → [db_Production_Report_PMA].[master].[tb_part_no].Part_No_ID
            PN_LOOKUP.PN_ID                         AS Part_Id,
            -- MC_Group_Id: MC → [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Group].MC_Group
            MCG_LOOKUP.MC_Group_Id                  AS MC_Group_Id,
            -- Setup_ID: Holder_No → [db_SmartCuttingTool_PMA].[viewer].[tb_Item_MasterAll_PH].ITEM_NO
            SETUP_LOOKUP.IM_Id                      AS Setup_ID,
            -- Cutting_ID: ItemNo → [db_SmartCuttingTool_PMA].[viewer].[tb_Item_MasterAll_PH].ITEM_NO
            CUT_LOOKUP.IM_Id                        AS Cutting_ID,
            -- Process_Id: Process → [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Process].Process_Name
            MP_LOOKUP.Process_Id                    AS Process_Id
        FROM #TempRaw R
        -- ── Part_Id: fuzzy match PartNo → Part_No_ID ──────────────────
        -- Priority: 1=exact, 2=Excel starts with DB, 3=DB starts with Excel
        OUTER APPLY (
            SELECT TOP 1 PN_ID
            FROM [db_Production_Report_PMA].[master].[tb_part_no]
            WHERE R.PartNo IS NOT NULL
              AND (
                    LTRIM(RTRIM(Part_No_ID)) COLLATE DATABASE_DEFAULT = R.PartNo COLLATE DATABASE_DEFAULT
                 OR R.PartNo COLLATE DATABASE_DEFAULT LIKE LTRIM(RTRIM(Part_No_ID)) + '%' COLLATE DATABASE_DEFAULT
                 OR LTRIM(RTRIM(Part_No_ID)) COLLATE DATABASE_DEFAULT LIKE R.PartNo + '%' COLLATE DATABASE_DEFAULT
              )
            ORDER BY
                CASE WHEN LTRIM(RTRIM(Part_No_ID)) COLLATE DATABASE_DEFAULT = R.PartNo COLLATE DATABASE_DEFAULT THEN 0 ELSE 1 END,
                LEN(Part_No_ID) DESC
        ) AS PN_LOOKUP
        -- ── MC_Group_Id: exact match only (MC values tend to be standardised) ─
        OUTER APPLY (
            SELECT TOP 1 MC_Group_Id
            FROM [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Group]
            WHERE R.MC IS NOT NULL
              AND LTRIM(RTRIM(MC_Group)) COLLATE DATABASE_DEFAULT = R.MC COLLATE DATABASE_DEFAULT
        ) AS MCG_LOOKUP
        -- ── Setup_ID: fuzzy match Holder_No → ITEM_NO ─────────────────
        OUTER APPLY (
            SELECT TOP 1 IM_Id
            FROM [db_SmartCuttingTool_PMA].[viewer].[tb_Item_MasterAll_PH]
            WHERE R.Holder_No IS NOT NULL
              AND (
                    LTRIM(RTRIM(ITEM_NO)) COLLATE DATABASE_DEFAULT = R.Holder_No COLLATE DATABASE_DEFAULT
                 OR R.Holder_No COLLATE DATABASE_DEFAULT LIKE LTRIM(RTRIM(ITEM_NO)) + '%' COLLATE DATABASE_DEFAULT
                 OR LTRIM(RTRIM(ITEM_NO)) COLLATE DATABASE_DEFAULT LIKE R.Holder_No + '%' COLLATE DATABASE_DEFAULT
              )
            ORDER BY
                CASE WHEN LTRIM(RTRIM(ITEM_NO)) COLLATE DATABASE_DEFAULT = R.Holder_No COLLATE DATABASE_DEFAULT THEN 0 ELSE 1 END,
                LEN(ITEM_NO) DESC
        ) AS SETUP_LOOKUP
        -- ── Cutting_ID: fuzzy match ItemNo → ITEM_NO ──────────────────
        OUTER APPLY (
            SELECT TOP 1 IM_Id
            FROM [db_SmartCuttingTool_PMA].[viewer].[tb_Item_MasterAll_PH]
            WHERE R.ItemNo IS NOT NULL
              AND (
                    LTRIM(RTRIM(ITEM_NO)) COLLATE DATABASE_DEFAULT = R.ItemNo COLLATE DATABASE_DEFAULT
                 OR R.ItemNo COLLATE DATABASE_DEFAULT LIKE LTRIM(RTRIM(ITEM_NO)) + '%' COLLATE DATABASE_DEFAULT
                 OR LTRIM(RTRIM(ITEM_NO)) COLLATE DATABASE_DEFAULT LIKE R.ItemNo + '%' COLLATE DATABASE_DEFAULT
              )
            ORDER BY
                CASE WHEN LTRIM(RTRIM(ITEM_NO)) COLLATE DATABASE_DEFAULT = R.ItemNo COLLATE DATABASE_DEFAULT THEN 0 ELSE 1 END,
                LEN(ITEM_NO) DESC
        ) AS CUT_LOOKUP
        -- ── Process_Id: exact match (Process names are standardised) ──
        OUTER APPLY (
            SELECT TOP 1 Process_Id
            FROM [db_Cost_Data_Centralized].[master].[tb_Master_Machine_Process]
            WHERE R.Process IS NOT NULL
              AND LTRIM(RTRIM(Process_Name)) COLLATE DATABASE_DEFAULT = R.Process COLLATE DATABASE_DEFAULT
        ) AS MP_LOOKUP;

        -- ============================================================
        -- STEP 3: Deduplication & Aggregation → #TempAggregated
        --
        -- Dedup keys (8):
        --   Part_Id, Cutting_ID, Process_Id, MC_Group_Id, Setup_ID,
        --   Usage_pcs, Position, Position_Code
        --
        -- Required_Cutting_QTY = COUNT(*) when Spec IS NOT NULL AND ItemNo IS NOT NULL
        --                         else 0
        -- Required_Holder_QTY  = COUNT(*) when Holder_Spec IS NOT NULL AND Holder_No IS NOT NULL
        --                         else 0
        --
        -- For non-key text fields, keep the value from the row with the lowest ExcelRow
        -- (FIRST_VALUE ordered by ExcelRow) to preserve original row order.
        -- ============================================================
        CREATE TABLE #TempAggregated (
            ExcelRow            INT,          -- min ExcelRow of the group (for final ORDER BY)
            Part_Id             INT,
            Cutting_ID          INT,
            Process_Id          INT,
            MC_Group_Id         INT,
            Setup_ID            INT,
            Usage_pcs           NVARCHAR(50),
            [Position]          NVARCHAR(50),
            Position_Code       NVARCHAR(100),
            -- Aggregated quantities
            Required_Cutting_QTY INT,
            Required_Holder_QTY  INT,
            -- Remaining fields (from earliest row in group)
            Process             NVARCHAR(100),
            DwgRev              NVARCHAR(50),
            DwgUpdate           NVARCHAR(50),
            CT_sec              NVARCHAR(50),
            Res                 NVARCHAR(50),
            Date_update         NVARCHAR(50),
            Insert_Maker        NVARCHAR(50),
            Conner              NVARCHAR(50),
            Usage_Conner        NVARCHAR(50),
            Cutting_Layout_No   NVARCHAR(100),
            Cutting_Layout_Rev  NVARCHAR(50),
            Program_cutting_No  NVARCHAR(100),
            Holder_Maker        NVARCHAR(50),
            Fac                 NVARCHAR(50),
            -- Flag fields used for QTY calc
            Has_Spec_ItemNo     BIT,
            Has_HolderSpec_HolderNo BIT
        );

        ;WITH Grouped AS (
            SELECT
                -- Dedup key columns
                Part_Id,
                Cutting_ID,
                Process_Id,
                MC_Group_Id,
                Setup_ID,
                Usage_pcs,
                [Position],
                Position_Code,
                -- Earliest row in group
                MIN(ExcelRow) AS MinExcelRow,
                -- Duplicate count
                COUNT(*) AS DupCount,
                -- Check if Spec + ItemNo present on ANY row in group (use the first non-null combination)
                MAX(CASE WHEN Spec IS NOT NULL AND ItemNo IS NOT NULL THEN 1 ELSE 0 END) AS Has_Spec_ItemNo,
                -- Check if Holder_Spec + Holder_No present on ANY row in group
                MAX(CASE WHEN Holder_Spec IS NOT NULL AND Holder_No IS NOT NULL THEN 1 ELSE 0 END) AS Has_HolderSpec_HolderNo
            FROM #TempMapped
            GROUP BY
                Part_Id,
                Cutting_ID,
                Process_Id,
                MC_Group_Id,
                Setup_ID,
                Usage_pcs,
                [Position],
                Position_Code
        ),
        FirstRow AS (
            -- Get non-key field values from the earliest row of each group
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
            -- Required_Cutting_QTY
            CASE WHEN G.Has_Spec_ItemNo = 1 THEN G.DupCount ELSE 0 END AS Required_Cutting_QTY,
            -- Required_Holder_QTY
            CASE WHEN G.Has_HolderSpec_HolderNo = 1 THEN G.DupCount ELSE 0 END AS Required_Holder_QTY,
            -- Non-key fields from first row
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
            ON  (FR.Part_Id     = G.Part_Id     OR (FR.Part_Id     IS NULL AND G.Part_Id     IS NULL))
            AND (FR.Cutting_ID  = G.Cutting_ID  OR (FR.Cutting_ID  IS NULL AND G.Cutting_ID  IS NULL))
            AND (FR.Process_Id  = G.Process_Id  OR (FR.Process_Id  IS NULL AND G.Process_Id  IS NULL))
            AND (FR.MC_Group_Id = G.MC_Group_Id OR (FR.MC_Group_Id IS NULL AND G.MC_Group_Id IS NULL))
            AND (FR.Setup_ID    = G.Setup_ID    OR (FR.Setup_ID    IS NULL AND G.Setup_ID    IS NULL))
            AND (FR.Usage_pcs   = G.Usage_pcs   OR (FR.Usage_pcs   IS NULL AND G.Usage_pcs   IS NULL))
            AND (FR.[Position]  = G.[Position]  OR (FR.[Position]  IS NULL AND G.[Position]  IS NULL))
            AND (FR.Position_Code = G.Position_Code OR (FR.Position_Code IS NULL AND G.Position_Code IS NULL))
            AND FR.rn = 1
        ;

        -- ============================================================
        -- STEP 4: UPSERT into [master].[tb_Mapping_All] via MERGE
        --         Match on the 8 dedup keys (NULL-safe comparison)
        --         WHEN MATCHED   → UPDATE non-key fields
        --         WHEN NOT MATCHED → INSERT new row
        --         ORDER BY ExcelRow ensures new rows follow original Excel sequence
        -- ============================================================
        ;WITH Ordered AS (
            SELECT * FROM #TempAggregated
        )
        MERGE [master].[tb_Mapping_All] AS Target
        USING (SELECT * FROM Ordered ORDER BY ExcelRow ASC OFFSET 0 ROWS) AS Source
        ON (
            -- NULL-safe match on all 8 dedup keys + Division_Id = 2
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
        -- ── Record already exists → UPDATE non-key fields ──────────
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
            Target.[Required_Holder_QTY]   = Source.Required_Holder_QTY
        -- ── New record → INSERT ─────────────────────────────────────
        WHEN NOT MATCHED BY TARGET THEN INSERT
        (
            [Cutting_ID], [Setup_ID], [Division_Id], [Part_Id],
            [Process], [MC_Group_Id], [DwgRev], [DwgUpdate],
            [Usage_pcs], [CT_sec], [Position], [Res.],
            [Date update], [Insert Maker], [Conner], [Usage/Conner],
            [Cutting Layout No.], [Cutting Layout Rev.], [Program Cutting No.],
            [Position_Code], [Holder Maker], [DateTime_Record],
            [Process_Id], [Fac], [Required_Cutting_QTY], [Required_Holder_QTY]
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
            Source.Required_Holder_QTY
        );

        -- ============================================================
        -- STEP 5: Drop temp tables & commit
        -- ============================================================
        DROP TABLE IF EXISTS #TempRaw;
        DROP TABLE IF EXISTS #TempMapped;
        DROP TABLE IF EXISTS #TempAggregated;

        COMMIT TRANSACTION;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DROP TABLE IF EXISTS #TempRaw;
        DROP TABLE IF EXISTS #TempMapped;
        DROP TABLE IF EXISTS #TempAggregated;

        THROW;
    END CATCH
END
GO
