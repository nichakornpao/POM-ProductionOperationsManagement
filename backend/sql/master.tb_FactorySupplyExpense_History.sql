USE [db_Cost_Data_Centralized]
GO

/****** Object:  Table [master].[tb_FactorySupplyExpense_History]    Script Date: 1/16/2026 8:41:21 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[master].[tb_FactorySupplyExpense_History]') AND type in (N'U'))
BEGIN
CREATE TABLE [master].[tb_FactorySupplyExpense_History](
	[ID_FacSupplyEx] [int] IDENTITY(1,1) NOT NULL,
	[DIVISION] [nvarchar](50) NOT NULL,
	[DEPARTMENT] [nvarchar](50) NOT NULL,
	[ITEM_NO] [nvarchar](50) NOT NULL,
	[ITEM_NAME] [nvarchar](50) NOT NULL,
	[SPEC] [nvarchar](50) NOT NULL,
	[PO_NO] [nvarchar](50) NULL,
	[MO_NO] [nvarchar](50) NULL,
	[ACCOUNT_CODE] [nvarchar](50) NULL,
	[QUANTITY] [int] NOT NULL,
	[AMOUNT] [float] NOT NULL,
	[VENDOR] [nvarchar](50) NULL,
	[VENDOR_NAME] [nvarchar](50) NULL,
	[DOCUMENT_NO] [nvarchar](50) NULL,
	[TRANSACTION_DATE] [datetime] NOT NULL,
	[ORGANIZE_CODE] [nvarchar](50) NULL,
	[ORGANIZE_NAME] [nvarchar](50) NULL,
	[DATA_TYPE] [nvarchar](50) NOT NULL,
	[DATA_GROUP] [nvarchar](50) NOT NULL,
	[REPLY_DATE] [nvarchar](50) NOT NULL,
	[LAST_UPDATE_OPERATOR] [nvarchar](50) NOT NULL,
	[DESC] [nvarchar](50) NULL,
	[Record_Datetime] [datetime] NULL
) ON [PRIMARY]
END
GO

IF NOT EXISTS (SELECT * FROM sys.default_constraints WHERE object_id = OBJECT_ID(N'[master].[DF_tb_FactorySupplyExpense_History_Record_Datetime]') AND parent_object_id = OBJECT_ID(N'[master].[tb_FactorySupplyExpense_History]'))
BEGIN
ALTER TABLE [master].[tb_FactorySupplyExpense_History] ADD  CONSTRAINT [DF_tb_FactorySupplyExpense_History_Record_Datetime]  DEFAULT (getdate()) FOR [Record_Datetime]
END
GO
