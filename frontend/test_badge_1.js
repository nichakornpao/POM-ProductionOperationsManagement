const items = [
  { ItemNo: 'N122847A' }
];

const getAvailableCodes = (item) => {
      if (!item || !item.ItemNo) return [];
      
      let baseItemNo = String(item.ItemNo).trim();
      const upperItemNo = baseItemNo.toUpperCase();
      
      let currentSuffix = '';
      if (upperItemNo.endsWith('AR')) { baseItemNo = baseItemNo.slice(0, -2); currentSuffix = 'AR'; }
      else if (upperItemNo.endsWith('NR')) { baseItemNo = baseItemNo.slice(0, -2); currentSuffix = 'NR'; }
      else if (upperItemNo.endsWith('A')) { baseItemNo = baseItemNo.slice(0, -1); currentSuffix = 'A'; }
      else if (upperItemNo.endsWith('N')) { baseItemNo = baseItemNo.slice(0, -1); currentSuffix = 'N'; }
      
      if (!currentSuffix) {
          baseItemNo = String(item.ItemNo).trim();
      }
  
      const isPMC = true;
      const divId = isPMC ? 2 : 3;
      
      const baseUpper = baseItemNo.toUpperCase();
      const list = items;
      
      const matches = list.filter((x) => {
        const xItemNo = String(x?.ItemNo).trim().toUpperCase();
        if (!xItemNo.startsWith(baseUpper)) return false;
        
        const suffix = xItemNo.replace(baseUpper, '');
        if (!['A', 'AR', 'N', 'NR'].includes(suffix)) return false;
        
        const xDivId = Number(x?.Division_Id);
        if (xDivId && xDivId !== divId) return false;
        
        return true;
      });
  
      const priority = { 'AR': 1, 'N': 2, 'NR': 3, 'A': 4 };
      
      return matches.sort((a, b) => {
        const aSuf = String(a.ItemNo).trim().toUpperCase().replace(baseUpper, '');
        const bSuf = String(b.ItemNo).trim().toUpperCase().replace(baseUpper, '');
        return (priority[aSuf] || 99) - (priority[bSuf] || 99);
      });
};

console.log("Testing N122847A: ", getAvailableCodes({ ItemNo: 'N122847A' }));
