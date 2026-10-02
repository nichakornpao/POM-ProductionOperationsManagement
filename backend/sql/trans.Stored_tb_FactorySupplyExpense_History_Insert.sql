USE [db_Cost_Data_Centralized]
GO
/****** Object:  StoredProcedure [trans].[Stored_tb_FactorySupplyExpense_History_Insert]    Script Date: 1/16/2026 8:42:06 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
-- =============================================
-- Author:		<TJ080,Pattaradit,France>
-- Create date: <9/1/2026>
-- Description:	<Stored_tb_FactorySupplyExpense_History_Insert>
-- =============================================
CREATE OR ALTER PROCEDURE [trans].[Stored_tb_FactorySupplyExpense_History_Insert]
	-- Add the parameters for the stored procedure here
	  
      @_DIVISION nvarchar(50)
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
	insert into master.tb_FactorySupplyExpense_History
	([DIVISION]
      ,[DEPARTMENT]
      ,[ITEM_NO]
      ,[ITEM_NAME]
      ,[SPEC]
      ,[PO_NO]
      ,[MO_NO]
      ,[ACCOUNT_CODE]
      ,[QUANTITY]
      ,[AMOUNT]
      ,[VENDOR]
      ,[VENDOR_NAME]
      ,[DOCUMENT_NO]
      ,[TRANSACTION_DATE]
      ,[ORGANIZE_CODE]
      ,[ORGANIZE_NAME]
      ,[DATA_TYPE]
      ,[DATA_GROUP]
      ,[REPLY_DATE]
      ,[LAST_UPDATE_OPERATOR]
      ,[DESC]
	)
	values
	(@_DIVISION
      ,@_DEPARTMENT
      ,@_ITEM_NO 
      ,@_ITEM_NAME 
      ,@_SPEC 
      ,@_PO_NO 
      ,@_MO_NO 
      ,@_ACCOUNT_CODE
      ,@_QUANTITY
      ,@_AMOUNT 
      ,@_VENDOR 
      ,@_VENDOR_NAME
      ,@_DOCUMENT_NO
      ,@_TRANSACTION_DATE
      ,@_ORGANIZE_CODE
      ,@_ORGANIZE_NAME
      ,@_DATA_TYPE
      ,@_DATA_GROUP
      ,@_REPLY_DATE
      ,@_LAST_UPDATE_OPERATOR
      ,@_DESC )

END
