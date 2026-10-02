const { poolPromise } = require('./src/config/database');
const sql = require('mssql');
const { getPlanListPaginated } = require('./src/controllers/PCPlan.controller');

async function debugQCApi() {
  try {
    const req = {
      query: {
        page: '1',
        pageSize: '100',
        department: 'QC',
        subTab: 'Required',
        showHistory: 'false'
      }
    };
    const res = {
      status: (code) => ({
        json: (data) => {
          console.log('HTTP Status:', code);
          console.log('API Response data count:', data.data?.length);
          console.log('Pagination:', data.pagination);
          console.log('Counts:', data.counts);
          if (data.data?.length > 0) {
            console.log('Sample item 0:', {
              Plan_ID: data.data[0].Plan_ID,
              PlanDate: data.data[0].PlanDate,
              PartNo: data.data[0].PartNo,
              Path_Dwg: data.data[0].Path_Dwg,
              Path_Layout: data.data[0].Path_Layout,
              Path_IIQC: data.data[0].Path_IIQC,
              ReqStatus: data.data[0].ReqStatus
            });
          }
        }
      })
    };

    await getPlanListPaginated(req, res);
    process.exit(0);
  } catch (err) {
    console.error('API Debug Error:', err);
    process.exit(1);
  }
}

debugQCApi();
