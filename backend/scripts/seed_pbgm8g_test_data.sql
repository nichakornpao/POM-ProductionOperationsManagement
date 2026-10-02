-- ====================================================================
-- SQL Seed Script: Create & Populate TestIssueAs400 on pbgm8g
-- Database: RequestindirrecMaterial
-- Table: dbo.TestIssueAs400
-- Purpose: Mock data for ISSUE AS400 Dry Run testing
-- Safety: Does NOT touch pbp155 / db_Tooling in any way
-- ====================================================================

USE [RequestindirrecMaterial];
GO

-- 1. Create table if it does not exist
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TestIssueAs400' AND TABLE_SCHEMA = 'dbo')
BEGIN
    CREATE TABLE [dbo].[TestIssueAs400] (
        [ID_Request]       INT IDENTITY(1,1) PRIMARY KEY,
        [Public_Id]        NVARCHAR(50) NOT NULL,
        [Division]         NVARCHAR(10) NULL,
        [PartNo]           NVARCHAR(100) NULL,
        [ItemNo]           NVARCHAR(100) NULL,
        [MFGOrderNo]       NVARCHAR(100) NULL,
        [DocNo]            NVARCHAR(100) NULL,
        [MatLot]           NVARCHAR(100) NULL,
        [Stock_Location]   NVARCHAR(50) NULL,
        [QTY]              INT NULL DEFAULT 0,
        [MCType]           NVARCHAR(50) NULL,
        [MCNo]             NVARCHAR(50) NULL,
        [Status]           NVARCHAR(50) NULL DEFAULT 'Complete',
        [AS400STATUS]      NVARCHAR(50) NULL DEFAULT 'Pending',
        [IssueQTY]         INT NULL DEFAULT 0,
        [STOCK_ON_HAND]    INT NULL DEFAULT 0,
        [DateComplete]     DATETIME NULL,
        [DateTime_Record]  DATETIME NULL DEFAULT GETDATE(),
        [Remark]           NVARCHAR(255) NULL
    );
    PRINT 'Table [dbo].[TestIssueAs400] created successfully.';
END
ELSE
BEGIN
    PRINT 'Table [dbo].[TestIssueAs400] already exists. Skipping creation.';
END
GO

-- 2. Clear existing test data and re-seed
DELETE FROM [dbo].[TestIssueAs400] WHERE Public_Id LIKE 'TEST-%';
GO

-- 3. Insert 7 mock test items
INSERT INTO [dbo].[TestIssueAs400] 
    ([Public_Id], [Division], [PartNo], [ItemNo], [MFGOrderNo], [DocNo], [MatLot], [Stock_Location], [QTY], [STOCK_ON_HAND], [MCType], [MCNo], [Status], [AS400STATUS], [DateComplete], [Remark])
VALUES 
    ('TEST-001', '71DZ', 'TEST-PART-A01', 'P999901 (TEST)', 'TEST-MFG-01', 'TEST-DOC-001', 'LOT-TEST-01', 'TEST-LOC-A1', 2,  20, 'BM165', '415', 'Complete', 'Pending', GETDATE(), 'Mock Test Item 1'),
    ('TEST-002', '71DZ', 'TEST-PART-B02', 'P999902 (TEST)', 'TEST-MFG-02', 'TEST-DOC-002', 'LOT-TEST-02', 'TEST-LOC-B2', 5,  15, 'BM165', '415', 'Complete', 'Pending', GETDATE(), 'Mock Test Item 2'),
    ('TEST-003', '71DZ', 'TEST-PART-C03', 'P999903 (TEST)', 'TEST-MFG-03', 'TEST-DOC-003', 'LOT-TEST-03', 'TEST-LOC-C3', 3,  10, 'M32',   '2',   'Complete', 'Pending', GETDATE(), 'Mock Test Item 3'),
    ('TEST-004', '71DZ', 'TEST-PART-D04', 'P999904 (TEST)', 'TEST-MFG-04', 'TEST-DOC-004', 'LOT-TEST-04', 'TEST-LOC-D4', 8,  25, 'M32',   '3',   'Complete', 'Pending', GETDATE(), 'Mock Test Item 4'),
    ('TEST-005', '71DZ', 'TEST-PART-E05', 'P999905 (TEST)', 'TEST-MFG-05', 'TEST-DOC-005', 'LOT-TEST-05', 'TEST-LOC-E5', 10, 50, 'M32',   '5',   'Complete', 'Pending', GETDATE(), 'Mock Test Item 5'),
    ('TEST-006', '71DZ', 'TEST-PART-F06', 'P999906 (TEST)', 'TEST-MFG-06', 'TEST-DOC-006', 'LOT-TEST-06', 'TEST-LOC-F6', 4,  30, 'BM165', '416', 'Complete', 'Pending', GETDATE(), 'Mock Test Item 6'),
    ('TEST-007', '71DZ', 'TEST-PART-G07', 'P999907 (TEST)', 'TEST-MFG-07', 'TEST-DOC-007', 'LOT-TEST-07', 'TEST-LOC-G7', 12, 12, 'BM165', '417', 'Complete', 'Pending', GETDATE(), 'Mock Test Item 7');
GO

-- 4. Verify
SELECT * FROM [dbo].[TestIssueAs400];
GO

PRINT '✅ Seed complete: 7 mock test items inserted into [RequestindirrecMaterial].[dbo].[TestIssueAs400]';
GO
