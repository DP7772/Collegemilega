const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Headers
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

        console.log(`📥 Input: Rank=${userRank}, Course=${course}, Caste=${caste}, Quota=${quota}`);

        // --- MAPPINGS (Sab variations cover kiye hain) ---
        
        let casteFilter = [caste]; 
        if (caste.toUpperCase().includes('GEN') || caste.toUpperCase() == 'OPEN') {
            casteFilter = ['OPEN', 'GEN', 'General', 'OP']; 
        } else if (caste.toUpperCase().includes('TFW')) {
            casteFilter = ['TFW', 'TFWS', 'TFWs'];
        } else if (caste.toUpperCase().includes('EWS')) {
            casteFilter = ['EWS'];
        }

        let quotaFilter = [quota];
        if (quota.toUpperCase().includes('GUJCET') || quota.toUpperCase().includes('HS')) {
            quotaFilter = ['HS', 'Home State', 'State', 'SQ', 'GQ', 'GUJCET']; 
        } else if (quota.toUpperCase().includes('JEE')) {
            quotaFilter = ['AI', 'All India', 'All India Open', 'JEE'];
        }

        await client.connect();

        // --- SQL LOGIC (FLEXIBLE GROUPING) ---
        const query = `
            WITH Pass_Data AS (
                -- STEP 1: Filter - Jo Pass hai wahi uthao
                SELECT * FROM college_cutoffs 
                WHERE 
                    course_name ILIKE $1 
                    AND (category = ANY($2::text[])) -- Strict Array Match
                    AND (quota = ANY($3::text[]))    -- Strict Array Match
                    AND closing_rank >= $4  -- User Pass hona chahiye
            )
            -- STEP 2: Grouping & Pivot
            SELECT 
                inst_name,
                inst_type,
                -- 2024 Data (Agar nahi mila to NULL aayega)
                MAX(CASE WHEN year = 2024 THEN opening_rank END) as open_24,
                MAX(CASE WHEN year = 2024 THEN closing_rank END) as close_24,
                -- 2025 Data (Agar nahi mila to NULL aayega)
                MAX(CASE WHEN year = 2025 THEN opening_rank END) as open_25,
                MAX(CASE WHEN year = 2025 THEN closing_rank END) as close_25
            FROM Pass_Data
            GROUP BY inst_name, inst_type
            -- STEP 3: NO STRICT HAVING CLAUSE
            -- Humne HAVING hata diya. Agar 1 saal ka bhi data group me aaya, to wo dikhega.
        `;

        const values = [
            `%${course.trim()}%`,  // Wildcard Match for Course
            casteFilter, 
            quotaFilter, 
            userRank
        ];

        console.log("🔍 Running Query...");
        const result = await client.query(query, values);
        console.log(`✅ Colleges Found: ${result.rowCount}`);

        // --- FORMATTING ---
        const finalColleges = result.rows.map(row => {
            return {
                name: row.inst_name,
                type: row.inst_type || 'Unknown',
                status: 'safe',
                details: { 
                    // Agar data NULL hai (matlab us saal fail tha ya data nahi hai), to 0 bhejenge
                    y24: { 
                        open: row.open_24 || 'N/A', 
                        close: row.close_24 || 'N/A' 
                    },
                    y25: { 
                        open: row.open_25 || 'N/A', 
                        close: row.close_25 || 'N/A' 
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
