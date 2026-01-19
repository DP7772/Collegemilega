const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // Headers setup
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
        // 1. Input Receive karna (Frontend se)
        let { rank, caste, course, quota } = JSON.parse(event.body);
        const userRank = parseInt(rank);

        console.log(`📥 Input Received: Rank=${userRank}, Caste=${caste}, Course=${course}, Quota=${quota}`);

        // --- 2. SMART MAPPING (HTML Values -> Database Values) ---
        
        // CASTE MAPPING
        let casteList = [`%${caste}%`]; 
        if (caste === 'GEN') {
            casteList = ['%OPEN%', '%GEN%', '%General%', '%OP%'];
        } else if (caste === 'TFWs') {
            casteList = ['%TFW%', '%TFWS%', '%Tuition Fee%'];
        } else if (caste === 'SEBC') {
            casteList = ['%SEBC%', '%OBC%'];
        }

        // QUOTA MAPPING
        let quotaList = [`%${quota}%`];
        if (quota === 'GUJCET') {
            quotaList = ['%HS%', '%Home State%', '%State%', '%GUJCET%']; 
        } else if (quota === 'JEE') {
            quotaList = ['%AI%', '%All India%', '%JEE%'];
        }

        // COURSE MAPPING (Wildcard add karna taaki 'Computer' likhne par bhi match ho)
        const coursePattern = `%${course}%`;

        await client.connect();

        // --- 3. TERA FINAL SQL QUERY (CTE Logic) ---
        const query = `
            WITH rank_filtered AS (
                -- Step 1: Raw Filtering
                SELECT *
                FROM college_cutoffs
                WHERE 
                    course_name ILIKE $1                -- Course match (Dynamic)
                    AND category ILIKE ANY($2::text[])  -- Caste List match
                    AND quota ILIKE ANY($3::text[])     -- Quota List match
                    AND closing_rank >= $4              -- User Rank Check
                    AND year IN (2024, 2025)            -- Sirf in 2 saalo ka data
            ),
            valid_colleges AS (
                -- Step 2: Strict Check (Must appear in BOTH years)
                SELECT inst_name
                FROM rank_filtered
                GROUP BY inst_name
                HAVING COUNT(DISTINCT year) = 2
            )
            -- Step 3: Final Pivot Data
            SELECT
                r.inst_name,
                MAX(r.inst_type) AS inst_type,

                -- 2025 Data
                MAX(CASE WHEN r.year = 2025 THEN r.opening_rank END) AS opening_rank25,
                MAX(CASE WHEN r.year = 2025 THEN r.closing_rank END) AS closing_rank25,

                -- 2024 Data
                MAX(CASE WHEN r.year = 2024 THEN r.opening_rank END) AS opening_rank24,
                MAX(CASE WHEN r.year = 2024 THEN r.closing_rank END) AS closing_rank24

            FROM rank_filtered r
            JOIN valid_colleges v ON r.inst_name = v.inst_name
            GROUP BY r.inst_name
            ORDER BY r.inst_name;
        `;

        const values = [
            coursePattern,   // $1
            casteList,       // $2
            quotaList,       // $3
            userRank         // $4
        ];

        const result = await client.query(query, values);
        console.log(`✅ Matches Found: ${result.rowCount}`);

        // --- 4. FORMATTING ---
        const finalColleges = result.rows.map(row => {
            return {
                name: row.inst_name,
                type: row.inst_type || 'Unknown',
                status: 'Confirmed',
                details: { 
                    y24: { open: row.opening_rank24, close: row.closing_rank24 },
                    y25: { open: row.opening_rank25, close: row.closing_rank25 }
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
