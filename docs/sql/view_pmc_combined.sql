-- =============================================
-- VIEW PMC COMBINED (เหมือน GM + Division Info)
-- =============================================

USE [db_Tooling]
GO

CREATE VIEW [viewer].[View_Master_Tooling_PMC_Combined]
AS
SELECT 
    -- Division Info
    D.[Division_Id],
    D.[Profit_Center],
    D.[Division_Name],
    
    -- Cutting columns
    C.PartNo,
    C.ItemNo,
    SPC.Spec,
    C.Process,
    C.MC,
    C.DwgRev,
    C.DwgUpdate,
    C.Usage_pcs,
    C.CT_sec,
    C.[Position],
    C.[Res.] AS Res,
    C.[Date update] AS Date_update,
    C.[Insert Maker] AS Insert_Maker,
    C.[Conner],
    C.[Usage/Conner] AS Usage_Conner,
    C.[Cutting Layout No.] AS Cutting_Layout_No,
    C.[Cutting Layout Rev.] AS Cutting_Layout_Rev,
    C.[Program Cutting No.] AS Program_cutting_No,
    C.[Position_Code],
    
    -- Setup columns
    SPH.Spec AS Holder_Spec,
    S.[Holder No] AS Holder_No,
    S.[Holder Maker] AS Holder_Maker

FROM [master].[tb_Master_CuttingTool_PMC] C
-- ใช้ Mapping เชื่อม Cutting กับ Setup
LEFT JOIN [master].[tb_Mapping_Cutting_Setup] M 
    ON C.Cutting_ID = M.Cutting_ID 
    AND M.Division_Id = 2
LEFT JOIN [master].[tb_Master_SetupTool_PMC] S 
    ON M.Setup_ID = S.Setup_ID
-- Spec tables
LEFT JOIN [master].[tb_Spec_ALL] SPC ON C.Spec_ID = SPC.Spec_ID
LEFT JOIN [master].[tb_Spec_ALL] SPH ON S.Spec_ID = SPH.Spec_ID
-- Division Info
LEFT JOIN [viewer].[View_tb_Division_For_Project_Request] D 
    ON C.Division_Id = D.Division_Id
GO

PRINT 'View_Master_Tooling_PMC_Combined created successfully!'
GO
