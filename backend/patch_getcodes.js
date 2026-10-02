const fs = require('fs');
const path = './src/controllers/DetailPurchaseRequestlist.controller.js';
let content = fs.readFileSync(path, 'utf8');

const target = \    res.status(200).json(items);\;

const repl = \
    // Inject mock items for UI testing of alternative codes
    const mockItems = [
      { ItemNo: 'P5610006', ItemName: 'GUIDE BUSH', SPEC: '13.0 BW12-C323J', MAIN_LOCATION: 'STORE', ON_HAND: 15, ACCOUNT: 'MOCK', Division_Id: 2 },
      { ItemNo: 'P5610006N', ItemName: 'GUIDE BUSH', SPEC: '13.0 BW12-C323J', MAIN_LOCATION: 'STORE', ON_HAND: 5, ACCOUNT: 'MOCK', Division_Id: 2 },
      { ItemNo: 'P5610006NC1', ItemName: 'GUIDE BUSH', SPEC: '13.0 BW12-C323J', MAIN_LOCATION: 'STORE', ON_HAND: 2, ACCOUNT: 'MOCK', Division_Id: 2 },
      
      { ItemNo: 'PBQ0005', ItemName: 'SPINDLE COLLET', SPEC: '24.0 9017E', MAIN_LOCATION: 'STORE', ON_HAND: 10, ACCOUNT: 'MOCK', Division_Id: 2 },
      { ItemNo: 'PBQ0005A', ItemName: 'SPINDLE COLLET', SPEC: '24.0 9017E', MAIN_LOCATION: 'STORE', ON_HAND: 20, ACCOUNT: 'MOCK', Division_Id: 2 },
      
      { ItemNo: 'PMA03213', ItemName: 'PICK UP COLLET', SPEC: 'TPMA-19CL', MAIN_LOCATION: 'STORE', ON_HAND: 8, ACCOUNT: 'MOCK', Division_Id: 2 },
      { ItemNo: 'PMA03213A', ItemName: 'PICK UP COLLET', SPEC: 'TPMA-19CL', MAIN_LOCATION: 'STORE', ON_HAND: 12, ACCOUNT: 'MOCK', Division_Id: 2 },
      
      { ItemNo: 'P122258', ItemName: 'MOCK', SPEC: 'MOCK', MAIN_LOCATION: 'STORE', ON_HAND: 5, ACCOUNT: 'MOCK', Division_Id: 2 },
      { ItemNo: 'P122258NC1', ItemName: 'MOCK', SPEC: 'MOCK', MAIN_LOCATION: 'STORE', ON_HAND: 3, ACCOUNT: 'MOCK', Division_Id: 2 },
      
      { ItemNo: 'P122043B', ItemName: 'MOCK', SPEC: 'MOCK', MAIN_LOCATION: 'STORE', ON_HAND: 90, ACCOUNT: 'MOCK', Division_Id: 2 },
      { ItemNo: 'P122043NC1', ItemName: 'MOCK', SPEC: 'MOCK', MAIN_LOCATION: 'STORE', ON_HAND: 2, ACCOUNT: 'MOCK', Division_Id: 2 }
    ];
    
    mockItems.forEach(mock => {
      const idx = items.findIndex(it => it.ItemNo === mock.ItemNo);
      if (idx >= 0) {
        items[idx] = mock;
      } else {
        items.push(mock);
      }
    });

    res.status(200).json(items);\;

content = content.replace(target, repl);
fs.writeFileSync(path, content, 'utf8');
