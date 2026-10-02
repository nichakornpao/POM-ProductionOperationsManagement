const fs = require('fs');

const detailPath = 'frontend/src/app/pages/purchase/detail/detail.component.ts';
const setupPath = 'frontend/src/app/pages/purchase/detailcasesetup/detailcasesetup.component.ts';

function injectAutoAS400(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Inject PurchaseHistoryservice Import
  if (!content.includes("import { PurchaseHistoryservice }")) {
    const lastImportIndex = content.lastIndexOf("import ");
    const endOfLastImport = content.indexOf("\n", lastImportIndex) + 1;
    content = content.slice(0, endOfLastImport) +
      "import { PurchaseHistoryservice } from '../../../core/services/PurchaseHistory.service';\n" +
      content.slice(endOfLastImport);
  }

  // 2. Inject PurchaseHistoryservice into constructor
  if (!content.includes("private purchasehistory: PurchaseHistoryservice")) {
    content = content.replace(
      /constructor\s*\(/,
      "constructor(\n    private purchasehistory: PurchaseHistoryservice,"
    );
  }

  // 3. Add as400Config property and loadAS400Config method
  if (!content.includes("as400Config: any")) {
    const classBody = `
  as400Config: any = { employeeId: '', pcName: '' };
  
  loadAS400Config() {
    this.purchasehistory.getAS400Config().subscribe({
      next: (config: any) => {
        this.as400Config = config;
      },
      error: (err: any) => console.error('Failed to load AS400 Config:', err)
    });
  }
`;
    content = content.replace(
      /export class [a-zA-Z]+Component[^{]*{/,
      "$&" + classBody
    );
  }

  // 4. Call loadAS400Config in ngOnInit
  if (!content.includes("this.loadAS400Config();")) {
    // We can inject it right after `ngOnInit() {` or `ngOnInit(): void {`
    content = content.replace(
      /ngOnInit\(\)(?:\s*:\s*void)?\s*{/,
      "$& \n    this.loadAS400Config();"
    );
  }

  // 5. Inject the Auto AS400 API trigger at the end of the forkJoin in confirmItem
  const successPopupRegex = /Swal\.fire\(\{\s*icon:\s*'success',\s*title:\s*'Success',\s*text:\s*'Completed successfully'[^\)]+\)\;/;
  
  if (successPopupRegex.test(content) && !content.includes("mappedAS400Data = completeItems.map")) {
    const as400Logic = `
                      // --- AUTO AS400 TRIGGER ---
                      if (completeItems.length > 0) {
                        const d = new Date();
                        const mappedAS400Data = completeItems.map((req: any) => {
                          let warehouseVal = "";
                          const divCode = (req.Division || this.Division_ || '').toString().trim();
                          if (divCode === '7122' || divCode === 'GM') {
                            warehouseVal = "A";
                          } else if (divCode === '71DZ' || divCode === 'PMC') {
                            const isSetup = req.ToolType === 'Setup' || req.ToolingType === 'SetupTool' || (req.Public_Id && req.Public_Id.startsWith('S'));
                            const isCutting = req.ToolType === 'Cutting' || req.ToolingType === 'CuttingTool' || (req.Public_Id && req.Public_Id.startsWith('C'));
                            if (isSetup) warehouseVal = "F";
                            else if (isCutting) warehouseVal = "C";
                            else warehouseVal = "C";
                          }

                          return {
                            "ItemNo": req.ItemNo || "",
                            "ItemRevision": "",
                            "Quantity": req.QTY || 0,
                            "ON_HAND": req.ON_HAND ?? req.STOCK_ON_HAND ?? 0,
                            "DOCNo": req.DocNo || "",
                            "TransactionYear": d.getFullYear().toString(),
                            "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'),
                            "TransactionDay": d.getDate().toString().padStart(2, '0'),
                            "WareHouse": warehouseVal,
                            "StockControl": "",
                            "StockLocation": req.Stock_Location || "",
                            "MaterialLot": req.MatLot || "",
                            "Mono": (divCode === '7122' || divCode === 'GM') ? (req.MFGOrderNo || req.MFG_Order_No || "") : (req.PartNo || ""),
                            "Vendor": "",
                            "EmpID": this.as400Config.employeeId || "",
                            "Pcname": this.as400Config.pcName || "",
                            "MCNo6Digit": req.MCNo6Digit || req.MC6Digit || "",
                            "MC_No": req.MC_No || req.MCNo || "",
                            "MCType": req.MCType || "",
                            "Public_Id": req.Public_Id,
                            "isMockTest": !!this.isMockMode
                          };
                        });

                        this.purchasehistory.exportToAS400(this.Division_!, mappedAS400Data).subscribe({
                          next: (res: any) => {
                            Swal.fire({
                              icon: 'success',
                              title: 'ตัดและยิงออโต้สำเร็จ!',
                              html: 'ยิงข้อมูลเข้า <b>AS400</b> อัตโนมัติเรียบร้อยแล้ว<br/>รายการแสดงเป็น <b>DONE</b> ในหน้า ISSUE AS400 แล้วครับ!',
                              timer: 3000,
                              showConfirmButton: false
                            });
                          },
                          error: (err: any) => {
                            Swal.fire({
                              icon: 'warning',
                              title: 'ตัดสำเร็จ แต่ยิง AS400 ไม่สำเร็จ',
                              text: 'ระบบอัปเดตสถานะสำเร็จ แต่เกิดขัดข้องตอนยิงเข้า AS400 อัตโนมัติ กรุณาลองยิงใหม่ที่หน้า History',
                            });
                            console.error(err);
                          }
                        });
                      } else {
                        Swal.fire({ icon: 'success', title: 'Success', text: 'Completed successfully', timer: 1000, showConfirmButton: false });
                      }
                      // --------------------------
`;
    content = content.replace(successPopupRegex, as400Logic);
  }

  // Handle Mock Mode Success popup as well to trigger Mock AS400
  const mockSuccessPopupRegex = /Swal\.fire\(\{\s*icon:\s*'success',\s*title:\s*'ตัดจำลองสำเร็จ'[^\)]+\)\;/;
  if (mockSuccessPopupRegex.test(content) && !content.includes("Mock Auto AS400 Trigger")) {
    const mockAs400Logic = `
                        // --- Mock Auto AS400 Trigger ---
                        if (completeItems.length > 0) {
                          const d = new Date();
                          const mappedAS400Data = completeItems.map((req: any) => {
                            let warehouseVal = "";
                            const divCode = (req.Division || this.Division_ || '').toString().trim();
                            if (divCode === '7122' || divCode === 'GM') { warehouseVal = "A"; }
                            else { warehouseVal = "C"; } // simplified fallback for mock
                            return {
                              "ItemNo": req.ItemNo || "", "Quantity": req.QTY || 0, "ON_HAND": req.ON_HAND ?? req.STOCK_ON_HAND ?? 0,
                              "DOCNo": req.DocNo || "", "TransactionYear": d.getFullYear().toString(),
                              "TransactionMonth": (d.getMonth() + 1).toString().padStart(2, '0'), "TransactionDay": d.getDate().toString().padStart(2, '0'),
                              "WareHouse": warehouseVal, "MaterialLot": req.MatLot || "",
                              "Mono": (divCode === '7122' || divCode === 'GM') ? (req.MFGOrderNo || "") : (req.PartNo || ""),
                              "EmpID": this.as400Config.employeeId || "", "Pcname": this.as400Config.pcName || "",
                              "Public_Id": req.Public_Id, "isMockTest": true
                            };
                          });
                          this.purchasehistory.exportToAS400(this.Division_!, mappedAS400Data).subscribe({
                            next: (res: any) => {
                              Swal.fire({ icon: 'success', title: 'ตัดจำลองสำเร็จ (พร้อมยิง AS400 จำลอง)', text: 'ระบบตัดจำลองและจำลองยิงเข้า AS400 เรียบร้อย', timer: 2500, showConfirmButton: false });
                            },
                            error: (err: any) => console.error(err)
                          });
                        } else {
                          Swal.fire({ icon: 'success', title: 'ตัดจำลองสำเร็จ', text: 'ข้อมูลครบถ้วน ถูกตัดจำลองเข้า 8g เรียบร้อยครับ', timer: 2000, showConfirmButton: false });
                        }
`;
    content = content.replace(mockSuccessPopupRegex, mockAs400Logic);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Injected Auto AS400 logic into:', filePath);
}

try {
  injectAutoAS400(detailPath);
  injectAutoAS400(setupPath);
} catch (e) {
  console.error("Error:", e);
}
