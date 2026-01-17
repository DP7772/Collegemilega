const { Client } = require('pg');

exports.handler = async (event, context) => {
    
    // Headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // 1. Check Method
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Only POST allowed' }) };
    }

    // 2. Check Database URL
    const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error("❌ ERROR: Database URL nahi mila! Env variable set kar.");
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: 'Database URL Missing in Netlify Settings' }) 
        };
    }

    const client = new Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });

    try {
        console.log("🔌 Connecting to Database...");
        await client.connect();
        console.log("✅ Connected!");

        // 3. Check Input Parsing
        console.log("📥 Parsing Input...");
        const input = JSON.parse(event.body);
        console.log("✅ Input Received:", input);

        if (!input.rank) throw new Error("Rank missing hai input me");

        // 4. Test Simple Query (Isse pata chalega table hai ya nahi)
        console.log("🔍 Running Test Query...");
        const testQuery = "SELECT count(*) FROM college_cutoffs";
        const testResult = await client.query(testQuery);
        console.log("✅ Table OK! Rows found:", testResult.rows[0].count);

        // 5. Run Your ACTUAL Query (Safe Version)
        // Hum simple values use karenge check karne ke liye
        const userRank = parseInt(input.rank);
        if (isNaN(userRank)) throw new Error("Rank number nahi hai");

        const query = `
            SELECT inst_name, year 
            FROM college_cutoffs 
            WHERE closing_rank >= $1 
            LIMIT 5
        `;
        const realResult = await client.query(query, [userRank]);

        await client.end();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: "System is Working!", 
                sampleData: realResult.rows 
            }),
        };

    } catch (error) {
        console.error("❌ CRASH REPORT:", error);
        
        // Connection close karna zaroori hai agar crash ho jaye
        try { await client.end(); } catch (e) {}

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                error: error.message, 
                stack: error.stack // Ye line tujhe batayegi galti kahan hai
            })
        };
    }
};        await client.connect();
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
