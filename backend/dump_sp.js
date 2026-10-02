require('dotenv').config({path: __dirname + '/.env'});
const sql = require('mssql');

async function run() {
    try {
        await sql.connect({
            user: process.env.DB_USER_APP,
            password: process.env.DB_PASSWORD,
            server: process.env.DB_SERVER,
            database: process.env.DB_NAME,
            options: { encrypt: false, trustServerCertificate: true }
        });

        const res1 = await sql.query(`sp_helptext 'trans.Stored_PCPlan_Query'`);
        const text1 = res1.recordset.map(r => r.Text).join('');
        require('fs').writeFileSync(__dirname + '/sp_pcplan_query.sql', text1);

        const res2 = await sql.query(`sp_helptext 'trans.Stored_PCPlan_Query_PD'`);
        const text2 = res2.recordset.map(r => r.Text).join('');
        require('fs').writeFileSync(__dirname + '/sp_pcplan_query_pd.sql', text2);

        console.log('Saved SPs to file.');
        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
