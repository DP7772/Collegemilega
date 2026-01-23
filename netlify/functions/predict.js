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

        console.log(`📥 Filtering Fix Running: Rank=${userRank} | Caste=${caste}`);

        const coursePattern = `%${course.trim()}%`; 

        // --- 1. CASTE & EXCLUSION LOGIC ---
        let casteList = [`%${caste}%`]; 
        
        // Default Exclusion: Kuch aisa jo kabhi match na ho (Crash na ho isliye)
        let excludeList = ['%IMPOSSIBLE_STRING%']; 

        // Agar user 'GEN' (Open) hai:
        if (['GEN', 'General', 'Open'].includes(caste)) {
            casteList = ['%OPEN%', '%GEN%', '%General%', '%OP%'];
            // 🚫 IN SABKO HATAO: Taaki asli GEN chup na jaye
            excludeList = ['%PH%', '%PwD%', '%EWS%', '%TFW%', '%DEF%', '%MKS%', '%Handicap%']; 
        }
        // Agar user 'SEBC' hai:
        else if (['SEBC', 'OBC'].includes(caste)) {
            casteList = ['%SEBC%', '%OBC%'];
            excludeList = ['%PH%', '%PwD%', '%Handicap%']; // SEBC-PH hatao
        }
        // Agar user 'SC'/'ST' hai:
        else if (['SC', 'ST'].includes(caste)) {
            excludeList = ['%PH%', '%PwD%', '%Handicap%'];
        }

        let quotaList = [`%${quota}%`];
        if (['GUJCET', 'HS'].includes(quota)) quotaList = ['%HS%', '%Home State%', '%State%', '%GUJCET%']; 
        else if (['JEE', 'AI'].includes(quota)) quotaList = ['%AI%', '%All India%', '%JEE%'];

        await client.connect();

        // --- 2. SQL QUERY (With Exclusion) ---
        const query = `
            WITH base_data AS (
                SELECT *
                FROM college_cutoffs
                WHERE 
                    course_name ILIKE $1                
                    AND category ILIKE ANY($2::text[])   -- ✅ Include (e.g., GEN)
                    AND NOT (category ILIKE ANY($5::text[])) -- 🚫 Exclude (e.g., PH, EWS)
                    AND quota ILIKE ANY($3::text[])     
                    AND closing_rank >= $4              
                    AND year IN (2024, 2025)
            ),

            inst_counts AS (
                SELECT 
                    inst_name, 
                    COUNT(DISTINCT year) AS year_count
                FROM base_data
                GROUP BY inst_name
            ),

            target_logic AS (
                SELECT 
                    CASE 
                        WHEN EXISTS (SELECT 1 FROM inst_counts WHERE year_count = 2) 
                        THEN 2 
                        ELSE 1 
                    END AS target_count
            )

            SELECT
                b.inst_name,
                MAX(b.course_name) AS course_name,
                MAX(b.category) AS category, -- Ab ye Pure GEN hi uthayega kyunki PH filter ho gaya
                MAX(b.quota) AS quota,
                MAX(b.inst_type) AS inst_type,

                MAX(CASE WHEN b.year = 2025 THEN b.opening_rank END) AS opening_rank25,
                MAX(CASE WHEN b.year = 2025 THEN b.closing_rank END) AS closing_rank25,
                
                MAX(CASE WHEN b.year = 2024 THEN b.opening_rank END) AS opening_rank24,
                MAX(CASE WHEN b.year = 2024 THEN b.closing_rank END) AS closing_rank24

            FROM base_data b
            JOIN inst_counts c ON b.inst_name = c.inst_name
            JOIN target_logic t ON c.year_count = t.target_count

            GROUP BY b.inst_name
            ORDER BY b.inst_name;
        `;

        // ✅ Pass excludeList as the 5th parameter
        const values = [coursePattern, casteList, quotaList, userRank, excludeList];
        
        const result = await client.query(query, values);
        console.log(`✅ Final Matches: ${result.rowCount}`);

        const finalColleges = result.rows.map(row => {
            let statusLabel = '50-50 Chance (Borderline)';
            if (row.opening_rank24 && row.opening_rank25) {
                statusLabel = 'Confirmed 100% (Safe)';
            }

            return {
                name: row.inst_name,
                course: row.course_name,   
                category: row.category,
                quota: row.quota,
                type: row.inst_type || 'Unknown',
                status: statusLabel, 
                details: { 
                    y24: { open: row.opening_rank24 || 'N/A', close: row.closing_rank24 || 'N/A' },
                    y25: { open: row.opening_rank25 || 'N/A', close: row.closing_rank25 || 'N/A' }
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
