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
        connectionTimeoutMillis: 5000
    });

    try {
        const body = JSON.parse(event.body);
        const { rank, caste, course, quota } = body;
        const userRank = parseInt(rank);

        await client.connect();

        // --- STEP 1: SQL QUERY (SARA DATA LE AAO) ---
        // Hum yahan Rank filter nahi laga rahe. Kyun?
        // Kyunki agar hum SQL me filter lagayenge to 'Fail' wale saal ka data aayega hi nahi
        // aur hum check nahi kar payenge ki dono saal pass hai ya nahi.
        const query = `
            SELECT inst_name, year, closing_rank, opening_rank, inst_type 
            FROM college_cutoffs 
            WHERE 
                course_name ILIKE $1 
                AND category ILIKE $2 
                AND quota ILIKE $3
            ORDER BY closing_rank ASC
        `;

        const values = [course.trim(), caste.trim(), quota.trim()];
        const result = await client.query(query, values);

        // --- STEP 2: DATA GROUPING ---
        const collegeMap = {};

        result.rows.forEach(row => {
            const name = row.inst_name;
            if (!collegeMap[name]) {
                collegeMap[name] = {
                    type: row.inst_type || 'Unknown',
                    2024: null, // Default null
                    2025: null
                };
            }
            // Data bharna
            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = { open: row.opening_rank, close: row.closing_rank };
            } else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = { open: row.opening_rank, close: row.closing_rank };
            }
        });

        // --- STEP 3: STRICT FILTERING (TERA MAIN LOGIC) ---
        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];

            // RULE 1: Kya dono saal ka data Database me hai?
            if (d[2024] && d[2025]) {
                
                const close24 = parseInt(d[2024].close);
                const close25 = parseInt(d[2025].close);

                // RULE 2: Kya User Rank dono saal ke Cutoff ke andar hai?
                // Example: User 13000 <= Cutoff 13500 (PASS)
                if (userRank <= close24 && userRank <= close25) {
                    
                    // Agar sab Pass hai, to list me add karo
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
