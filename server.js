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
// 2. Database Initialization (Updated for Notes Column)
// -------------------
async function setupDatabase() {
    // Check if the connection string is actually set
    if (!connectionString) {
        console.error("FATAL: DATABASE_URL environment variable is not set. Cannot connect to database.");
        process.exit(1);
    }
    
    try {
        await query('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT)');
        
        // Ensure the watched_anime table exists
        await query(`
            CREATE TABLE IF NOT EXISTS watched_anime (
                id SERIAL PRIMARY KEY, 
                user_id INTEGER REFERENCES users(id), 
                anime_id INTEGER, 
                anime_title TEXT, 
                rating REAL, 
                voice_actors TEXT, 
                description TEXT, 
                "coverImage" TEXT,
                UNIQUE (user_id, anime_id)
            )
        `);
        
        // === FIX 1: Add the 'notes' column if it does not exist ===
        try {
            await query("ALTER TABLE watched_anime ADD COLUMN notes TEXT DEFAULT ''");
            console.log('Successfully added `notes` column to watched_anime table.');
        } catch (alterErr) {
            // Error code '42701' means the column already exists. This is expected and safe to ignore.
            if (alterErr.code !== '42701') {
                console.warn("Could not add `notes` column (may already exist):", alterErr.message);
            }
        }
        // ==========================================================

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
// Add watched anime
// -------------------
app.post('/add-anime', async (req, res) => {
    let { userId, animeId, animeTitle, rating, description, characters, coverImage } = req.body;

    const MAX_DESC_LENGTH = 800;
    
    // Server-side sanitization and truncation
    if (description) {
        description = description.replace(/<[^>]*>/g, '').trim();
        description = description.length > MAX_DESC_LENGTH ? description.substring(0, MAX_DESC_LENGTH) + '...' : description;
    }

    try {
        // Check for duplicate (Uses $1, $2)
        const duplicateResult = await query('SELECT id FROM watched_anime WHERE user_id=$1 AND anime_id=$2', [userId, animeId]);
        if (duplicateResult.rows.length > 0) {
            return res.json({ success: false, error: "Anime already added" });
        }

        // --- START OF VOICE ACTOR FINAL FIX ---
        
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
        
        // --- END OF VOICE ACTOR FINAL FIX ---


        // Insert new record (Uses $1 through $7, notes defaults to '' in DB)
        const insertResult = await query(
            'INSERT INTO watched_anime (user_id, anime_id, anime_title, rating, voice_actors, description, "coverImage") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [userId, animeId, animeTitle, rating, voiceActors, description, coverImage]
        );

        res.json({ success: true, animeId: insertResult.rows[0].id });
    } catch (err) {
        if (err.code === '23505') {
            return res.json({ success: false, error: "Anime already added" });
        }
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
// Get watched anime for user (FIXED: Added ORDER BY id ASC)
// -------------------
app.get('/watched/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // === FIX 2: Added ORDER BY id ASC to ensure consistent order ===
        const result = await query('SELECT * FROM watched_anime WHERE user_id=$1 ORDER BY id ASC', [userId]);
        // =============================================================
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get watched failed:", err);
        res.json({ success: false, error: err.message });
    }
});

// -------------------
// 3. API Routes for Notes (NEW)
// -------------------

// GET /api/notes/:userId/:animeId - Fetch notes for a specific anime
app.get('/api/notes/:userId/:animeId', async (req, res) => {
    const { userId, animeId } = req.params;

    try {
        // Select only the notes column
        const sql = 'SELECT notes FROM watched_anime WHERE user_id = $1 AND anime_id = $2';
        const result = await query(sql, [userId, animeId]);

        if (result.rows.length > 0) {
            // Return the notes (or an empty string if null/default)
            res.json({ success: true, notes: result.rows[0].notes || "" });
        } else {
            // If the anime is not found, return an empty string for notes
            res.json({ success: true, notes: "" });
        }
    } catch (err) {
        console.error("Database error fetching notes:", err);
        res.status(500).json({ success: false, error: "Internal server error fetching notes." });
    }
});

// PUT /api/notes - Save/Update notes for a specific anime
app.put('/api/notes', async (req, res) => {
    const { userId, animeId, notes } = req.body;

    if (!userId || !animeId) {
        return res.status(400).json({ success: false, error: "Missing user or anime ID." });
    }

    try {
        // Use an UPDATE query to set the 'notes' field
        const sql = 'UPDATE watched_anime SET notes = $1 WHERE user_id = $2 AND anime_id = $3';
        const result = await query(sql, [notes, userId, animeId]);

        // Check the number of rows updated
        if (result.rowCount > 0) {
            res.json({ success: true, message: "Notes saved successfully." });
        } else {
            res.status(404).json({ success: false, error: "Anime not found in watched list." });
        }
    } catch (err) {
        console.error("Database error saving notes:", err);
        res.status(500).json({ success: false, error: "Internal server error saving notes." });
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
