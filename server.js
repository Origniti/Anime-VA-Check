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
// 2. Database Initialization
// -------------------
async function setupDatabase() {
    // Check if the connection string is actually set
    if (!connectionString) {
        console.error("FATAL: DATABASE_URL environment variable is not set. Cannot connect to database.");
        process.exit(1);
    }
    
    try {
        await query('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT)');
        
        await query('CREATE TABLE IF NOT EXISTS watched_anime (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), anime_id INTEGER, anime_title TEXT, rating REAL, voice_actors TEXT, description TEXT, coverImage TEXT)');
        
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

    // 🟢 FIX APPLIED HERE: Increase character limit for descriptions
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

        // VA Parsing
        const vaData = {
            japanese: characters.flatMap(charEdge =>
                charEdge.voiceActors
                    .filter(va => va.language && va.language.toLowerCase() === 'japanese')
                    .map(va => `${charEdge.node.name.full}: ${va.name.full}`)
            ).join('|'),
            
            english: characters.flatMap(charEdge =>
                charEdge.voiceActors
                    .filter(va => va.language && va.language.toLowerCase() === 'english')
                    .map(va => `${charEdge.node.name.full}: ${va.name.full}`)
            ).join('|')
        };
        // Store VA data as a JSON string
        const voiceActors = JSON.stringify(vaData);

        // Insert new record (Uses $1 through $7)
        const insertResult = await query(
            'INSERT INTO watched_anime (user_id, anime_id, anime_title, rating, voice_actors, description, coverImage) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [userId, animeId, animeTitle, rating, voiceActors, description, coverImage]
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
        // Uses $1, $2
        await query('DELETE FROM watched_anime WHERE user_id=$1 AND anime_id=$2', [userId, animeId]);
        res.json({ success: true });
    } catch (err) {
        console.error("Remove anime failed:", err);
        res.json({ success: false, error: err.message });
    }
});

// -------------------
// Get watched anime for user
// -------------------
app.get('/watched/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // Uses $1
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
