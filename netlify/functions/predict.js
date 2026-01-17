const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Setup
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const client = new Client({
        connectionString: process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });

    try {
        const { rank, caste, course, quota } = JSON.parse(event.body);
        const userRank = parseInt(rank);

        await client.connect();

        // --- SQL QUERY (SEEDHA DATABASE SE FILTRATION) ---
        // Logic: Hum database ko bol rahe hain ki bhai wahi row dena jahan
        // closing_rank user_rank se bada ya barabar ho.
        // Jo fail hai wo database se bahar niklega hi nahi.
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

        // --- DATA GROUPING ---
        const collegeMap = {};

        result.rows.forEach(row => {
            const name = row.inst_name;
            if (!collegeMap[name]) {
                collegeMap[name] = {
                    type: row.inst_type || 'Unknown',
                    2024: null, 
                    2025: null
                };
            }
            
            // Jo data SQL ne diya hai use map me daalo
            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = { open: row.opening_rank, close: row.closing_rank };
            } 
            else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = { open: row.opening_rank, close: row.closing_rank };
            }
        });

        // --- FINAL CHECK (DONO SAAL HAI YA NAHI?) ---
        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];

            // SIMPLE LOGIC:
            // SQL ne wahi data diya jo PASS tha.
            // Agar mere paas 2024 ka bhi data aa gaya aur 2025 ka bhi, 
            // iska matlab user DONO saal PASS hai.
            if (d[2024] && d[2025]) {
                finalColleges.push({
                    name: name,
                    type: d.type,
                    status: 'safe',
                    details: { 
                        y24: d[2024],
                        y25: d[2025]
                    }
                });
            }
            // Agar ek bhi gayab hai, matlab SQL ne use filter kar diya (Fail) -> Isliye Show mat karo.
        });

        await client.end();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: finalColleges }),
        };

    } catch (error) {
        console.error('SERVER ERROR:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message }),
        };
    }
};
