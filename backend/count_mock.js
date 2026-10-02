const http = require('http');
http.get('http://localhost:3100/api/Detail_CaseSetup', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Case Setup Total:', json.length, 'Mock:', json.filter(i => i.isMockTest).length);
    } catch(e) {
      console.log('Error parsing:', e.message);
    }
  });
}).on('error', e => console.error(e));
