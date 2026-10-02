const { getPlanListPaginated } = require('./src/controllers/PCPlan.controller');

async function testController() {
  const req = {
    query: {
      department: 'PC',
      subTab: 'ALL',
      filterDivision: 'All',
      page: '1',
      pageSize: '100'
    }
  };

  const res = {
    status: (code) => {
      console.log("HTTP Status:", code);
      return res;
    },
    json: (data) => {
      console.log("Response data rows count:", data.data ? data.data.length : 0);
      console.log("Pagination:", data.pagination);
      console.log("Counts:", data.counts);
      process.exit(0);
    },
    send: (err) => {
      console.error("HTTP Error:", err);
      process.exit(1);
    }
  };

  await getPlanListPaginated(req, res);
}

testController();
