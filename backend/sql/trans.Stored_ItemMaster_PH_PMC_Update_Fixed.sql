USE [db_Tooling]
GO
/****** Object:  StoredProcedure [trans].[Stored_ItemMaster_PH_PMC_Update] ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [trans].[Stored_ItemMaster_PH_PMC_Update]
    -- Key หลักสำหรับค้นหา
    @ItemNo nvarchar(50) = NULL,
    
    -- Parameters ข้อมูล
    @Division_Id int = NULL,
    @ItemName nvarchar(50) = NULL,
    @Spec_ID int = NULL,            
    @Spec nvarchar(50) = NULL,      
    @DW nvarchar(50) = NULL,
    @ClassCode nvarchar(50) = NULL,
    @ItemType nvarchar(50) = NULL,
    @Dept nvarchar(50) = NULL,
    @ProductCode nvarchar(50) = NULL,
    @SourceCode nvarchar(50) = NULL, 
    @Organisation nvarchar(50) = NULL,
    @ItemClass nvarchar(50) = NULL,
    @Commodity nvarchar(50) = NULL,
    @CL nvarchar(50) = NULL,
    @AccountCode nvarchar(50) = NULL,
    @StockType nvarchar(50) = NULL,
    @MainWH nvarchar(50) = NULL,
    @StockLoc nvarchar(50) = NULL,
    @MatL_Type nvarchar(50) = NULL,
    @StockUnit nvarchar(50) = NULL,
    @PurchaseUnit1 nvarchar(50) = NULL,
    @Conversion1 int = NULL,
    @PurchaseUnit2 nvarchar(50) = NULL,
    @Conversion2 int = NULL,
    @WC_Code nvarchar(50) = NULL,
    @ModelGroup nvarchar(50) = NULL,
    @PayDuty int = NULL,
    @Line nvarchar(50) = NULL,
    @HardAllocation nvarchar(50) = NULL,
    @ECN date = NULL,
    @OrderPolicy nvarchar(50) = NULL,
    @OrderPoint nvarchar(50) = NULL,
    @WOS nvarchar(50) = NULL,
    @SaftyCode nvarchar(50) = NULL,
    @MakerCode nvarchar(50) = NULL,
    @MakerName nvarchar(50) = NULL,
    @MakerSpec nvarchar(50) = NULL,
    @WPC_No nvarchar(50) = NULL,
    @Vendor nvarchar(50) = NULL,
    @VendorName nvarchar(50) = NULL,
    @UnitPrice float = NULL,
    @Currency nvarchar(50) = NULL,
    @PurLeadtime int = NULL,
    @Standard_Qty int = NULL,
    @BasicOrder int = NULL,
    @MaxximumOrder int = NULL,     
    @MinimumOrder int = NULL,
    @Yield decimal(10, 2) = NULL,
    @BOI_Code nvarchar(50) = NULL,
    @Remark nvarchar(50) = NULL,
    @SaftyStock int = NULL,        
    @OrderBal int = NULL,
    @Allocated int = NULL,
    @OnHand int = NULL,
    @PendingCode nvarchar(50) = NULL,
    @ReasonPending nvarchar(50) = NULL,
    @Last_Issued date = NULL,
    @Last_StockIn date = NULL,
    @Last_Maint date = NULL,
    
    -- System Info
    @Time datetime = NULL,
    @Operator nvarchar(50) = 'System Update',
    @FileName nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -------------------------------------------------------
    -- 1. Logic Spec ID
    -------------------------------------------------------
    DECLARE @Final_Spec_ID int = @Spec_ID;

    IF @Spec IS NOT NULL AND LTRIM(RTRIM(@Spec)) <> ''
    BEGIN
        DECLARE @CleanSpec nvarchar(50) = LTRIM(RTRIM(@Spec));
        DECLARE @Found_ID int = NULL;

        SELECT @Found_ID = Spec_ID FROM [master].[tb_Spec_PMC] WHERE Spec = @CleanSpec;

        IF @Found_ID IS NULL
        BEGIN
            INSERT INTO [master].[tb_Spec_PMC] (Spec) VALUES (@CleanSpec);
            SET @Found_ID = SCOPE_IDENTITY();
        END
        
        SET @Final_Spec_ID = @Found_ID;
    END

    -------------------------------------------------------
    -- 2. Update ข้อมูล (แก้ไขให้ไม่ทับข้อมูลเดิมด้วย NULL)
    -------------------------------------------------------
    UPDATE [master].[tb_Purchase_Item_Master_PMC]
    SET 
        -- ใช้ ISNULL(ค่าใหม่, ค่าเดิม) เพื่อป้องกันกรณีไม่ส่งมาแล้วเป็น NULL จะได้ไม่ไปลบค่าเดิมทิ้ง
        [Division_Id]   = ISNULL(@Division_Id, [Division_Id]), 
        
        [ItemName]      = @ItemName,
        [Spec_ID]       = @Final_Spec_ID,
        [DW]            = @DW,
        [ClassCode]     = @ClassCode,
        [ItemType]      = @ItemType,
        [Dept]          = @Dept,
        [ProductCode]   = @ProductCode,
        [Source Code]   = @SourceCode,
        [Organisation]  = @Organisation,
        [ItemClass]     = @ItemClass,
        [Commodity]     = @Commodity,
        [CL]            = @CL,
        [AccountCode]   = @AccountCode,
        [StockType]     = @StockType,
        [MainWH]        = @MainWH,
        [StockLoc]      = @StockLoc,
        [MatL_Type]     = @MatL_Type,
        [StockUnit]     = @StockUnit,
        [PurchaseUnit1] = @PurchaseUnit1,
        [Conversion1]   = @Conversion1,
        [PurchaseUnit2] = @PurchaseUnit2,
        [Conversion2]   = @Conversion2,
        [WC_Code]       = @WC_Code,
        [ModelGroup]    = @ModelGroup,
        [PayDuty]       = @PayDuty,
        [Line]          = @Line,
        [HardAllocation]= @HardAllocation,
        [ECN]           = @ECN,
        [OrderPolicy]   = @OrderPolicy,
        [OrderPoint]    = @OrderPoint,
        [WOS]           = @WOS,
        [SaftyCode]     = @SaftyCode,
        [MakerCode]     = @MakerCode,
        [MakerName]     = @MakerName,
        [MakerSpec]     = @MakerSpec,
        [WPC_No]        = @WPC_No,
        [Vendor]        = @Vendor,
        [VendorName]    = @VendorName,
        [UnitPrice]     = @UnitPrice,
        [Currency]      = @Currency,
        [PurLeadtime]   = @PurLeadtime,
        [Standard_Qty]  = @Standard_Qty,
        [BasicOrder]    = @BasicOrder,
        [MaxximumOrder] = @MaxximumOrder,
        [MinimumOrder]  = @MinimumOrder,
        [Yield]         = @Yield,
        [BOI_Code]      = @BOI_Code,
        [Remark]        = @Remark,
        [SaftyStock]    = @SaftyStock,
        [OrderBal]      = @OrderBal,
        [Allocated]     = @Allocated,
        [OnHand]        = @OnHand,
        [PendingCode]   = @PendingCode,
        [ReasonPending] = @ReasonPending,
        [Last_Issued]   = @Last_Issued,
        [Last_StockIn]  = @Last_StockIn,
        [Last_Maint]    = @Last_Maint,
        
        -- System Fields
        -- [Time] ใส่ ISNULL ไว้ ถ้าไม่ได้ส่งมาจะได้ไม่ไปล้างค่าเดิม
        [Time]          = ISNULL(@Time, [Time]), 
        
        [Operator]      = @Operator,
        [FileName]      = @FileName,
        [ModifyDate]    = GETDATE()
    WHERE [ItemNo] = @ItemNo;
END
GO
