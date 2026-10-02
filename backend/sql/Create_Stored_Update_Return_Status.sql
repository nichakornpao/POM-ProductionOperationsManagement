USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Author:		<Author,,Name>
-- Create date: <Create Date,,>
-- Description:	อัปเดตสถานะ (Status) ของรายการคืนสินค้า (Return List)
--              เมื่อกดปุ่ม OK หรือ Complete จากหน้าเว็บ
-- =============================================
CREATE PROCEDURE [trans].[Stored_Update_Return_Status]
	@Return_ID INT,
	@Status NVARCHAR(50)
AS
BEGIN
	SET NOCOUNT ON;

	UPDATE [master].[tb_Return_List]
	SET 
		Status = @Status,
		DateComplete = CASE WHEN @Status = 'Complete' THEN GETDATE() ELSE DateComplete END
	WHERE Return_ID = @Return_ID;

END
GO
