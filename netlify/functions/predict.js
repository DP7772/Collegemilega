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

        console.log(`📥 Diamond Query Running: Rank=${userRank} | Course=${course}`);

        // --- 2. DYNAMIC INPUTS (Parameters) ---
        const coursePattern = `%${course.trim()}%`; 

        let casteList = [`%${caste}%`]; 
        if (['GEN', 'General', 'Open'].includes(caste)) casteList = ['%OPEN%', '%GEN%', '%General%', '%OP%'];
        else if (['TFWs', 'TFWS', 'TFW'].includes(caste)) casteList = ['%TFW%', '%TFWS%'];
        else if (['SEBC', 'OBC'].includes(caste)) casteList = ['%SEBC%', '%OBC%'];

        let quotaList = [`%${quota}%`];
        if (['GUJCET', 'HS'].includes(quota)) quotaList = ['%HS%', '%Home State%', '%State%', '%GUJCET%']; 
        else if (['JEE', 'AI'].includes(quota)) quotaList = ['%AI%', '%All India%', '%JEE%'];

        await client.connect();

        // --- 3. TERI EXACT SQL QUERY (Parameterized) ---
        const query = `
            WITH base_data AS (
                SELECT *
                FROM college_cutoffs
                WHERE 
                    course_name ILIKE $1                 -- ✅ $1: Course
                    AND category ILIKE ANY($2::text[])   -- ✅ $2: Caste List
                    AND quota ILIKE ANY($3::text[])      -- ✅ $3: Quota List
                    AND closing_rank >= $4               -- ✅ $4: User Rank
                    AND year IN (2024, 2025)
            ),

            year_stats AS (
                SELECT 
                    inst_name, 
                    course_name, 
                    category, 
                    quota, 
                    COUNT(DISTINCT year) AS year_count
                FROM base_data
                GROUP BY inst_name, course_name, category, quota
            ),

            has_two_year AS (
                -- Check karo kya koi aisa college hai jo dono saal mila?
                SELECT 1 
                FROM year_stats 
                WHERE year_count = 2 
                LIMIT 1
            )

            SELECT
                b.inst_name,
                b.course_name,
                b.category,
                b.quota,

                -- 2025 Data
                MAX(CASE WHEN b.year = 2025 THEN b.opening_rank END) AS opening_rank25,
                MAX(CASE WHEN b.year = 2025 THEN b.closing_rank END) AS closing_rank25,
                
                -- 2024 Data
                MAX(CASE WHEN b.year = 2024 THEN b.opening_rank END) AS opening_rank24,
                MAX(CASE WHEN b.year = 2024 THEN b.closing_rank END) AS closing_rank24

            FROM base_data b
            JOIN year_stats y 
              ON b.inst_name = y.inst_name 
              AND b.course_name = y.course_name 
              AND b.category = y.category 
              AND b.quota = y.quota

            WHERE 
                (
                    -- SCENARIO 1: Agar 2 saal wale exist karte hain, to sirf unhe dikhao
                    EXISTS (SELECT 1 FROM has_two_year)
                    AND y.year_count = 2
                )
                OR
                (
                    -- SCENARIO 2: Agar 2 saal wala koi nahi hai, tabhi 1 saal wale ko aane do
                    NOT EXISTS (SELECT 1 FROM has_two_year)
                    AND y.year_count = 1
                )

            GROUP BY b.inst_name, b.course_name, b.category, b.quota
            ORDER BY b.inst_name;
        `;

        const values = [coursePattern, casteList, quotaList, userRank];
        const result = await client.query(query, values);
        
        console.log(`✅ Matches Found: ${result.rowCount}`);

        // --- 4. OUTPUT FORMATTING ---
        const finalColleges = result.rows.map(row => {
            
            // Status Logic:
            // Agar query ne data diya hai aur usme dono saal ka data hai -> Confirmed
            // Agar ek saal missing hai -> 50-50
            let statusLabel = '50-50 Chance (Borderline)';
            if (row.opening_rank24 && row.opening_rank25) {
                statusLabel = 'Confirmed 100% (Safe)';
            }

            return {
                name: row.inst_name,
                course: row.course_name,   
                category: row.category,
                quota: row.quota,
                type: 'Unknown', // Aggregation me type nahi tha, isliye default
                
                status: statusLabel, 
                
                details: { 
                    y24: { 
                        open: row.opening_rank24 || 'N/A', 
                        close: row.closing_rank24 || 'N/A' 
                    },
                    y25: { 
                        open: row.opening_rank25 || 'N/A', 
                        close: row.closing_rank25 || 'N/A' 
                    }
                }
            };
        });

        await client.end();
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: finalColleges }) };

    } catch (error) {
        console.error("SERVER ERROR:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
    }
};
