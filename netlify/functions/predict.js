const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Headers & Method Check
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

        // --- SQL QUERY ---
        // Hum SQL se sara data layenge course/caste ka, filtering JS me karenge
        const query = `
            SELECT inst_name, year, closing_rank, opening_rank, inst_type 
            FROM college_cutoffs 
            WHERE 
                course_name = $1 
                AND category = $2 
                AND quota = $3
            ORDER BY closing_rank ASC
        `;

        const values = [course, caste, quota];
        const result = await client.query(query, values);

        // --- DATA GROUPING ---
        const collegeMap = {};

        result.rows.forEach(row => {
            const name = row.inst_name;
            if (!collegeMap[name]) {
                collegeMap[name] = {
                    type: row.inst_type || 'Unknown',
                    2024: null, // Default null rakhenge check karne ke liye
                    2025: null
                };
            }
            
            // Year Mapping
            const y = (row.year == 2024 || row.year == '2024') ? 2024 : 
                      (row.year == 2025 || row.year == '2025') ? 2025 : null;

            if(y) {
                collegeMap[name][y] = {
                    close: row.closing_rank,
                    open: row.opening_rank
                };
            }
        });

        // --- STRICT FILTERING LOGIC (Yeh hai tera Rule) ---
        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];
            
            // Step 1: Check karo Data hai ya nahi?
            if (!d[2024] || !d[2025]) {
                return; // Agar kisi ek saal ka data gayab hai -> HATA DO (Skip)
            }

            const close24 = d[2024].close;
            const close25 = d[2025].close;

            // Step 2: Check karo User Pass ho raha hai ya nahi?
            // DONO saal pass hone chahiye (&& operator)
            if (userRank <= close24 && userRank <= close25) {
                
                // Agar yahan pahuche, matlab sab PERFECT hai.
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
            // Agar ek bhi condition fail hui, to ye college list me add nahi hoga.
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
