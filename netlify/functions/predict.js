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

        console.log(`📥 CTE Query Running: Rank=${userRank}, Course=${course}`);

        // --- SMART INPUT MAPPING ---
        // Hum inputs ko array banayenge taaki 'ILIKE ANY' use kar sakein
        
        // 1. Caste Mapping (Wildcards ke sath)
        let casteList = [`%${caste}%`]; 
        if (caste.toUpperCase().includes('GEN') || caste.toUpperCase() == 'OPEN') {
            casteList = ['%OPEN%', '%GEN%', '%General%', '%OP%'];
        } else if (caste.toUpperCase().includes('TFW')) {
            casteList = ['%TFW%', '%TFWS%'];
        }

        // 2. Quota Mapping (Wildcards ke sath)
        let quotaList = [`%${quota}%`];
        if (quota.toUpperCase().includes('GUJCET')) {
            quotaList = ['%HS%', '%Home State%', '%State%', '%GUJCET%']; 
        } else if (quota.toUpperCase().includes('JEE')) {
            quotaList = ['%AI%', '%All India%', '%JEE%'];
        }

        await client.connect();

        // --- TERI WALI "CTE" SQL QUERY ---
        const query = `
            WITH rank_filtered AS (
                -- Step 1: Filter Raw Data (Rank Check Yahi Hoga)
                SELECT *
                FROM college_cutoffs
                WHERE 
                    course_name ILIKE $1                -- Course Match
                    AND category ILIKE ANY($2::text[])  -- Caste Match (Array)
                    AND quota ILIKE ANY($3::text[])     -- Quota Match (Array)
                    AND closing_rank >= $4              -- Rank Check (PASS Condition)
                    AND year IN (2024, 2025)            -- Sirf in 2 saalo ka data
            ),
            valid_colleges AS (
                -- Step 2: Sirf wo colleges jo dono saal pass huye
                SELECT inst_name
                FROM rank_filtered
                GROUP BY inst_name
                HAVING COUNT(DISTINCT year) = 2         -- <--- STRICT CHECK (Both Years)
            )
            -- Step 3: Final Join & Pivot
            SELECT
                r.inst_name,
                MAX(r.course_name) AS course_name,
                MAX(r.category) AS category,
                MAX(r.quota) AS quota,
                MAX(r.inst_type) AS inst_type,

                -- 2025 Data
                MAX(CASE WHEN r.year = 2025 THEN r.opening_rank END) AS opening_rank25,
                MAX(CASE WHEN r.year = 2025 THEN r.closing_rank END) AS closing_rank25,
                2025 AS year25,

                -- 2024 Data
                MAX(CASE WHEN r.year = 2024 THEN r.opening_rank END) AS opening_rank24,
                MAX(CASE WHEN r.year = 2024 THEN r.closing_rank END) AS closing_rank24,
                2024 AS year24

            FROM rank_filtered r
            JOIN valid_colleges v ON r.inst_name = v.inst_name
            GROUP BY r.inst_name
            ORDER BY r.inst_name;
        `;

        const values = [
            `%${course.trim()}%`,  // $1: Course
            casteList,             // $2: Category List
            quotaList,             // $3: Quota List
            userRank               // $4: Rank
        ];

        const result = await client.query(query, values);
        console.log(`✅ Result Count: ${result.rowCount}`);

        // --- FORMATTING (Frontend ke liye saaf suthra JSON) ---
        const finalColleges = result.rows.map(row => {
            return {
                name: row.inst_name,
                type: row.inst_type || 'Unknown',
                status: 'Confirmed',
                details: { 
                    y24: { 
                        open: row.opening_rank24, 
                        close: row.closing_rank24 
                    },
                    y25: { 
                        open: row.opening_rank25, 
                        close: row.closing_rank25 
                    }
                }
            };
        });

        await client.end();

        return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: finalColleges }) };

    } catch (error) {
        console.error('SERVER ERROR:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
    }
};
