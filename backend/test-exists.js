const fs = require('fs');

// 2 backslashes
const path2 = '\\\\pbp083\\Public\\Process Engineer\\Doc. ENG\\DWG. Control\\Pelmec Parts\\2SFR-1560X2ZZ\\Master Program - Cutting Lay out\\TURNING';
console.log('2 backslashes:', fs.existsSync(path2));

// 4 backslashes
const path4 = '\\\\\\\\pbp083\\\\Public\\\\Process Engineer\\\\Doc. ENG\\\\DWG. Control\\\\Pelmec Parts\\\\2SFR-1560X2ZZ\\\\Master Program - Cutting Lay out\\\\TURNING';
console.log('4 backslashes:', fs.existsSync(path4));
