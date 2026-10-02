USE [db_Cost_Data_Centralized]
GO
/****** Object:  StoredProcedure [trans].[Stored_tb_FactorySupplyExpense_History_Update]    Script Date: 1/16/2026 8:42:27 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- =============================================
-- Author:		<TJ080,Pattaradit,France>
-- Create date: <9/1/2026>
-- Description:	<Stored_tb_FactorySupplyExpense_History_Update>
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_tb_FactorySupplyExpense_History_Update]
	-- Add the parameters for the stored procedure here
	  @_ID_FacSupplyEx int
      ,@_DIVISION nvarchar(50)
      ,@_DEPARTMENT nvarchar(50)
      ,@_ITEM_NO nvarchar(50)
      ,@_ITEM_NAME nvarchar(50)
      ,@_SPEC nvarchar(50)
      ,@_PO_NO nvarchar(50)
      ,@_MO_NO nvarchar(50)
      ,@_ACCOUNT_CODE nvarchar(50)
      ,@_QUANTITY int
      ,@_AMOUNT float
      ,@_VENDOR nvarchar(50)
      ,@_VENDOR_NAME nvarchar(50)
      ,@_DOCUMENT_NO nvarchar(50)
      ,@_TRANSACTION_DATE datetime
      ,@_ORGANIZE_CODE nvarchar(50)
      ,@_ORGANIZE_NAME nvarchar(50)
      ,@_DATA_TYPE nvarchar(50)
      ,@_DATA_GROUP nvarchar(50)
      ,@_REPLY_DATE nvarchar(50)
      ,@_LAST_UPDATE_OPERATOR nvarchar(50)
      ,@_DESC nvarchar(50)
AS
BEGIN
	-- SET NOCOUNT ON added to prevent extra result sets from
	-- interfering with SELECT statements.
	SET NOCOUNT ON;

    -- Insert statements for procedure here
	update master.tb_FactorySupplyExpense_History
	set
	[DIVISION] = @_DIVISION
      ,[DEPARTMENT] = @_DEPARTMENT
      ,[ITEM_NO] = @_ITEM_NO 
      ,[ITEM_NAME] = @_ITEM_NAME 
      ,[SPEC] = @_SPEC
      ,[PO_NO] = @_PO_NO
      ,[MO_NO] = @_MO_NO
      ,[ACCOUNT_CODE] = @_ACCOUNT_CODE
      ,[QUANTITY] = @_QUANTITY 
      ,[AMOUNT] = @_AMOUNT 
      ,[VENDOR] = @_VENDOR
      ,[VENDOR_NAME] = @_VENDOR_NAME
      ,[DOCUMENT_NO] = @_DOCUMENT_NO
      ,[TRANSACTION_DATE] = @_TRANSACTION_DATE
      ,[ORGANIZE_CODE] = @_ORGANIZE_CODE
      ,[ORGANIZE_NAME] = @_ORGANIZE_NAME 
      ,[DATA_TYPE] = @_DATA_TYPE 
      ,[DATA_GROUP] = @_DATA_GROUP
      ,[REPLY_DATE] = @_REPLY_DATE 
      ,[LAST_UPDATE_OPERATOR] = @_LAST_UPDATE_OPERATOR 
      ,[DESC] = @_DESC 
	  ,[Record_Datetime] = getdate()
	where 
	[ID_FacSupplyEx] = @_ID_FacSupplyEx
END
