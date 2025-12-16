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
        // Required for deployment platforms like Heroku
        rejectUnauthorized: false
    }
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
});

// Helper function to simplify query execution
const query = (text, params) => pool.query(text, params);


// -------------------
// HELPER FUNCTION: Get Relationship Status
// -------------------
/**
 * Determines the relationship status between two users.
 * @param {number} user1Id - The ID of the primary user (e.g., the current user).
 * @param {number} user2Id - The ID of the target user.
 * @returns {Promise<string>} - 'friends', 'request_sent', 'request_received', or 'none'.
 */
async function getRelationshipStatus(user1Id, user2Id) {
    user1Id = parseInt(user1Id);
    user2Id = parseInt(user2Id);
    if (user1Id === user2Id) return 'self';

    // 1. Check if already friends (in friends_list)
    const minId = Math.min(user1Id, user2Id);
    const maxId = Math.max(user1Id, user2Id);

    const friendshipCheck = await pool.query(
        'SELECT 1 FROM friends_list WHERE user_id_1 = $1 AND user_id_2 = $2',
        [minId, maxId]
    );
    if (friendshipCheck.rows.length > 0) return 'friends';

    // 2. Check for pending requests (in either direction)
    const requestCheck = await pool.query(
        `SELECT requester_id 
         FROM friend_requests 
         WHERE (requester_id = $1 AND recipient_id = $2) 
         OR (requester_id = $2 AND recipient_id = $1) 
         AND status = 'pending'`,
        [user1Id, user2Id]
    );
    
    if (requestCheck.rows.length > 0) {
        // Check which user sent the request
        if (requestCheck.rows[0].requester_id === user1Id) {
            return 'request_sent';
        } else {
            return 'request_received';
        }
    }
    
    return 'none';
}


// -------------------
// 2. Database Initialization
// -------------------
async function setupDatabase() {
    if (!connectionString) {
        console.error("FATAL: DATABASE_URL environment variable is not set. Cannot connect to database.");
        process.exit(1);
    }
    
    try {
        await query('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT)');
        
        // Main watched list table
        await query('CREATE TABLE IF NOT EXISTS watched_anime (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), anime_id INTEGER, anime_title TEXT, rating REAL, voice_actors TEXT, description TEXT, coverImage TEXT, notes TEXT, UNIQUE(user_id, anime_id))');
        
        // Friend System Tables
        await query(`
            CREATE TABLE IF NOT EXISTS friend_requests (
                id SERIAL PRIMARY KEY,
                requester_id INT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                recipient_id INT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                status VARCHAR(10) CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                -- Constraint: Prevent a user from sending a request to themselves
                CONSTRAINT no_self_request CHECK (requester_id <> recipient_id),
                -- Constraint: Ensure only one pending request exists between two users
                CONSTRAINT unique_pending_request UNIQUE (requester_id, recipient_id)
            );
        `);
        
        await query(`
            CREATE TABLE IF NOT EXISTS friends_list (
                user_id_1 INT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                user_id_2 INT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                CONSTRAINT user_order CHECK (user_id_1 < user_id_2), 
                PRIMARY KEY (user_id_1, user_id_2)
            );
        `);

        // === EXISTING DATABASE MIGRATION STEP: Add 'notes' column if it doesn't exist ===
        await query(`
            DO $$ BEGIN
                BEGIN
                    ALTER TABLE watched_anime ADD COLUMN notes TEXT;
                EXCEPTION
                    WHEN duplicate_column THEN null;
                END;
            END $$;
        `);
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
    
    const initialNotes = ''; 

    try {
        // Check for duplicate
        const duplicateResult = await query('SELECT id FROM watched_anime WHERE user_id=$1 AND anime_id=$2', [userId, animeId]);
        if (duplicateResult.rows.length > 0) {
            return res.json({ success: false, error: "Anime already added" });
        }

        // --- START OF VOICE ACTOR Processing (Your original logic looks correct) ---
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
        
        // --- END OF VOICE ACTOR Processing ---

        // Insert new record
        const insertResult = await query(
            'INSERT INTO watched_anime (user_id, anime_id, anime_title, rating, voice_actors, description, coverImage, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [userId, animeId, animeTitle, rating, voiceActors, description, coverImage, initialNotes]
        );

        res.json({ success: true, animeId: insertResult.rows[0].id });
    } catch (err) {
        console.error("Add anime failed:", err);
        // Catch PostgreSQL unique constraint error
        if (err.code === '23505') {
             return res.json({ success: false, error: "Anime is already in your watched list." });
        }
        res.json({ success: false, error: err.message });
    }
});

// -------------------
// Remove anime
// -------------------
app.delete('/remove-anime/:userId/:animeId', async (req, res) => {
    const { userId, animeId } = req.params;
    try {
        const result = await query('DELETE FROM watched_anime WHERE user_id=$1 AND anime_id=$2 RETURNING id', [userId, animeId]);
        if (result.rowCount === 0) {
            return res.json({ success: false, error: 'Anime not found in list.' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Remove anime failed:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// -------------------
// Update anime notes
// -------------------
app.patch('/update-notes', async (req, res) => {
    const { userId, animeId, notes } = req.body;
    
    if (!userId || !animeId) {
        return res.status(400).json({ success: false, error: 'User ID and Anime ID are required.' });
    }

    const MAX_NOTES_LENGTH = 2000;
    let sanitizedNotes = notes ? String(notes).replace(/<[^>]*>/g, '').trim() : '';
    sanitizedNotes = sanitizedNotes.substring(0, MAX_NOTES_LENGTH);
    
    try {
        const result = await query(
            'UPDATE watched_anime SET notes = $1 WHERE user_id = $2 AND anime_id = $3 RETURNING id',
            [sanitizedNotes, userId, animeId]
        );

        if (result.rowCount === 0) {
            return res.json({ success: false, error: 'Anime record not found for this user.' });
        }
        
        res.json({ success: true, message: 'Notes updated successfully.' });
    } catch (err) {
        console.error("Update notes failed:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// -------------------
// Get watched anime for user (Includes Friend View Capability)
// -------------------
app.get('/watched/:userId', async (req, res) => {
    const targetUserId = parseInt(req.params.userId);
    // Note: The client-side logic should handle checking if the current user has permission
    // to view the list (i.e., if they are friends or if targetUserId is the current user's ID).
    
    if (isNaN(targetUserId)) {
        return res.status(400).json({ success: false, error: 'Invalid User ID.' });
    }

    try {
        const result = await query('SELECT * FROM watched_anime WHERE user_id=$1', [targetUserId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error("Get watched failed:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// -----------------------------------------------------------
// 8. NEW FRIEND SYSTEM ENDPOINTS
// -----------------------------------------------------------

// A. Search Users
app.get('/api/users/search', async (req, res) => {
    const { q, userId: currentUserIdStr } = req.query; 
    const currentUserId = parseInt(currentUserIdStr);
    
    if (!q || q.length < 3 || isNaN(currentUserId)) {
        return res.status(200).json({ users: [] });
    }
    
    try {
        // Find users matching the search term 'q' (case-insensitive)
        const userSearchQuery = `
            SELECT id, username 
            FROM users 
            WHERE username ILIKE $1 
            AND id <> $2 
            LIMIT 10;
        `;
        const searchResults = await pool.query(userSearchQuery, [`%${q}%`, currentUserId]);

        const usersWithStatus = await Promise.all(searchResults.rows.map(async (user) => {
            const status = await getRelationshipStatus(currentUserId, user.id);
            return {
                id: user.id,
                username: user.username,
                relationshipStatus: status
            };
        }));
        
        res.json({ success: true, users: usersWithStatus });
    } catch (error) {
        console.error('User search failed:', error);
        res.status(500).json({ success: false, error: 'Server error during search.' });
    }
});

// B. Send Friend Request
app.post('/api/friends/request/:recipientId', async (req, res) => {
    const requesterId = parseInt(req.body.userId); 
    const recipientId = parseInt(req.params.recipientId);

    if (isNaN(requesterId) || isNaN(recipientId) || requesterId === recipientId) {
        return res.status(400).json({ success: false, error: 'Invalid user IDs or self-request.' });
    }

    try {
        const status = await getRelationshipStatus(requesterId, recipientId);
        
        if (status !== 'none') {
            let errorMsg = 'A relationship already exists or is pending.';
            if (status === 'friends') errorMsg = 'You are already friends with this user.';
            if (status === 'request_sent') errorMsg = 'You have already sent a pending request.';
            if (status === 'request_received') errorMsg = 'This user has already sent you a request. Please check your pending list.';
            return res.status(400).json({ success: false, error: errorMsg });
        }

        // Insert the new request
        const insertQuery = `
            INSERT INTO friend_requests (requester_id, recipient_id)
            VALUES ($1, $2)
            RETURNING id;
        `;
        await pool.query(insertQuery, [requesterId, recipientId]);
        
        res.json({ success: true, message: 'Friend request sent.' });

    } catch (error) {
        // Catch the unique_pending_request constraint
        if (error.code === '23505') {
            return res.status(400).json({ success: false, error: 'A request is already pending between these users.' });
        }
        console.error('Send friend request failed:', error);
        res.status(500).json({ success: false, error: 'Server error: Could not send request.' });
    }
});

// C. Get Pending Requests (Requests RECEIVED by the user)
app.get('/api/friends/pending/:userId', async (req, res) => {
    const recipientId = parseInt(req.params.userId);

    if (isNaN(recipientId)) {
        return res.status(400).json({ success: false, error: 'Invalid User ID.' });
    }

    try {
        const query = `
            SELECT 
                fr.id, 
                fr.requester_id, 
                u.username AS requester_username 
            FROM friend_requests fr
            JOIN users u ON fr.requester_id = u.id
            WHERE fr.recipient_id = $1 
            AND fr.status = 'pending'
            ORDER BY fr.created_at DESC;
        `;
        const result = await pool.query(query, [recipientId]);

        res.json({ success: true, requests: result.rows });
    } catch (error) {
        console.error('Error fetching pending requests:', error);
        res.status(500).json({ success: false, error: 'Server error fetching requests.' });
    }
});

// D. Handle Friend Request (Accept/Reject) - **TRANSACTIONAL FIX**
app.patch('/api/friends/request/:requestId', async (req, res) => {
    const requestId = parseInt(req.params.requestId);
    const { userId: currentUserIdStr, action } = req.body; 
    const currentUserId = parseInt(currentUserIdStr);
    
    let dbStatus = action.toLowerCase(); 
    if (dbStatus === 'accept') {
        dbStatus = 'accepted'; 
    } else if (dbStatus === 'reject') {
        dbStatus = 'rejected'; 
    }

    if (isNaN(requestId) || isNaN(currentUserId) || (dbStatus !== 'accepted' && dbStatus !== 'rejected')) {
        return res.status(400).json({ success: false, error: 'Invalid request ID, user ID, or action.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Start transaction

        // 1. Get the request details and verify the user is the recipient
        const requestQuery = `
            SELECT requester_id, recipient_id, status
            FROM friend_requests
            WHERE id = $1 AND recipient_id = $2 AND status = 'pending';
        `;
        const requestResult = await client.query(requestQuery, [requestId, currentUserId]);
        
        if (requestResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Pending request not found or you are not the recipient.' });
        }
        
        const { requester_id, recipient_id } = requestResult.rows[0];

        // 2. Update the request status
        const updateRequestQuery = `
            UPDATE friend_requests 
            SET status = $1 
            WHERE id = $2;
        `;
        await client.query(updateRequestQuery, [dbStatus, requestId]);

        if (dbStatus === 'accepted') { 
            // 3. If accepted, create a friendship entry in friends_list
            const user1 = Math.min(requester_id, recipient_id);
            const user2 = Math.max(requester_id, recipient_id);

            const insertFriendshipQuery = `
                INSERT INTO friends_list (user_id_1, user_id_2)
                VALUES ($1, $2)
                ON CONFLICT (user_id_1, user_id_2) DO NOTHING;
            `;
            await client.query(insertFriendshipQuery, [user1, user2]);
        }
        
        await client.query('COMMIT'); // Commit transaction
        res.json({ success: true, message: `Friend request ${dbStatus}!` });

    } catch (error) {
        await client.query('ROLLBACK'); // Rollback on error
        console.error(`CRITICAL DB ERROR processing friend request ${dbStatus}:`, error); 
        res.status(500).json({ success: false, error: 'Server error processing request.' });
    } finally {
        client.release();
    }
});

// E. Get List of Confirmed Friends (NEW)
app.get('/api/friends/:userId', async (req, res) => {
    const currentUserId = parseInt(req.params.userId);

    if (isNaN(currentUserId)) {
        return res.status(400).json({ success: false, error: 'Invalid User ID.' });
    }

    try {
        // Selects the ID and username of the 'other' user in the friends_list table
        const query = `
            SELECT 
                CASE
                    WHEN fl.user_id_1 = $1 THEN fl.user_id_2
                    ELSE fl.user_id_1
                END AS friend_id,
                u.username AS friend_username
            FROM friends_list fl
            JOIN users u 
                ON u.id = CASE
                            WHEN fl.user_id_1 = $1 THEN fl.user_id_2
                            ELSE fl.user_id_1
                        END
            WHERE fl.user_id_1 = $1 OR fl.user_id_2 = $1
            ORDER BY u.username;
        `;
        const result = await pool.query(query, [currentUserId]);

        res.json({ success: true, friends: result.rows });
    } catch (error) {
        console.error('Error fetching friends list:', error);
        res.status(500).json({ success: false, error: 'Server error fetching friends.' });
    }
});

// -------------------
// Search anime from AniList API (Kept your existing AniList route)
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
            // Attempt to read error message from AniList response if available
            const errorText = await response.text(); 
            throw new Error(`HTTP Error: ${response.status} - ${errorText.substring(0, 100)}...`);
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
