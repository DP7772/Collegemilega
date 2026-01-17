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

        // Mapping (Agar user GEN dale to OPEN samjho)
        if (caste.toUpperCase() === 'GEN') caste = 'OPEN';
        if (caste.toUpperCase() === 'TFWS') caste = 'TFW';
        if (quota.toUpperCase() === 'JEE MAIN') quota = 'AI';
        if (quota.toUpperCase() === 'GUJCET') quota = 'HS';

        await client.connect();

        const query = `
            SELECT inst_name, year, closing_rank, opening_rank, inst_type 
            FROM college_cutoffs 
            WHERE 
                course_name ILIKE $1 
                AND category ILIKE $2 
                AND (quota ILIKE $3 OR quota ILIKE 'All India' OR quota ILIKE 'Home State')
            ORDER BY closing_rank ASC
        `;

        const values = [course.trim(), caste.trim(), quota.trim()];
        const result = await client.query(query, values);

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
            
            // Year Check
            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = { open: row.opening_rank, close: row.closing_rank };
            } else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = { open: row.opening_rank, close: row.closing_rank };
            }
        });

        const finalColleges = [];

        Object.keys(collegeMap).forEach(name => {
            const d = collegeMap[name];

            // 1. Check Data Exists
            if (d[2024] && d[2025]) {
                
                // DATA CLEANING: .00 ya String ko Number banao
                // Agar DB me '14620.00' hai to ye '14620' ban jayega
                const close24 = parseInt(d[2024].close);
                const close25 = parseInt(d[2025].close);
                const open24 = d[2024].open ? parseInt(d[2024].open) : 'N/A';
                const open25 = d[2025].open ? parseInt(d[2025].open) : 'N/A';

                // 2. Pass Check (Comparison)
                if (userRank <= close24 && userRank <= close25) {
                    finalColleges.push({
                        name: name,
                        type: d.type,
                        status: 'safe',
                        details: { 
                            // Yahan hum CLEAN number bhej rahe hain
                            y24: { open: open24, close: close24 }, 
                            y25: { open: open25, close: close25 }
                        }
                    });
                }
            }
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
