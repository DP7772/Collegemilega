const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Headers (Frontend connection ke liye)
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

        console.log(`📥 Smart Logic Running: Rank=${userRank} | Course=${course}`);

        // --- 2. DYNAMIC INPUTS ---
        const coursePattern = `%${course.trim()}%`; 

        let casteList = [`%${caste}%`]; 
        if (['GEN', 'General', 'Open'].includes(caste)) casteList = ['%OPEN%', '%GEN%', '%General%', '%OP%'];
        else if (['TFWs', 'TFWS', 'TFW'].includes(caste)) casteList = ['%TFW%', '%TFWS%'];
        else if (['SEBC', 'OBC'].includes(caste)) casteList = ['%SEBC%', '%OBC%'];

        let quotaList = [`%${quota}%`];
        if (['GUJCET', 'HS'].includes(quota)) quotaList = ['%HS%', '%Home State%', '%State%', '%GUJCET%']; 
        else if (['JEE', 'AI'].includes(quota)) quotaList = ['%AI%', '%All India%', '%JEE%'];

        await client.connect();

        // --- 3. SMART SQL QUERY (Priority Logic + Data Fetch) ---
        const query = `
            WITH base_data AS (
                SELECT *
                FROM college_cutoffs
                WHERE 
                    course_name ILIKE $1                
                    AND category ILIKE ANY($2::text[])  
                    AND quota ILIKE ANY($3::text[])     
                    AND closing_rank >= $4              
                    AND year IN (2024, 2025)
            ),

            -- Step 1: Count karo ki college kitni baar mila (1 ya 2)
            inst_counts AS (
                SELECT 
                    inst_name, 
                    COUNT(DISTINCT year) AS year_count
                FROM base_data
                GROUP BY inst_name
            ),

            -- Step 2: Check karo ki kya '2' count wala koi exist karta hai?
            target_logic AS (
                SELECT 
                    CASE 
                        WHEN EXISTS (SELECT 1 FROM inst_counts WHERE year_count = 2) 
                        THEN 2  -- Agar 2 saal wale hain, to Target = 2
                        ELSE 1  -- Warna Target = 1 (Fallback)
                    END AS target_count
            )

            -- Step 3: Final Data Fetch (Jo target logic se match kare)
            SELECT
                b.inst_name,
                
                -- ✅ MAX() use karke Course Name wapas laye
                MAX(b.course_name) AS course_name,
                MAX(b.category) AS category,
                MAX(b.quota) AS quota,
                MAX(b.inst_type) AS inst_type,

                -- 2025 Data
                MAX(CASE WHEN b.year = 2025 THEN b.opening_rank END) AS opening_rank25,
                MAX(CASE WHEN b.year = 2025 THEN b.closing_rank END) AS closing_rank25,
                
                -- 2024 Data
                MAX(CASE WHEN b.year = 2024 THEN b.opening_rank END) AS opening_rank24,
                MAX(CASE WHEN b.year = 2024 THEN b.closing_rank END) AS closing_rank24

            FROM base_data b
            JOIN inst_counts c ON b.inst_name = c.inst_name
            JOIN target_logic t ON c.year_count = t.target_count -- 🔥 MAGIC FILTER

            GROUP BY b.inst_name
            ORDER BY b.inst_name;
        `;

        const values = [coursePattern, casteList, quotaList, userRank];
        const result = await client.query(query, values);
        
        console.log(`✅ Matches Found: ${result.rowCount}`);

        // --- 4. FORMAT OUTPUT (Status bhi auto-detect hoga) ---
        const finalColleges = result.rows.map(row => {
            
            // Logic: Agar dono saal ka data hai -> Confirmed. Warna -> Borderline.
            let statusLabel = '50-50 Chance (Borderline)';
            if (row.opening_rank24 && row.opening_rank25) {
                statusLabel = 'Confirmed 100% (Safe)';
            }

            return {
                name: row.inst_name,
                
                // ✅ Ab ye data 'Unknown' nahi aayega
                course: row.course_name,   
                category: row.category,
                quota: row.quota,
                type: row.inst_type || 'Unknown',
                
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
