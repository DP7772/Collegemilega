const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Headers Setup
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // 2. Method Check
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const client = new Client({
        connectionString: process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000 // 5 sec se zyada wait mat karna
    });

    try {
        const { rank, caste, course, quota } = JSON.parse(event.body);
        const userRank = parseInt(rank);

        console.log("Connecting to DB...");
        await client.connect();
        console.log("Connected! Querying...");

        // 3. Query (Sab kuch maango: Type, Open, Close)
        const query = `
            SELECT inst_name, year, closing_rank, opening_rank, inst_type 
            FROM college_cutoffs 
            WHERE 
                course_name = $1 
                AND category = $2 
                AND quota = $3 
                AND closing_rank >= $4 
            ORDER BY closing_rank ASC
        `;

        const values = [course, caste, quota, userRank];
        const result = await client.query(query, values);
        console.log(`Data Found: ${result.rowCount} rows`);

        // 4. Data Grouping
        const collegeMap = {};

        result.rows.forEach(row => {
            const name = row.inst_name;
            if (!collegeMap[name]) {
                collegeMap[name] = {
                    type: row.inst_type || 'Unknown',
                    2024: { close: 'N/A', open: 'N/A' },
                    2025: { close: 'N/A', open: 'N/A' }
                };
            }
            
            // Year check (Flexible string/int match)
            const y = (row.year == 2024 || row.year == '2024') ? 2024 : 
                      (row.year == 2025 || row.year == '2025') ? 2025 : null;

            if(y) {
                collegeMap[name][y] = {
                    close: row.closing_rank,
                    open: row.opening_rank
                };
            }
        });

        // 5. Final List
        const finalColleges = Object.keys(collegeMap).map(name => {
            const d = collegeMap[name];
            return {
                name: name,
                type: d.type,
                status: 'safe',
                details: { y24: d[2024], y25: d[2025] }
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: finalColleges }),
        };

    } catch (error) {
        console.error('SERVER ERROR:', error);
        return {
            statusCode: 500, // 502 nahi, proper 500 error return karo info ke sath
            headers,
            body: JSON.stringify({ success: false, error: error.message }),
        };
    } finally {
        // IMPORTANT: Connection hamesha close karo, warna Netlify 502 dega
        await client.end();
        console.log("DB Connection Closed");
    }
};
