const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Headers (CORS)
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
        const body = JSON.parse(event.body);
        const { rank, caste, course, quota } = body;
        const userRank = parseInt(rank); // User rank ko number bana diya

        await client.connect();

        // --- SQL QUERY (CASE INSENSITIVE) ---
        // ILIKE ka matlab: 'Computer' aur 'COMPUTER' dono same maane jayenge.
        // Hum rank filter nahi kar rahe, wo niche JS me karenge taaki 'N/A' na aaye.
        const query = `
            SELECT inst_name, year, closing_rank, opening_rank, inst_type 
            FROM college_cutoffs 
            WHERE 
                course_name ILIKE $1 
                AND category ILIKE $2 
                AND quota ILIKE $3
            ORDER BY closing_rank ASC
        `;

        // Input ke aage peeche space hata di (trim)
        const values = [course.trim(), caste.trim(), quota.trim()];
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
            // Data store kar rahe hain
            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = { open: row.opening_rank, close: row.closing_rank };
            } else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = { open: row.opening_rank, close: row.closing_rank };
            }
        });

        // --- TERA STRICT LOGIC (13000 vs 13500) ---
        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];

            // Pehle check kar ki Dono saal ka data hai ya nahi?
            if (d[2024] && d[2025]) {
                
                // Database se values nikal ke Number me convert karo (Safety ke liye)
                const close24 = parseInt(d[2024].close);
                const close25 = parseInt(d[2025].close);

                // LOGIC: 
                // 13000 <= 13500 (TRUE)  &&  13000 <= 13300 (TRUE)
                // Agar dono true hain, toh college dikhao.
                if (userRank <= close24 && userRank <= close25) {
                    
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
            }
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
