const { Client } = require('pg');

exports.handler = async (event, context) => {
    
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

        // Spelling Fixes
        if (caste.toUpperCase() === 'GEN') caste = 'OPEN';
        if (caste.toUpperCase() === 'TFWS') caste = 'TFW';
        if (quota.toUpperCase() === 'JEE MAIN') quota = 'AI';
        if (quota.toUpperCase() === 'GUJCET') quota = 'HS';

        await client.connect();

        // --- SQL QUERY WITH TYPE CASTING ---
        // Hum closing_rank ko 'DOUBLE PRECISION' (Number) bana rahe hain compare karne ke liye.
        // Isse '14620.00' >= 13000 sahi kaam karega.
        const query = `
            SELECT 
                inst_name, 
                year, 
                CAST(closing_rank AS DOUBLE PRECISION) as close_r, 
                CAST(opening_rank AS DOUBLE PRECISION) as open_r, 
                inst_type 
            FROM college_cutoffs 
            WHERE 
                course_name ILIKE $1 
                AND category ILIKE $2 
                AND (quota ILIKE $3 OR quota ILIKE 'All India' OR quota ILIKE 'Home State')
                AND CAST(closing_rank AS DOUBLE PRECISION) >= $4
            ORDER BY closing_rank ASC
        `;

        const values = [course.trim(), caste.trim(), quota.trim(), userRank];
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
            
            // Decimal hata ke saaf integer banao (Display ke liye)
            const openVal = row.open_r ? Math.floor(row.open_r) : 'N/A';
            const closeVal = row.close_r ? Math.floor(row.close_r) : 'N/A';

            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = { open: openVal, close: closeVal };
            } else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = { open: openVal, close: closeVal };
            }
        });

        // --- FINAL CHECK ---
        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];

            // STRICT RULE: Dono saal ka data hona chahiye
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
