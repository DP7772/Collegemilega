const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // Headers
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
        // 1. User ka Input Lo
        let { rank, caste, course, quota } = JSON.parse(event.body);
        const userRank = parseInt(rank);

        console.log(`📥 Input: Course="${course}" | Rank=${userRank} | Caste=${caste}`);

        // --- 2. DYNAMIC VARIABLES BANANA ---
        
        // A. Course: Aage piche % laga do taaki ILIKE pakad le
        // Agar user "Computer" bhejega to ye "%Computer%" ban jayega
        const coursePattern = `%${course.trim()}%`; 

        // B. Caste: User "GEN" bhejega par Database me "OPEN" ho sakta hai
        // Isliye hum ek list banayenge aur SQL me 'ANY' use karenge
        let casteList = [`%${caste}%`]; 
        if (['GEN', 'General', 'Open'].includes(caste)) {
            casteList = ['%OPEN%', '%GEN%', '%General%', '%OP%'];
        } else if (['TFWs', 'TFWS', 'TFW'].includes(caste)) {
            casteList = ['%TFW%', '%TFWS%'];
        } else if (['SEBC', 'OBC'].includes(caste)) {
            casteList = ['%SEBC%', '%OBC%'];
        }

        // C. Quota: GUJCET -> Home State mapping
        let quotaList = [`%${quota}%`];
        if (['GUJCET', 'HS'].includes(quota)) {
            quotaList = ['%HS%', '%Home State%', '%State%', '%GUJCET%']; 
        } else if (['JEE', 'AI'].includes(quota)) {
            quotaList = ['%AI%', '%All India%', '%JEE%'];
        }

        await client.connect();

        // --- 3. TERI WALI QUERY (Dynamic Values ke sath) ---
        const query = `
            WITH rank_filtered AS (
                SELECT *
                FROM college_cutoffs
                WHERE 
                    course_name ILIKE $1                -- User ka Course (% ke sath)
                    AND category ILIKE ANY($2::text[])  -- User ki Caste (List me se koi bhi match kare)
                    AND quota ILIKE ANY($3::text[])     -- User ka Quota
                    AND closing_rank >= $4              -- User ki Rank
                    AND year IN (2024, 2025)            -- Sirf in 2 saalo ka data
            ),
            valid_colleges AS (
                SELECT inst_name
                FROM rank_filtered
                GROUP BY inst_name
                HAVING COUNT(DISTINCT year) = 2         -- Strict Check (Dono saal)
            )
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

        // Values jo query me $1, $2, $3, $4 ki jagah jayengi
        const values = [
            coursePattern, // $1
            casteList,     // $2
            quotaList,     // $3
            userRank       // $4
        ];

        const result = await client.query(query, values);
        console.log(`✅ Result Count: ${result.rowCount}`);

        // --- 4. DATA FORMATTING ---
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
