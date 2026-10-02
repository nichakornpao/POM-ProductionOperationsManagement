USE [db_Tooling]
GO

-- =============================================
-- Author:      Jirachoke
-- Create date: 2026-03-05
-- Description: ดึงข้อมูลประวัติการสั่งซื้อทั้งหมดจาก View
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Purchase_History]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT * FROM [viewer].[View_RequestList_Complete_History];
END
GO

-- =============================================
-- Author:      Jirachoke
-- Create date: 2026-03-05
-- Description: อัปเดตสถานะคำขอ ตาม Public_Id
--              ถ้าขึ้นต้นด้วย S จะอัปเดตตาราง SetupTool
--              ถ้าไม่ใช่ จะอัปเดตตาราง CuttingTool
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_Update_Request_Status]
    @Public_Id NVARCHAR(50),
    @Status NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    IF LEFT(@Public_Id, 1) = 'S'
    BEGIN
        UPDATE [dbo].[tb_IssueSetupTool_Request_Document]
        SET Status = @Status,
            DateComplete = CASE WHEN @Status = 'Complete' THEN SYSDATETIME() ELSE DateComplete END,
            AS400STATUS = CASE WHEN @Status = 'Complete' THEN 'Pending' ELSE AS400STATUS END
        WHERE Public_Id = @Public_Id;
    END
    ELSE
    BEGIN
        UPDATE [dbo].[tb_IssueCuttingTool_Request_Document]
        SET Status = @Status,
            DateComplete = CASE WHEN @Status = 'Complete' THEN SYSDATETIME() ELSE DateComplete END,
            AS400STATUS = CASE WHEN @Status = 'Complete' THEN 'Pending' ELSE AS400STATUS END
        WHERE Public_Id = @Public_Id;
    END
END
GO
