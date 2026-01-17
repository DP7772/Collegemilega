const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Setup Headers
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

        // Spelling Mapping (Frontend -> Database)
        if (caste.toUpperCase() === 'GEN') caste = 'OPEN';
        if (caste.toUpperCase() === 'TFWS') caste = 'TFW';
        if (quota.toUpperCase() === 'JEE MAIN') quota = 'AI';
        if (quota.toUpperCase() === 'GUJCET') quota = 'HS';

        await client.connect();

        // --- TERA MASTER LOGIC (SQL ONLY) ---
        const query = `
            WITH Pass_Data AS (
                -- STEP 1: STRICT FILTERING (Sab kuch AND hoga)
                -- Yahan wo row select hogi hi nahi jisme tu fail hai.
                SELECT * FROM college_cutoffs 
                WHERE 
                    course_name ILIKE $1 
                    AND category ILIKE $2 
                    AND (quota ILIKE $3 OR quota ILIKE 'All India' OR quota ILIKE 'Home State')
                    AND closing_rank >= $4  -- <--- YE HAI MAIN LOGIC (Jo pass wahi andar)
            )
            -- STEP 2: GROUP BY & PIVOT (Virtual Table banana)
            SELECT 
                inst_name,
                inst_type,
                -- 2024 Data (yr1)
                MAX(CASE WHEN year = 2024 THEN opening_rank END) as open_24,
                MAX(CASE WHEN year = 2024 THEN closing_rank END) as close_24,
                -- 2025 Data (yr2)
                MAX(CASE WHEN year = 2025 THEN opening_rank END) as open_25,
                MAX(CASE WHEN year = 2025 THEN closing_rank END) as close_25
            FROM Pass_Data
            GROUP BY inst_name, inst_type
            -- STEP 3: CONFIRMATION (Dono saal ka maal hona chahiye)
            HAVING 
                MAX(CASE WHEN year = 2024 THEN 1 ELSE 0 END) = 1 
                AND 
                MAX(CASE WHEN year = 2025 THEN 1 ELSE 0 END) = 1;
        `;

        const values = [course.trim(), caste.trim(), quota.trim(), userRank];
        const result = await client.query(query, values);

        // --- FORMATTING ---
        // SQL ne hume paki-pakayi row de di hai (Single Row per College)
        // Bas frontend ke structure me daalna hai.
        
        const finalColleges = result.rows.map(row => {
            return {
                name: row.inst_name,
                type: row.inst_type || 'Unknown',
                status: 'safe',
                details: { 
                    y24: { 
                        open: row.open_24, 
                        close: row.close_24 
                    },
                    y25: { 
                        open: row.open_25, 
                        close: row.close_25 
                    }
                }
            };
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
