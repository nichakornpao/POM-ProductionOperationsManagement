-- =============================================
-- Script to RESTORE Original PC Plan Stored Procedures
-- Run this to revert all Revision/SmartMatch logic
-- =============================================

USE [db_Tooling]
GO

-- 1. Restore Insert SP (Simple Insert)
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Insert]
    @PlanDate DATE,
    @Employee_ID NVARCHAR(50),
    @Division NVARCHAR(50),
    @MC_Type NVARCHAR(50),
    @Facility NVARCHAR(50),
    @Before_Part NVARCHAR(50),
    @Process NVARCHAR(50),
    @MC_No NVARCHAR(50),
    @PartNo NVARCHAR(50),
    @QTY FLOAT,
    @Time INT,
    @Comment NVARCHAR(255)
    -- Revision, GroupId, IsActive removed
AS
BEGIN
    INSERT INTO [master].[tb_PC_Plan] (
        PlanDate, Employee_ID, Division, MC_Type, Facility, 
        Before_Part, Process, MC_No, PartNo, QTY, [Time], Comment
    )
    VALUES (
        @PlanDate, @Employee_ID, @Division, @MC_Type, @Facility, 
        @Before_Part, @Process, @MC_No, @PartNo, @QTY, @Time, @Comment
    );
END
GO

-- 2. Restore Query SP (Simple Select, No Filters)
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Query]
AS
BEGIN
    SELECT *
    FROM [master].[tb_PC_Plan]
    ORDER BY PlanDate DESC, Plan_ID DESC
END
GO

-- 3. Restore Delete SP (Hard Delete)
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Delete]
    @Plan_ID INT
AS
BEGIN
    DELETE FROM [master].[tb_PC_Plan]
    WHERE Plan_ID = @Plan_ID
END
GO
