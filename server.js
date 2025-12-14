import express from 'express';
import bodyParser from 'body-parser';
import { Pool } from 'pg'; 
import bcrypt from 'bcrypt';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------
// 1. PostgreSQL Connection Setup
// -------------------
const connectionString = process.env.DATABASE_URL; 

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

// Helper function to simplify query execution
const query = (text, params) => pool.query(text, params);

// -------------------
// 2. Database Initialization (UPDATED: Added all new columns)
// -------------------
async function setupDatabase() {
    // Check if the connection string is actually set
    if (!connectionString) {
        console.error("FATAL: DATABASE_URL environment variable is not set. Cannot connect to database.");
        process.exit(1);
    }
    
    try {
        await query('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT)');
        
        // WATCHED_ANIME SCHEMA for new environments: Includes all tracking fields
        await query(`
            CREATE TABLE IF NOT EXISTS watched_anime (
                id SERIAL PRIMARY KEY, 
                user_id INTEGER REFERENCES users(id), 
                anime_id INTEGER, 
                anime_title TEXT, 
                rating REAL, 
                voice_actors TEXT, 
                description TEXT, 
                coverImage TEXT, 
                notes TEXT,
                user_rating REAL,      -- NEW: User's personal rating (1-10)
                start_date DATE,       -- NEW: Date started watching
                finish_date DATE,      -- NEW: Date finished watching
                status TEXT DEFAULT 'Watched' -- NEW: Watched/Watchlist status
            )
        `);
        

        // === DATABASE MIGRATION STEP: Add all missing columns for existing databases ===
        const newColumns = [
            'notes TEXT',
            'user_rating REAL',
            'start_date DATE',
            'finish_date DATE',
            'status TEXT DEFAULT \'Watched\'' // Ensures existing rows default to 'Watched'
        ];
        
        for (const colDef of newColumns) {
            const colName = colDef.split(' ')[0];
            await query(`
                DO $$ BEGIN
                    BEGIN
                        ALTER TABLE watched_anime ADD COLUMN ${colDef};
                    EXCEPTION
                        WHEN duplicate_column THEN null;
                    END;
                END $$;
            `);
        }
        // =========================================================================
        
        console.log('Database tables ensured successfully (PostgreSQL).');
    } catch (err) {
        console.error("CRITICAL ERROR: Database setup failed:", err.message);
        process.exit(1); 
    }
}
setupDatabase(); 

// -------------------
// User registration
// -------------------
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id', [username, hash]);
        res.json({ success: true, userId: result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') {
            return res.json({ success: false, error: 'Username already exists.' });
        }
        console.error("Registration failed:", err);
        res.json({ success: false, error: err.message });
    }
});

// -------------------
// User login
// -------------------
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await query('SELECT * FROM users WHERE username=$1', [username]);
        const user = result.rows[0];

        if (!user) {
            return res.json({ success: false, error: "User not found" });
        }

        const match = await bcrypt.compare(password, user.password);
        if (match) {
            res.json({ success: true, userId: user.id });
        } else {
            res.json({ success: false, error: "Incorrect password" });
        }
    } catch (err) {
        console.error("Login failed:", err);
        res.json({ success: false, error: err.message });
    }
});

// -------------------
// Add watched anime (UPDATED to accept 'status')
// -------------------
app.post('/add-anime', async (req, res) => {
    // NEW: Destructure 'status' from the body
    let { userId, animeId, animeTitle, rating, description, characters, coverImage, status } = req.body; 

    // Default status if not provided (safety)
    status = status || 'Watched'; 

    const MAX_DESC_LENGTH = 800;
    
    // Server-side sanitization and truncation
    if (description) {
        description = description.replace(/<[^>]*>/g, '').trim();
        description = description.length > MAX_DESC_LENGTH ? description.substring(0, MAX_DESC_LENGTH) + '...' : description;
    }
    
    // Initialize new fields as null/empty string on creation
    const initialNotes = ''; 
    const initialUserRating = null; 
    const initialStartDate = null; 
    const initialFinishDate = null; 

    try {
        // Check for duplicate
        const duplicateResult = await query('SELECT id FROM watched_anime WHERE user_id=$1 AND anime_id=$2', [userId, animeId]);
        if (duplicateResult.rows.length > 0) {
            return res.json({ success: false, error: "Anime already added" });
        }

        // --- START OF VOICE ACTOR FIX (Your original, fixed logic) ---
        const japaneseVAMap = new Map();
        const englishVAMap = new Map();

        if (characters && characters.length) {
            characters.forEach(edge => {
                const char = edge.node;
                const charName = char.name?.full;
                const voiceActorsList = edge.voiceActors || [];

                if (charName) {
                    voiceActorsList.forEach(role => {
                        const vaName = role.name?.full;
                        const vaLanguage = role.language;

                        if (vaName && vaLanguage) {
                            const langUpper = vaLanguage.toUpperCase(); 

                            if (langUpper === 'JAPANESE') {
                                const currentCharacters = japaneseVAMap.get(vaName) || [];
                                if (!currentCharacters.includes(charName)) {
                                    currentCharacters.push(charName);
                                    japaneseVAMap.set(vaName, currentCharacters);
                                }
                            }
                            
                            if (langUpper === 'ENGLISH') {
                                const currentCharacters = englishVAMap.get(vaName) || [];
                                if (!currentCharacters.includes(charName)) {
                                    currentCharacters.push(charName);
                                    englishVAMap.set(vaName, currentCharacters);
                                }
                            }
                        }
                    });
                }
            });
        }

        const createVAString = (map) => {
            return Array.from(map.entries())
                .map(([vaName, charNames]) => {
                    const charList = charNames.join(', '); 
                    return `${charList}: ${vaName}`;
                })
                .join('|'); 
        };
        
        const vaData = {
            japanese: createVAString(japaneseVAMap),
            english: createVAString(englishVAMap)
        };
        
        const voiceActors = JSON.stringify(vaData);
        // --- END OF VOICE ACTOR FIX ---


        // Insert new record (Uses $1 through $12)
        const insertResult = await query(
            // NOTE: Must include all 12 columns in the insertion statement
            `INSERT INTO watched_anime (user_id, anime_id, anime_title, rating, voice_actors, description, coverImage, notes, user_rating, start_date, finish_date, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [userId, animeId, animeTitle, rating, voiceActors, description, coverImage, initialNotes, initialUserRating, initialStartDate, initialFinishDate, status]
        );

        res.json({ success: true, animeId: insertResult.rows[0].id });
    } catch (err) {
        console.error("Add anime failed:", err);
        res.json({ success: false, error: err.message });
    }
});

// -------------------
// Remove anime
// -------------------
app.delete('/remove-anime/:userId/:animeId', async (req, res) => {
    const { userId, animeId } = req.params;
    try {
        await query('DELETE FROM watched_anime WHERE user_id=$1 AND anime_id=$2', [userId, animeId]);
        res.json({ success: true });
    } catch (err) {
        console.error("Remove anime failed:", err);
        res.json({ success: false, error: err.message });
    }
});

// -------------------
// Update anime details (REPLACES /update-notes, handles rating, dates, notes, and status)
// -------------------
app.patch('/update-details', async (req, res) => {
    // Collect all updatable fields from the client
    let { userId, animeId, userRating, startDate, finishDate, notes, status } = req.body;
    
    if (!userId || !animeId) {
        return res.json({ success: false, error: 'User ID and Anime ID are required.' });
    }

    // Sanitize and handle notes/rating
    const MAX_NOTES_LENGTH = 2000;
    let sanitizedNotes = notes ? String(notes).replace(/<[^>]*>/g, '').trim() : '';
    sanitizedNotes = sanitizedNotes.substring(0, MAX_NOTES_LENGTH);
    
    // Ensure rating is null or a valid number
    const parsedRating = (userRating !== null && userRating !== undefined) ? parseFloat(userRating) : null;
    
    // Default status if null is sent, ensuring it stays 'Watched' or 'Watchlist'
    const finalStatus = status || 'Watched'; 

    try {
        
        const result = await query(
            `UPDATE watched_anime 
             SET notes = $1, 
                 user_rating = $2, 
                 start_date = $3, 
                 finish_date = $4,
                 status = $5
             WHERE user_id = $6 AND anime_id = $7 
             RETURNING id`,
            [sanitizedNotes, parsedRating, startDate, finishDate, finalStatus, userId, animeId]
        );

        if (result.rowCount === 0) {
            return res.json({ success: false, error: 'Anime record not found for this user.' });
        }
        
        res.json({ success: true, message: 'Details updated successfully.' });
    } catch (err) {
        console.error("Update details failed:", err);
        res.json({ success: false, error: err.message });
    }
});


// -------------------
// Get watched anime for user
// -------------------
app.get('/watched/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // Selects all columns, including the new status, dates, and user_rating
        const result = await query('SELECT * FROM watched_anime WHERE user_id=$1', [userId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get watched failed:", err);
        res.json({ success: false, error: err.message });
    }
});

// -------------------
// Search anime from AniList API (No DB changes here)
// -------------------
app.get('/search-anime', async (req,res) => {
    const search = req.query.q;
    const lang = req.query.lang || 'romaji';
    console.log(`[SEARCH] Query received: "${search}"`);

    if(!search) {
        return res.json([]);
    }

    const query = 
    'query ($search: String) {' +
    ' Page(perPage: 10) {' +
    ' media(search: $search, type: ANIME) {' +
    ' id' +
    ' title { romaji english }' +
    ' description' +
    ' averageScore' +
    ' coverImage { large }' + 
    ' characters(role: MAIN) {' +
    ' edges {' +
    ' node { name { full } }' +
    ' voiceActors { name { full } language }' +
    ' }' +
    ' }' +
    ' }' +
    ' }' +
    '}';

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method:'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables:{search} })
        });

        if (!response.ok) {
            console.error(`[SEARCH ERROR] HTTP Error! Status: ${response.status}`);
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        res.json(data.data.Page.media);
    } catch(e){
        console.error("[SEARCH ERROR] AniList fetch failed:", e.message);
        res.json([]);
    }
});


// -------------------
// Start server
// -------------------
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
