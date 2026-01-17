const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    const client = new Client({
        connectionString: process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });

    try {
        const body = JSON.parse(event.body);
        console.log("📥 INPUT RECEIVED:", body); // Log input

        const { rank, caste, course, quota } = body;
        const userRank = parseInt(rank);

        await client.connect();

        // --- SQL QUERY (CASE INSENSITIVE & SAFE) ---
        // Hum 'ILIKE' use kar rahe hain taaki capital/small ka panga na ho.
        // Rank filter yahan se hata diya hai taaki pehle check karein data aa raha hai ya nahi.
        const query = `
            SELECT inst_name, year, closing_rank, opening_rank, inst_type 
            FROM college_cutoffs 
            WHERE 
                course_name ILIKE $1 
                AND category ILIKE $2 
                AND quota ILIKE $3
            ORDER BY closing_rank ASC
        `;

        // Input ke aage peeche '%' lagaya hai taaki milta-julta naam bhi pakad le
        const values = [course.trim(), caste.trim(), quota.trim()];
        
        console.log("🔍 RUNNING QUERY WITH:", values);
        const result = await client.query(query, values);
        
        console.log(`✅ ROWS FOUND: ${result.rowCount}`);

        // --- DATA GROUPING ---
        const collegeMap = {};

        result.rows.forEach(row => {
            const name = row.inst_name;
            if (!collegeMap[name]) {
                collegeMap[name] = {
                    type: row.inst_type || 'Unknown',
                    2024: null,
                    2025: null
                };
            }
            // Year Handle (String/Int dono chalega)
            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = { open: row.opening_rank, close: row.closing_rank };
            } else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = { open: row.opening_rank, close: row.closing_rank };
            }
        });

        // --- FILTERING ---
        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];

            // Check if ANY data exists
            if (d[2024] && d[2025]) {
                const close24 = d[2024].close;
                const close25 = d[2025].close;

                // Tera STRICT Rule: Dono saal User Rank cutoff se kam hona chahiye
                if (userRank <= close24 && userRank <= close25) {
                    finalColleges.push({
                        name: name,
                        type: d.type,
                        status: 'safe',
                        details: { y24: d[2024], y25: d[2025] }
                    });
                }
            }
        });

        console.log(`🚀 FINAL MATCHED COLLEGES: ${finalColleges.length}`);

        await client.end();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: finalColleges }),
        };

    } catch (error) {
        console.error('❌ FATAL ERROR:', error);
        return {
            statusCode: 500, // Frontend ko batao 500 hai
            headers,
            // Error ka pura detail bhejo taaki alert me dikhe
            body: JSON.stringify({ success: false, error: error.message, detail: error.stack }),
        };
    }
};
