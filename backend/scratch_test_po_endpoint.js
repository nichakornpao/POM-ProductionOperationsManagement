fetch('http://localhost:3000/api/forecast/incoming-po?year=2026&month=July')
  .then(res => res.json())
  .then(data => {
    console.log('Data:', data);
  })
  .catch(console.error);
