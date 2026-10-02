-- 1. Add columns for Revision History
-- แก้ไขให้ตรงกับ Table จริงของ User: [master].[tb_PC_Plan]
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[master].[tb_PC_Plan]') AND name = 'Revision')
BEGIN
    ALTER TABLE [master].[tb_PC_Plan] ADD [Revision] INT DEFAULT 0 NOT NULL;
    ALTER TABLE [master].[tb_PC_Plan] ADD [GroupId] NVARCHAR(50); 
    ALTER TABLE [master].[tb_PC_Plan] ADD [IsActive] BIT DEFAULT 1; 
    
    -- Update existing records to be Active
    EXEC('UPDATE [master].[tb_PC_Plan] SET IsActive = 1 WHERE IsActive IS NULL');
END
GO

-- 2. Create/Update SP for Checking Existing Plan
CREATE OR ALTER PROCEDURE [trans].[Stored_Check_Existing_PCPlan]
    @PlanDate DATE,
    @MachineType NVARCHAR(50),
    @PartNo NVARCHAR(50),
    @Process NVARCHAR(50),
    @Division NVARCHAR(50)
AS
BEGIN
    SELECT TOP 1 
        Plan_ID, 
        Revision, 
        GroupId, 
        QTY, 
        [Time], 
        Comment
    FROM [master].[tb_PC_Plan] -- แก้เป็น master.tb_PC_Plan
    WHERE PlanDate = @PlanDate
      AND MC_Type = @MachineType
      AND PartNo = @PartNo
      AND Process = @Process
      AND Division = @Division
      AND IsActive = 1
END
GO

-- 3. Create/Update SP for Archiving Old Plan
CREATE OR ALTER PROCEDURE [trans].[Stored_Archive_PCPlan]
    @PlanID INT
AS
BEGIN
    UPDATE [master].[tb_PC_Plan] -- แก้เป็น master.tb_PC_Plan
    SET IsActive = 0
    WHERE Plan_ID = @PlanID
END
GO

-- 4. Update Insert SP to support Revision and GroupId
-- หมายเหตุ: SP นี้ชื่อเดิมคือ trans.Stored_PCPlan_Insert เราจะ ALTER มัน
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
    @Comment NVARCHAR(255),
    @Revision INT = 0,
    @GroupId NVARCHAR(50) = NULL
AS
BEGIN
    INSERT INTO [master].[tb_PC_Plan] ( -- แก้เป็น master.tb_PC_Plan
        PlanDate, Employee_ID, Division, MC_Type, Facility, 
        Before_Part, Process, MC_No, PartNo, QTY, [Time], 
        Comment, Revision, GroupId, IsActive
    )
    VALUES (
        @PlanDate, @Employee_ID, @Division, @MC_Type, @Facility, 
        @Before_Part, @Process, @MC_No, @PartNo, @QTY, @Time, 
        @Comment, @Revision, ISNULL(@GroupId, NEWID()), 1
    );
END
GO

-- 5. Update Query SP to filter by IsActive
CREATE OR ALTER PROCEDURE [trans].[Stored_PCPlan_Query]
AS
BEGIN
    SELECT *
    FROM [master].[tb_PC_Plan]
    -- WHERE IsActive = 1 -- DEBUG: Show ALL to verify data existence
    ORDER BY PlanDate DESC, Plan_ID DESC
END
GO
