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

        console.log(`📥 Smart SQL Query Running: Rank=${userRank} | Course=${course}`);

        // --- 2. DYNAMIC INPUTS (User Independent Variables) ---
        
        // A. Course: '%Value%' for ILIKE
        const coursePattern = `%${course.trim()}%`; 

        // B. Caste: Mapping UI to DB
        let casteList = [`%${caste}%`]; 
        if (['GEN', 'General', 'Open'].includes(caste)) casteList = ['%OPEN%', '%GEN%', '%General%', '%OP%'];
        else if (['TFWs', 'TFWS', 'TFW'].includes(caste)) casteList = ['%TFW%', '%TFWS%'];
        else if (['SEBC', 'OBC'].includes(caste)) casteList = ['%SEBC%', '%OBC%'];

        // C. Quota: Mapping UI to DB
        let quotaList = [`%${quota}%`];
        if (['GUJCET', 'HS'].includes(quota)) quotaList = ['%HS%', '%Home State%', '%State%', '%GUJCET%']; 
        else if (['JEE', 'AI'].includes(quota)) quotaList = ['%AI%', '%All India%', '%JEE%'];

        await client.connect();

        // --- 3. TERI FINAL SQL QUERY (Variables ke sath) ---
        const query = `
            WITH rank_filtered AS (
                SELECT *
                FROM college_cutoffs
                WHERE 
                    course_name ILIKE $1                -- ✅ User Course
                    AND category ILIKE ANY($2::text[])  -- ✅ User Caste
                    AND quota ILIKE ANY($3::text[])     -- ✅ User Quota
                    AND closing_rank >= $4              -- ✅ User Rank
                    AND year IN (2024, 2025)
            ),
            year_counts AS (
                SELECT 
                    inst_name, 
                    COUNT(DISTINCT year) AS year_count
                FROM rank_filtered
                GROUP BY inst_name
            ),
            chosen_colleges AS (
                -- 🔥 LOGIC: Agar 2 saal wale hain, to wahi dikhao. Nahi to 1 saal wale.
                SELECT inst_name
                FROM year_counts
                WHERE year_count = (
                    SELECT 
                        CASE 
                            WHEN EXISTS (SELECT 1 FROM year_counts WHERE year_count = 2) 
                            THEN 2 
                            ELSE 1 
                        END
                )
            )
            SELECT
                r.inst_name,
                
                -- Extra Details jo tune add kiye
                MAX(r.course_name) AS course_name,
                MAX(r.category) AS category,
                MAX(r.quota) AS quota,
                MAX(r.inst_type) AS inst_type,

                -- 2025 Data
                MAX(CASE WHEN r.year = 2025 THEN r.opening_rank END) AS opening_rank25,
                MAX(CASE WHEN r.year = 2025 THEN r.closing_rank END) AS closing_rank25,
                
                -- 2024 Data
                MAX(CASE WHEN r.year = 2024 THEN r.opening_rank END) AS opening_rank24,
                MAX(CASE WHEN r.year = 2024 THEN r.closing_rank END) AS closing_rank24

            FROM rank_filtered r
            JOIN chosen_colleges c ON r.inst_name = c.inst_name
            GROUP BY r.inst_name
            ORDER BY r.inst_name;
        `;

        const values = [coursePattern, casteList, quotaList, userRank];
        const result = await client.query(query, values);
        
        console.log(`✅ Matches Found: ${result.rowCount}`);

        // --- 4. OUTPUT FORMATTING (Clean JSON) ---
        const finalColleges = result.rows.map(row => {
            
            // Status Logic: Backend khud decide karega
            // Agar 2024 aur 2025 dono ka data hai -> Confirmed
            // Agar ek bhi missing hai -> Borderline
            let statusLabel = '50-50 Chance (Borderline)';
            if (row.opening_rank24 && row.opening_rank25) {
                statusLabel = 'Confirmed 100% (Safe)';
            }

            return {
                name: row.inst_name,
                
                // Extra details for UI
                course: row.course_name,   
                category: row.category,
                quota: row.quota,
                type: row.inst_type || 'Unknown',
                
                // Frontend ko color decide karne ke liye
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
