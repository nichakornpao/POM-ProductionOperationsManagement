const items = [
  { ItemNo: 'HBS00183A' },
  { ItemNo: 'HBS00183N' }
];

const getAvailableCodes = (item) => {
      if (!item || !item.ItemNo) return [];
      
      // Only process if it ends with known suffixes
      let baseItemNo = item.ItemNo;
      const upperItemNo = String(item.ItemNo).trim().toUpperCase();
      
      let currentSuffix = '';
      if (upperItemNo.endsWith('AR')) { baseItemNo = item.ItemNo.slice(0, -2); currentSuffix = 'AR'; }
      else if (upperItemNo.endsWith('NR')) { baseItemNo = item.ItemNo.slice(0, -2); currentSuffix = 'NR'; }
      else if (upperItemNo.endsWith('A')) { baseItemNo = item.ItemNo.slice(0, -1); currentSuffix = 'A'; }
      else if (upperItemNo.endsWith('N')) { baseItemNo = item.ItemNo.slice(0, -1); currentSuffix = 'N'; }
      
      // We can also search if it doesn't end with A/AR/N/NR (e.g. it's just the base) but let's stick to P'Rat's standard.
      if (!currentSuffix) {
          baseItemNo = item.ItemNo;
      }
  
      // Search in local ItemNo master list
      const isPMC = String(item.Division || '71DZ').trim().toUpperCase() === '71DZ' || String(item.Division).trim().toUpperCase() === 'PMC';
      const divId = isPMC ? 2 : 3;
      
      const baseUpper = baseItemNo.toUpperCase();
      const list = items;
      
      // Filter matching items
      const matches = list.filter((x) => {
        const xItemNo = String(x?.ItemNo).trim().toUpperCase();
        if (!xItemNo.startsWith(baseUpper)) return false;
        
        const suffix = xItemNo.replace(baseUpper, '');
        if (!['A', 'AR', 'N', 'NR'].includes(suffix)) return false;
        
        const xDivId = Number(x?.Division_Id);
        if (xDivId && xDivId !== divId) return false;
        
        return true;
      });
  
      // Sort priority: AR -> N -> NR -> A
      const priority = { 'AR': 1, 'N': 2, 'NR': 3, 'A': 4 };
      
      return matches.sort((a, b) => {
        const aSuf = String(a.ItemNo).trim().toUpperCase().replace(baseUpper, '');
        const bSuf = String(b.ItemNo).trim().toUpperCase().replace(baseUpper, '');
        return (priority[aSuf] || 99) - (priority[bSuf] || 99);
      });
};

console.log("Testing HBS00183N: ", getAvailableCodes({ ItemNo: 'HBS00183N' }));
console.log("Testing HBS00183N with space: ", getAvailableCodes({ ItemNo: 'HBS00183N ' }));
