const fs = require('fs');
const path = './frontend/src/app/pages/purchase/detail/detail.component.ts';
let content = fs.readFileSync(path, 'utf8');

const targetStr = \              next: () => {
                const ids = selectedItems.map(it => it.Public_Id || it.ID_Request);
                const firstItem = selectedItems[0] || item;

                this.DetailPurchase.updateStatusToComplete(ids, 'Complete', firstItem.TableType).subscribe({
                  next: (res: any) => {
                    const idSet = new Set(ids);

                    // Remove from lists\;

const replStr = \              next: () => {
                const completeItems = selectedItems.filter(it => Number(it.STOCK_ON_HAND ?? it.ON_HAND ?? 0) > 0);
                const holdItems = selectedItems.filter(it => Number(it.STOCK_ON_HAND ?? it.ON_HAND ?? 0) <= 0);

                const completeIds = completeItems.map(it => it.Public_Id || it.ID_Request);
                const holdIds = holdItems.map(it => it.Public_Id || it.ID_Request);

                const statusObservables = [];
                if (completeIds.length > 0) {
                  statusObservables.push(this.DetailPurchase.updateStatusToComplete(completeIds, 'Complete', completeItems[0].TableType));
                }
                if (holdIds.length > 0) {
                  statusObservables.push(this.DetailPurchase.updateStatusToComplete(holdIds, 'Hold', holdItems[0].TableType));
                }

                if (statusObservables.length === 0) {
                  this.isCompleting = false;
                  return;
                }

                import('rxjs').then(({ forkJoin }) => {
                  forkJoin(statusObservables).subscribe({
                    next: () => {
                      const idSet = new Set(selectedItems.map(it => it.Public_Id || it.ID_Request));

                      // Remove from lists\;

content = content.replace(targetStr, replStr);

// Also need to fix the closing brace for updateStatusToComplete
const targetEnd = \                      this.isCompleting = false;
                      this.cdr.markForCheck();
                    },
                    error: err => {
                      Swal.fire({ icon: 'error', title: 'Confirm failed', text: err?.message || 'Update status failed' });
                      this.isCompleting = false;
                      this.cdr.markForCheck();
                    }
                  });
                }
              });\;

const replEnd = \                      this.isCompleting = false;
                      this.cdr.markForCheck();
                    },
                    error: err => {
                      Swal.fire({ icon: 'error', title: 'Confirm failed', text: err?.message || 'Update status failed' });
                      this.isCompleting = false;
                      this.cdr.markForCheck();
                    }
                  });
                });
              }
            });\;

content = content.replace(targetEnd, replEnd);
fs.writeFileSync(path, content, 'utf8');
