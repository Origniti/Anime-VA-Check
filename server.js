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
// 2. Database Initialization (Updated for More Info columns)
// -------------------
async function setupDatabase() {
    if (!connectionString) {
        console.error("FATAL: DATABASE_URL environment variable is not set. Cannot connect to database.");
        process.exit(1);
    }
    
    try {
        await query('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT)');
        
        // Define the initial table structure if it doesn't exist
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
                notes TEXT,
                start_date DATE,
                end_date DATE
            )
        `);
        
        // === DATABASE MIGRATION STEPS: Add new columns if they don't exist ===
        const columns = [
            { name: 'notes', type: 'TEXT' },
            { name: 'rating', type: 'REAL' }, 
            { name: 'start_date', type: 'DATE' },
            { name: 'end_date', type: 'DATE' },
        ];

        for (const column of columns) {
            await query(`
                DO $$ BEGIN
                    BEGIN
                        ALTER TABLE watched_anime ADD COLUMN ${column.name} ${column.type};
                    EXCEPTION
                        WHEN duplicate_column THEN null;
                    END;
                END $$;
            `);
        }
        
        console.log('Database tables ensured and migrated successfully (PostgreSQL).');
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
    
    if (description) {
        description = description.replace(/<[^>]*>/g, '').trim();
        description = description.length > MAX_DESC_LENGTH ? description.substring(0, MAX_DESC_LENGTH) + '...' : description;
    }
    
    // Initialize notes, start/end dates as empty/null on creation
    const initialNotes = '';
    const initialStartDate = null;
    const initialEndDate = null;

    try {
        const duplicateResult = await query('SELECT id FROM watched_anime WHERE user_id=$1 AND anime_id=$2', [userId, animeId]);
        if (duplicateResult.rows.length > 0) {
            return res.json({ success: false, error: "Anime already added" });
        }

        // --- VOICE ACTOR PROCESSING ---
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
        
        // --- END VOICE ACTOR PROCESSING ---


        // Insert new record (Uses $1 through $10 - includes notes, start_date, end_date)
        const insertResult = await query(
            'INSERT INTO watched_anime (user_id, anime_id, anime_title, rating, voice_actors, description, "coverImage", notes, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
            [userId, animeId, animeTitle, rating, voiceActors, description, coverImage, initialNotes, initialStartDate, initialEndDate]
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
// Update anime info (UPDATED ENDPOINT to handle all tracking fields)
// -------------------
app.patch('/update-info', async (req, res) => {
    const { 
        userId, 
        animeId, 
        rating, 
        notes, 
        start_date, 
        end_date 
    } = req.body;
    
    if (!userId || !animeId) {
        return res.status(400).json({ success: false, error: 'User ID and Anime ID are required.' });
    }

    const MAX_NOTES_LENGTH = 2000;
    let sanitizedNotes = notes ? String(notes).replace(/<[^>]*>/g, '').trim() : '';
    sanitizedNotes = sanitizedNotes.substring(0, MAX_NOTES_LENGTH);

    // ⭐ FIX: Convert empty string dates to null for PostgreSQL (if client missed it)
    const finalStartDate = start_date === '' ? null : start_date;
    const finalEndDate = end_date === '' ? null : end_date;
    
    try {
        const result = await query(
            `UPDATE watched_anime 
             SET notes = $1, 
                 rating = $2, 
                 start_date = $3, 
                 end_date = $4
             WHERE user_id = $5 AND anime_id = $6 RETURNING id`,
            [sanitizedNotes, rating, finalStartDate, finalEndDate, userId, animeId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, error: 'Anime record not found for this user.' });
        }
        
        res.json({ success: true, message: 'More info updated successfully.' });
    } catch (err) {
        console.error("Update info failed:", err);
        res.status(500).json({ success: false, error: 'Internal server error during update.' });
    }
});


// -------------------
// Get watched anime for user
// -------------------
app.get('/watched/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // SELECT * ensures all columns, including new ones, are returned
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
