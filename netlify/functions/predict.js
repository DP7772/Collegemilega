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
        let { rank, caste, course, quota } = JSON.parse(event.body);
        const userRank = parseInt(rank);

        console.log(`📥 Searching Guaranteed Seats (Both Years): Rank=${userRank}`);

        // --- MAPPINGS ---
        let casteFilter = [caste]; 
        if (caste.toUpperCase().includes('GEN') || caste.toUpperCase() == 'OPEN') casteFilter = ['OPEN', 'GEN', 'General', 'OP'];
        else if (caste.toUpperCase().includes('TFW')) casteFilter = ['TFW', 'TFWS', 'TFWs'];
        
        let quotaFilter = [quota];
        if (quota.toUpperCase().includes('GUJCET')) quotaFilter = ['HS', 'Home State', 'State', 'SQ', 'GUJCET']; 
        else if (quota.toUpperCase().includes('JEE')) quotaFilter = ['AI', 'All India', 'JEE'];

        await client.connect();

        // --- STRICT LOGIC: FILTER -> GROUP -> BOTH CHECK ---
        const query = `
            WITH Qualified_Data AS (
                -- STEP 1: Pehle RANK CONDITION se data filter karo
                -- Jo fail hai wo yahi bahar nikal jayega.
                SELECT * FROM college_cutoffs 
                WHERE 
                    course_name ILIKE $1 
                    AND (category = ANY($2::text[])) 
                    AND (quota = ANY($3::text[]))    
                    AND closing_rank >= $4  -- <--- User Pass hona chahiye
            )
            -- STEP 2: Ab bache hue result par GROUP BY lagao
            SELECT 
                inst_name,
                inst_type,
                MAX(CASE WHEN year = 2024 THEN opening_rank END) as open_24,
                MAX(CASE WHEN year = 2024 THEN closing_rank END) as close_24,
                MAX(CASE WHEN year = 2025 THEN opening_rank END) as open_25,
                MAX(CASE WHEN year = 2025 THEN closing_rank END) as close_25
            FROM Qualified_Data
            GROUP BY inst_name, inst_type
            
            -- STEP 3: STRICT CHECK (Jo dono yr ko pass kar jaye uspe hi, jo sirf ek me ho wo nahi)
            HAVING 
                MAX(CASE WHEN year = 2024 THEN 1 ELSE 0 END) = 1 
                AND 
                MAX(CASE WHEN year = 2025 THEN 1 ELSE 0 END) = 1;
        `;

        const values = [`%${course.trim()}%`, casteFilter, quotaFilter, userRank];
        const result = await client.query(query, values);

        console.log(`✅ Final Guaranteed Colleges: ${result.rowCount}`);

        const finalColleges = result.rows.map(row => {
            return {
                name: row.inst_name,
                type: row.inst_type || 'Unknown',
                status: 'Confirmed 2026',
                details: { 
                    y24: { open: row.open_24, close: row.close_24 },
                    y25: { open: row.open_25, close: row.close_25 }
                }
            };
        });

        await client.end();
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, data: finalColleges }) };

    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
    }
};    };

    // 2. Method Check
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const client = new Client({
        connectionString: process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000 // 5 sec se zyada wait mat karna
    });

    try {
        const { rank, caste, course, quota } = JSON.parse(event.body);
        const userRank = parseInt(rank);

        console.log("Connecting to DB...");
        await client.connect();
        console.log("Connected! Querying...");

        // 3. Query (Sab kuch maango: Type, Open, Close)
        const query = `
            SELECT inst_name, year, closing_rank, opening_rank, inst_type 
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
        console.log(`Data Found: ${result.rowCount} rows`);

        // 4. Data Grouping
        const collegeMap = {};

        result.rows.forEach(row => {
            const name = row.inst_name;
            if (!collegeMap[name]) {
                collegeMap[name] = {
                    type: row.inst_type || 'Unknown',
                    2024: { close: 'N/A', open: 'N/A' },
                    2025: { close: 'N/A', open: 'N/A' }
                };
            }
            
            // Year check (Flexible string/int match)
            const y = (row.year == 2024 || row.year == '2024') ? 2024 : 
                      (row.year == 2025 || row.year == '2025') ? 2025 : null;

            if(y) {
                collegeMap[name][y] = {
                    close: row.closing_rank,
                    open: row.opening_rank
                };
            }
        });

        // 5. Final List
        const finalColleges = Object.keys(collegeMap).map(name => {
            const d = collegeMap[name];
            return {
                name: name,
                type: d.type,
                status: 'safe',
                details: { y24: d[2024], y25: d[2025] }
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: finalColleges }),
        };

    } catch (error) {
        console.error('SERVER ERROR:', error);
        return {
            statusCode: 500, // 502 nahi, proper 500 error return karo info ke sath
            headers,
            body: JSON.stringify({ success: false, error: error.message }),
        };
    } finally {
        // IMPORTANT: Connection hamesha close karo, warna Netlify 502 dega
        await client.end();
        console.log("DB Connection Closed");
    }
};            headers,
            body: JSON.stringify({ success: true, data: finalColleges }),
        };

    } catch (error) {
        console.error('SERVER ERROR:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: error.message }) };
    }
};
