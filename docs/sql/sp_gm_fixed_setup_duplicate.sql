-- =============================================
-- GM SP - PMC STYLE (FIXED DUPLICATE ISSUE)
-- Uses Staging_ToolingData_All
-- Division_Id = 3
-- =============================================

USE [db_Tooling]
GO

ALTER PROCEDURE [trans].[Stored_Import_Master_ToolingALL_GM]
    @BatchID UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        BEGIN TRANSACTION;

        -- ==========================================================
        -- SAFETY 1: ลบ Duplicate สำหรับ Cutting (ใช้ ItemNo)
        -- ==========================================================
        ;WITH CTE_Cutting AS (
            SELECT *, ROW_NUMBER() OVER(
                PARTITION BY PartNo, ItemNo, Process, MC 
                ORDER BY StagingAll_ID
            ) as rn
            FROM [master].[Staging_ToolingData_All]
            WHERE BatchID = @BatchID AND ItemNo IS NOT NULL
        )
        DELETE FROM CTE_Cutting WHERE rn > 1;

        -- ==========================================================
        -- SAFETY 2: ลบ Duplicate สำหรับ Setup (ใช้ Holder_No)
        -- Note: ทำหลัง Cutting เพราะอาจมี Holder_No ซ้ำแต่ ItemNo ต่าง
        -- ==========================================================
        -- ไม่ลบจริง เพราะจะกระทบข้อมูล Cutting
        -- แต่ใช้ CTE ตอน INSERT แทน

        -- ==========================================================
        -- PART 0: AUTO-CREATE SPEC
        -- ==========================================================
        INSERT INTO [master].[tb_Spec_ALL] ([Spec], [ItemNo], [RecordDate], [Division_Id])
        SELECT DISTINCT 
            ISNULL(S.Spec, S.ItemNo), 
            S.ItemNo,
            GETDATE(), 
            3
        FROM [master].[Staging_ToolingData_All] S
        WHERE S.BatchID = @BatchID
          AND S.ItemNo IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM [master].[tb_Spec_ALL] A 
              WHERE A.ItemNo = S.ItemNo AND A.Division_Id = 3
          );

        INSERT INTO [master].[tb_Spec_ALL] ([Spec], [ItemNo], [RecordDate], [Division_Id])
        SELECT DISTINCT 
            ISNULL(S.Holder_Spec, S.Holder_No), 
            S.Holder_No,
            GETDATE(), 
            3
        FROM [master].[Staging_ToolingData_All] S
        WHERE S.BatchID = @BatchID
          AND S.Holder_No IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM [master].[tb_Spec_ALL] A 
              WHERE A.ItemNo = S.Holder_No AND A.Division_Id = 3
          );

        -- ==========================================================
        -- PART 1: UPDATE CUTTING 
        -- ==========================================================
        UPDATE T
        SET 
            T.Spec_ID = SPC.Spec_ID,
            T.DwgRev = S.DwgRev,
            T.DwgUpdate = CASE 
                WHEN ISNUMERIC(S.DwgUpdate) = 1 AND S.DwgUpdate NOT LIKE '%[^0-9]%' 
                THEN CONVERT(VARCHAR(20), DATEADD(DAY, TRY_CAST(S.DwgUpdate AS INT), '1899-12-30'), 23)
                ELSE S.DwgUpdate 
            END,
            T.Usage_pcs = S.Usage_pcs,
            T.CT_sec = TRY_CAST(S.CT_sec AS DECIMAL(10,2)),
            T.[Position] = S.[Position],
            T.[Res.] = S.Res,
            T.[Date update] = CASE 
                WHEN ISNUMERIC(S.Date_update) = 1 AND S.Date_update NOT LIKE '%[^0-9]%' 
                THEN CONVERT(VARCHAR(20), DATEADD(DAY, TRY_CAST(S.Date_update AS INT), '1899-12-30'), 23)
                ELSE S.Date_update 
            END,
            T.[Insert Maker] = S.Insert_Maker,
            T.[Conner] = TRY_CAST(S.Conner AS INT),
            T.[Usage/Conner] = TRY_CAST(S.Usage_Conner AS INT),
            T.[Cutting Layout No.] = S.Cutting_Layout_No,
            T.[Cutting Layout Rev.] = TRY_CAST(S.Cutting_Layout_Rev AS INT),
            T.[Program Cutting No.] = S.Program_cutting_No,
            T.[Position_Code] = S.Position_Code
        FROM [master].[tb_Master_CuttingTool_GM] T
        INNER JOIN [master].[Staging_ToolingData_All] S ON 
            T.PartNo = S.PartNo AND T.ItemNo = S.ItemNo AND T.Process = S.Process AND T.MC = S.MC
        LEFT JOIN [master].[tb_Spec_ALL] SPC 
            ON S.ItemNo = SPC.ItemNo AND SPC.Division_Id = 3
        WHERE S.BatchID = @BatchID;

        -- ==========================================================
        -- PART 2: UPDATE SETUP
        -- ==========================================================
        UPDATE T
        SET 
            T.Spec_ID = SPC.Spec_ID, 
            T.[Holder Maker] = S.Holder_Maker,
            T.[DateTime_Record] = GETDATE()
        FROM [master].[tb_Master_SetupTool_GM] T
        INNER JOIN [master].[Staging_ToolingData_All] S ON 
            T.PartNo = S.PartNo AND T.[Holder No] = S.Holder_No AND T.Process = S.Process AND T.MC = S.MC
        LEFT JOIN [master].[tb_Spec_ALL] SPC 
            ON S.Holder_No = SPC.ItemNo AND SPC.Division_Id = 3
        WHERE S.BatchID = @BatchID;

        -- ==========================================================
        -- PART 3: INSERT CUTTING
        -- ==========================================================
        INSERT INTO [master].[tb_Master_CuttingTool_GM]
        ([PartNo], [ItemNo], [Spec_ID], [Process], [MC], [DwgRev], [DwgUpdate], [Usage_pcs], [CT_sec], 
         [Position], [Res.], [Date update], [Insert Maker], [Conner], [Usage/Conner], [Cutting Layout No.], 
         [Cutting Layout Rev.], [Program Cutting No.], [Division_Id], [Position_Code])
        SELECT 
            STG.[PartNo], STG.[ItemNo], SPC.[Spec_ID], STG.[Process], STG.[MC], 
            STG.[DwgRev], 
            CASE 
                WHEN ISNUMERIC(STG.[DwgUpdate]) = 1 AND STG.[DwgUpdate] NOT LIKE '%[^0-9]%' 
                THEN CONVERT(VARCHAR(20), DATEADD(DAY, TRY_CAST(STG.[DwgUpdate] AS INT), '1899-12-30'), 23)
                ELSE STG.[DwgUpdate]
            END,
            STG.[Usage_pcs],
            TRY_CAST(STG.[CT_sec] AS DECIMAL(10,2)), 
            STG.[Position], STG.[Res], 
            CASE 
                WHEN ISNUMERIC(STG.[Date_update]) = 1 AND STG.[Date_update] NOT LIKE '%[^0-9]%' 
                THEN CONVERT(VARCHAR(20), DATEADD(DAY, TRY_CAST(STG.[Date_update] AS INT), '1899-12-30'), 23)
                ELSE STG.[Date_update]
            END,
            STG.[Insert_Maker], 
            TRY_CAST(STG.[Conner] AS INT), TRY_CAST(STG.[Usage_Conner] AS INT), 
            STG.[Cutting_Layout_No], TRY_CAST(STG.[Cutting_Layout_Rev] AS INT), 
            STG.[Program_cutting_No], 
            3, 
            STG.[Position_Code]
        FROM [master].[Staging_ToolingData_All] STG
        LEFT JOIN [master].[tb_Spec_ALL] SPC 
            ON STG.[ItemNo] = SPC.[ItemNo] AND SPC.Division_Id = 3
        WHERE STG.BatchID = @BatchID
          AND STG.ItemNo IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM [master].[tb_Master_CuttingTool_GM] T
            WHERE T.PartNo = STG.PartNo AND T.ItemNo = STG.ItemNo AND T.Process = STG.Process AND T.MC = STG.MC);

        -- ==========================================================
        -- PART 4: INSERT SETUP (ใช้ CTE เพื่อกรอง Holder_No ซ้ำ)
        -- ==========================================================
        ;WITH UniqueSetup AS (
            SELECT 
                STG.[PartNo], STG.[Holder_No], STG.[Holder_Maker], STG.[Process], STG.[MC],
                SPC.[Spec_ID],
                ROW_NUMBER() OVER(
                    PARTITION BY STG.PartNo, STG.Holder_No, STG.Process, STG.MC
                    ORDER BY STG.StagingAll_ID
                ) as rn
            FROM [master].[Staging_ToolingData_All] STG
            LEFT JOIN [master].[tb_Spec_ALL] SPC 
                ON STG.[Holder_No] = SPC.[ItemNo] AND SPC.Division_Id = 3
            WHERE STG.BatchID = @BatchID AND STG.[Holder_No] IS NOT NULL
        )
        INSERT INTO [master].[tb_Master_SetupTool_GM]
        ([PartNo], [Holder No], [Spec_ID], [Holder Maker], [Process], [MC], [DateTime_Record], [Division_Id])
        SELECT 
            U.[PartNo], U.[Holder_No], U.[Spec_ID], U.[Holder_Maker], U.[Process], U.[MC], 
            GETDATE(), 
            3
        FROM UniqueSetup U
        WHERE U.rn = 1  -- เอาแค่ row แรกของแต่ละ Holder_No
        AND NOT EXISTS (SELECT 1 FROM [master].[tb_Master_SetupTool_GM] T
            WHERE T.PartNo = U.PartNo AND T.[Holder No] = U.Holder_No AND T.Process = U.Process AND T.MC = U.MC);

        -- ==========================================================
        -- PART 5: AUTO-MAPPING
        -- ==========================================================
        INSERT INTO [master].[tb_Mapping_Cutting_Setup] 
        ([Cutting_ID], [Setup_ID], [Division_Id], [CreatedDate])
        SELECT DISTINCT
            C.Cutting_ID,
            S.Setup_ID,
            3,
            GETDATE()
        FROM [master].[Staging_ToolingData_All] STG
        INNER JOIN [master].[tb_Master_CuttingTool_GM] C 
            ON STG.PartNo = C.PartNo 
            AND STG.ItemNo = C.ItemNo 
            AND STG.Process = C.Process 
            AND STG.MC = C.MC
        INNER JOIN [master].[tb_Master_SetupTool_GM] S 
            ON STG.PartNo = S.PartNo 
            AND STG.Holder_No = S.[Holder No] 
            AND STG.Process = S.Process 
            AND STG.MC = S.MC
        WHERE STG.BatchID = @BatchID
        AND NOT EXISTS (
            SELECT 1 FROM [master].[tb_Mapping_Cutting_Setup] M 
            WHERE M.Cutting_ID = C.Cutting_ID 
              AND M.Setup_ID = S.Setup_ID 
              AND M.Division_Id = 3
        );

        -- ==========================================================
        -- PART 6: CLEANUP STAGING
        -- ==========================================================
        DELETE FROM [master].[Staging_ToolingData_All]
        WHERE BatchID = @BatchID;

        COMMIT TRANSACTION;
        
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
