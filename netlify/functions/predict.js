const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // 1. Basic Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // 2. Method Check
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { rank, caste, course, quota } = JSON.parse(event.body);
        const userRank = parseInt(rank);

        // --- CHANGE IS HERE: Variable Name Fixed ---
        // Netlify auto-generated name use kar rahe hain
        const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

        if (!dbUrl) {
            throw new Error("Database URL missing! Check Netlify Env Variables.");
        }

        const client = new Client({
            connectionString: dbUrl,
            ssl: { rejectUnauthorized: false }
        });

        await client.connect();

        // 3. Query (Strict Logic: Cutoff >= User Rank)
        const query = `
            SELECT inst_name, year, closing_rank 
            FROM college_cutoffs 
            WHERE 
                course_name = $1 
                AND category = $2 
                AND quota = $3 
                AND closing_rank >= $4 
            ORDER BY closing_rank ASC
        `;

        const values = [course, caste, quota, userRank];
        const result = await client.query(query, values);

        // 4. Data Grouping
        const collegeMap = {};
        result.rows.forEach(row => {
            const name = row.inst_name;
            if (!collegeMap[name]) collegeMap[name] = { 2024: 'N/A', 2025: 'N/A' };
            
            if (row.year == 2024) collegeMap[name][2024] = row.closing_rank;
            if (row.year == 2025) collegeMap[name][2025] = row.closing_rank;
        });

        // 5. Final List
        const finalColleges = Object.keys(collegeMap).map(name => {
            const data = collegeMap[name];
            return {
                name: name,
                status: 'safe',
                desc: `Confirmed! [24: ${data[2024]} | 25: ${data[2025]}]`
            };
        });

        await client.end();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: finalColleges }),
        };

    } catch (error) {
        console.error('SERVER ERROR:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                error: error.message 
            }),
        };
    }
};
