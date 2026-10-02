const http = require('http');
http.get('http://localhost:3100/api/Detail_CaseSetup', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const testNew = json.filter(i => i.Public_Id && i.Public_Id.startsWith('TEST-CS-NEW-'));
      console.log('Found TEST-CS-NEW-:', testNew.length);
      if (testNew.length > 0) {
        console.log('Sample item:', testNew[0]);
      }
    } catch(e) {
      console.log('Error parsing:', e.message);
    }
  });
}).on('error', e => console.error(e));
