const http = require('http');
http.get('http://localhost:3100/api/Detail_CaseSetup', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const mockItems = json.filter(i => i.isMockTest);
      console.log('Mock items:', mockItems.length);
      const pmcItems = mockItems.filter(i => i.Division === 'PMC');
      console.log('Mock PMC items:', pmcItems.length);
      if (pmcItems.length > 0) {
        console.log('Sample PMC item:', pmcItems[0].Public_Id, pmcItems[0].ItemNo);
      }
    } catch(e) {
      console.log('Error parsing:', e.message);
    }
  });
}).on('error', e => console.error(e));
