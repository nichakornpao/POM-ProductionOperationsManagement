const fs = require('fs');
const path = './src/controllers/DetailPurchaseRequestlist.controller.js';
let content = fs.readFileSync(path, 'utf8');

const targetDetailPurchase = \      }
  
    res.json(rows);
  } catch (error) {\;

const replaceDetailPurchase = \      }
  
      // ====================================================================
      // MOCK DATA INTERCEPTION
      let testRecords = [];
      try {
        const { poolRequestIndirrecPromise } = require('../config/database');
        const indirrecTimeout = new Promise(resolve => setTimeout(() => resolve(null), 3000));
        const poolIndirrec = await Promise.race([poolRequestIndirrecPromise, indirrecTimeout]);
        
        if (poolIndirrec) {
          const countResult = await poolIndirrec.request().query(\\\
            IF OBJECT_ID('[dbo].[TestPurchaseRequestList]', 'U') IS NOT NULL 
              SELECT COUNT(*) AS cnt FROM [dbo].[TestPurchaseRequestList] WHERE Public_Id LIKE 'TEST-REQ-%' AND Status = 'Waiting'
            ELSE 
              SELECT -1 AS cnt
          \\\);
          const cnt = countResult.recordset[0].cnt;
  
          if (cnt > 0) {
            const testResult = await poolIndirrec.request().query(\\\
              SELECT 
                Public_Id, ID_Request, Req_Date AS DateTime_Record, DueDate, 
                ItemNo, PartNo, SPEC, ItemName, QTY, 
                Division, Process, Machine AS MCNo, Req_By,
                CASE WHEN Status = 'Waiting' THEN 'Waiting' ELSE Status END AS Status,
                AS400STATUS,
                ISNULL(MAIN_LOCATION, '') AS Stock_Location
              FROM [dbo].[TestPurchaseRequestList] WITH (NOLOCK)
              WHERE Status = 'Waiting'
              ORDER BY ItemNo ASC
            \\\);
    
            testRecords = testResult.recordset.map(row => ({
              ...row,
              isMockTest: true,
              dataSource: 'TestPurchaseRequestList'
            }));
          }
        }
      } catch (testErr) {
        console.warn('Failed to fetch test data for RequestList:', testErr.message);
      }
      
      const finalResult = [...testRecords, ...rows];
      res.json(finalResult);
      // ====================================================================

  } catch (error) {\;

content = content.replace(targetDetailPurchase, replaceDetailPurchase);

fs.writeFileSync(path, content, 'utf8');
