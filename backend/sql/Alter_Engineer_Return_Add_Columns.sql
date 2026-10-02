-- ==========================================================================================
-- Migration Script: ALTER TABLE [RequestindirrecMaterial].[dbo].[Engineer_Return]
-- Purpose: Add Barcode Processing columns (RawBarcode, MCType, MCNo, PlanDate, ReturnDate, Status)
-- ==========================================================================================

USE [RequestindirrecMaterial];
GO

-- 1. Create table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Engineer_Return]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Engineer_Return] (
        [id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [DocumentID] VARCHAR(150) NULL,
        [RawBarcode] NVARCHAR(100) NULL,
        [PartNo] NVARCHAR(50) NULL,
        [MCType] NVARCHAR(20) NULL,
        [MCNo] NVARCHAR(20) NULL,
        [PlanDate] DATE NULL,
        [ReturnDate] DATETIME NULL CONSTRAINT DF_Engineer_Return_ReturnDate DEFAULT GETDATE(),
        [Status] NVARCHAR(20) NULL CONSTRAINT DF_Engineer_Return_Status DEFAULT 'Completed',
        [ActionType] VARCHAR(50) NULL CONSTRAINT DF_Engineer_Return_ActionType DEFAULT 'Return',
        [ScanTime] DATETIME NULL CONSTRAINT DF_Engineer_Return_ScanTime DEFAULT GETDATE(),
        [ScannedBy] VARCHAR(100) NULL,
        [Remarks] NVARCHAR(MAX) NULL
    );
    PRINT 'Created table [dbo].[Engineer_Return] successfully.';
END
ELSE
BEGIN
    -- 2. Alter existing table to add required columns if missing
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Engineer_Return]') AND name = 'RawBarcode')
    BEGIN
        ALTER TABLE [dbo].[Engineer_Return] ADD [RawBarcode] NVARCHAR(100) NULL;
        PRINT 'Added column [RawBarcode].';
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Engineer_Return]') AND name = 'MCType')
    BEGIN
        ALTER TABLE [dbo].[Engineer_Return] ADD [MCType] NVARCHAR(20) NULL;
        PRINT 'Added column [MCType].';
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Engineer_Return]') AND name = 'MCNo')
    BEGIN
        ALTER TABLE [dbo].[Engineer_Return] ADD [MCNo] NVARCHAR(20) NULL;
        PRINT 'Added column [MCNo].';
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Engineer_Return]') AND name = 'PlanDate')
    BEGIN
        ALTER TABLE [dbo].[Engineer_Return] ADD [PlanDate] DATE NULL;
        PRINT 'Added column [PlanDate].';
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Engineer_Return]') AND name = 'ReturnDate')
    BEGIN
        ALTER TABLE [dbo].[Engineer_Return] ADD [ReturnDate] DATETIME NULL CONSTRAINT DF_Engineer_Return_ReturnDate DEFAULT GETDATE();
        PRINT 'Added column [ReturnDate].';
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Engineer_Return]') AND name = 'Status')
    BEGIN
        ALTER TABLE [dbo].[Engineer_Return] ADD [Status] NVARCHAR(20) NULL CONSTRAINT DF_Engineer_Return_Status DEFAULT 'Completed';
        PRINT 'Added column [Status].';
    END;
END
GO
