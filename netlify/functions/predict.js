const { Client } = require('pg');

exports.handler = async (event, context) => {
    // Sirf POST request allow hai
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { rank, caste, course, quota } = JSON.parse(event.body);
    const userRank = parseInt(rank);

    // Neon DB Connection (Netlify Environment Variable se)
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        // --- SQL QUERY (STRICT LOGIC) ---
        // Hum sirf wo rows maang rahe hain jahan closing_rank user_rank se bada hai.
        // Matlab cutoff 5000 hai aur user 4000 hai -> TOH HI DIKHAO.
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

        // --- DATA GROUPING ---
        // Alag-alag saalo ko ek college name ke niche jodna
        const collegeMap = {};

        result.rows.forEach(row => {
            const name = row.inst_name;
            
            if (!collegeMap[name]) {
                collegeMap[name] = { 2024: 'N/A', 2025: 'N/A' };
            }

            // Data assign karo
            if (row.year == 2024 || row.year == '2024') {
                collegeMap[name][2024] = row.closing_rank;
            } else if (row.year == 2025 || row.year == '2025') {
                collegeMap[name][2025] = row.closing_rank;
            }
        });

        // --- FINAL LIST ---
        // Sabko 'safe' status denge kyunki query ne pehle hi filter kar diya hai
        const finalColleges = Object.keys(collegeMap).map(name => {
            const data = collegeMap[name];
            return {
                name: name,
                status: 'safe', // Sab Green rahenge
                desc: `Confirmed! [24: ${data[2024]} | 25: ${data[2025]}]`
            };
        });

        await client.end();

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, data: finalColleges }),
        };

    } catch (error) {
        console.error('Database Error:', error);
        await client.end();
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server Error" }),
        };
    }
};
