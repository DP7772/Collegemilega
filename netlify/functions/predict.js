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
        let { rank, caste, course, quota } = JSON.parse(event.body);
        const userRank = parseInt(rank);

        // --- SMART MAPPING (Spelling Fixer) ---
        // Agar user "GEN" bheje, toh DB me "OPEN" dhoondo
        if (caste.toUpperCase() === 'GEN') caste = 'OPEN';
        if (caste.toUpperCase() === 'TFWS') caste = 'TFW';
        
        // Quota fix
        if (quota.toUpperCase() === 'JEE MAIN') quota = 'AI'; // Check DB if it uses 'All India' or 'AI'
        if (quota.toUpperCase() === 'GUJCET') quota = 'HS';   // Check DB if it uses 'Home State' or 'HS' or 'GUJCET'

        console.log(`🔍 Searching For: ${course} | ${caste} | ${quota} | Rank: ${userRank}`);

        await client.connect();

        // --- SQL QUERY (FLEXIBLE SEARCH) ---
        // Hum OR condition laga rahe hain taaki agar quota 'AI' ya 'All India' ho to dono pakad le
        const query = `
            SELECT inst_name, year, closing_rank, opening_rank, inst_type 
            FROM college_cutoffs 
            WHERE 
                course_name ILIKE $1 
                AND category ILIKE $2 
                AND (quota ILIKE $3 OR quota ILIKE 'All India' OR quota ILIKE 'Home State')
            ORDER BY closing_rank ASC
        `;

        // Note: Hum quota ko flexible rakh rahe hain query me
        const values = [course.trim(), caste.trim(), quota.trim()];
        const result = await client.query(query, values);

        console.log(`✅ Rows Found in DB: ${result.rowCount}`);

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
            
            // Year check
            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = { open: row.opening_rank, close: row.closing_rank };
            } else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = { open: row.opening_rank, close: row.closing_rank };
            }
        });

        // --- STRICT FILTERING (User Logic) ---
        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];

            // 1. Data Check: Dono saal ka data hona chahiye
            if (d[2024] && d[2025]) {
                
                const close24 = parseInt(d[2024].close);
                const close25 = parseInt(d[2025].close);

                // 2. Rank Check: User ka Rank cutoffs se kam hona chahiye
                if (userRank <= close24 && userRank <= close25) {
                    finalColleges.push({
                        name: name,
                        type: d.type,
                        status: 'safe',
                        details: { y24: d[2024], y25: d[2025] }
                    });
                }
            }
        });

        console.log(`🚀 Sending ${finalColleges.length} Colleges`);

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
