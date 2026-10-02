-- =============================================
-- Author:      Aon(Trainee)
-- Create date: 2026-05-20
-- Description: Add Subscription column to tb_CuttingTool_Employee
--              using for email notification status
--              0 = Unsubscribed, 1 = Subscribed
-- =============================================
USE [db_Tooling]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

ALTER TABLE [dbo].[tb_CuttingTool_Employee]
ADD [Subscription] BIT NOT NULL DEFAULT 1;
GO

