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

        // --- DYNAMIC VARIABLES ---
        const coursePattern = `%${course.trim()}%`; 

        let casteList = [`%${caste}%`]; 
        if (['GEN', 'General', 'Open'].includes(caste)) casteList = ['%OPEN%', '%GEN%', '%General%', '%OP%'];
        else if (['TFWs', 'TFWS', 'TFW'].includes(caste)) casteList = ['%TFW%', '%TFWS%'];
        else if (['SEBC', 'OBC'].includes(caste)) casteList = ['%SEBC%', '%OBC%'];

        let quotaList = [`%${quota}%`];
        if (['GUJCET', 'HS'].includes(quota)) quotaList = ['%HS%', '%Home State%', '%State%', '%GUJCET%']; 
        else if (['JEE', 'AI'].includes(quota)) quotaList = ['%AI%', '%All India%', '%JEE%'];

        await client.connect();

        const query = `
            WITH rank_filtered AS (
                SELECT *
                FROM college_cutoffs
                WHERE 
                    course_name ILIKE $1                
                    AND category ILIKE ANY($2::text[])  
                    AND quota ILIKE ANY($3::text[])     
                    AND closing_rank >= $4              
                    AND year IN (2024, 2025)            
            ),
            valid_colleges AS (
                SELECT inst_name
                FROM rank_filtered
                GROUP BY inst_name
                HAVING COUNT(DISTINCT year) = 2         
            )
            SELECT
                r.inst_name,
                MAX(r.course_name) AS course_name, -- SQL Data la raha hai
                MAX(r.category) AS category,       -- SQL Data la raha hai
                MAX(r.quota) AS quota,             -- SQL Data la raha hai
                MAX(r.inst_type) AS inst_type,

                MAX(CASE WHEN r.year = 2025 THEN r.opening_rank END) AS opening_rank25,
                MAX(CASE WHEN r.year = 2025 THEN r.closing_rank END) AS closing_rank25,
                
                MAX(CASE WHEN r.year = 2024 THEN r.opening_rank END) AS opening_rank24,
                MAX(CASE WHEN r.year = 2024 THEN r.closing_rank END) AS closing_rank24

            FROM rank_filtered r
            JOIN valid_colleges v ON r.inst_name = v.inst_name
            GROUP BY r.inst_name
            ORDER BY r.inst_name;
        `;

        const values = [coursePattern, casteList, quotaList, userRank];
        const result = await client.query(query, values);

        // --- 👇 YAHAN THA MISSING PART (AB ADD KAR DIYA) 👇 ---
        const finalColleges = result.rows.map(row => {
            return {
                name: row.inst_name,
                
                // Ye 3 cheezein pehle missing thi, ab add kar di:
                course: row.course_name,   
                category: row.category,
                quota: row.quota,
                
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
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
    }
};
