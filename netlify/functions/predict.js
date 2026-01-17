const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Headers Setup
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

        // Mapping
        if (caste.toUpperCase() === 'GEN') caste = 'OPEN';
        if (caste.toUpperCase() === 'TFWS') caste = 'TFW';
        if (quota.toUpperCase() === 'JEE MAIN') quota = 'AI';
        if (quota.toUpperCase() === 'GUJCET') quota = 'HS';

        await client.connect();

        // --- DIRECT SQL LOGIC (Tera Wala Approach) ---
        // 1. Hum DB ko bol rahe hain: "Sirf PASS wala data bhejo" (closing_rank >= userRank)
        // 2. Hum CAST use kar rahe hain taaki .00 hat jaye (Clean Number)
        const query = `
            SELECT 
                inst_name, 
                year, 
                CAST(closing_rank AS INTEGER) as close_r, 
                CAST(opening_rank AS INTEGER) as open_r, 
                inst_type 
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
            
            // Jo row aayi hai, wo CONFIRMED PASS wali hi hai
            const openVal = row.open_r;
            const closeVal = row.close_r;

            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = { open: openVal, close: closeVal };
            } else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = { open: openVal, close: closeVal };
            }
        });

        // --- FINAL CHECK (Strict: Dono saal pass hone chahiye) ---
        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];

            // LOGIC:
            // Agar SQL ne 2024 ka data nahi bheja, iska matlab tu 2024 mein fail tha.
            // Hum sirf tabhi dikhayenge jab DONO saal ka data SQL se wapas aaya ho.
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
        });

        await client.end();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: finalColleges }),
        };

    } catch (error) {
        console.error('SERVER ERROR:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
    }
};
