USE [db_Tooling]
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:      Suttichai/Trainee
-- Create date: 2026-03-09
-- Description: ดึงรายการ Tooling Request (Cutting Tool + Setup Tool) 
--              โดยเชื่อมจาก Unique_Id ของ tb_PC_Plan
--              ใช้สำหรับปุ่ม VIEW ในหน้า PlanList แท็บ PD
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Get_ToolingRequest_ByUniqueId]
    @UniqueId NVARCHAR(36) -- Raw UUID string (ไม่มี prefix PLAN-)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CastUUID UNIQUEIDENTIFIER = TRY_CAST(@UniqueId AS UNIQUEIDENTIFIER);

    -- ===== Result Set 1: Cutting Tool =====
    SELECT 
        'CuttingTool'   AS ToolType,
        [Status],
        [DueDate],
        [SPEC],
        [ItemNo],
        [Req_QTY],
        [QTY]           AS IssueQTY,
        [Remark],
        [ItemName],
        [DateComplete],
        [PartNo],
        [Process],
        [MCType],
        [MCNo],
        [Fac],
        [Requester],
        [DateTime_Record]
    FROM [dbo].[tb_IssueCuttingTool_Request_Document]
    WHERE [Unique_Id] = @CastUUID
    ORDER BY [DateTime_Record] ASC;

    -- ===== Result Set 2: Setup Tool =====
    SELECT 
        'SetupTool'     AS ToolType,
        [Status],
        [DueDate],
        [SPEC],
        [ItemNo],
        [Req_QTY],
        [QTY]           AS IssueQTY,
        [Remark],
        [ItemName],
        [DateComplete],
        [PartNo],
        [Process],
        [MCType],
        [MCNo],
        [Fac],
        [Requester],
        [DateTime_Record]
    FROM [dbo].[tb_IssueSetupTool_Request_Document]
    WHERE [Unique_Id] = @CastUUID
    ORDER BY [DateTime_Record] ASC;
END
GO
