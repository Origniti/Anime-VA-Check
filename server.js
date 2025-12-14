const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

// --- Configuration ---
const app = express();
const PORT = 3000;
const MONGO_URI = 'mongodb://localhost:27017/anime-tracker'; // Replace with your MongoDB connection string
const JWT_SECRET = 'your_super_secret_jwt_key'; // Replace with a strong, secure secret

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Database Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Schemas and Models ---

// 1. User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

const User = mongoose.model('User', UserSchema);

// 2. WatchedAnime Schema
const WatchedAnimeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    animeId: { type: Number, required: true }, // AniList ID
    title: { type: String, required: true },
    coverImage: { type: String },
    description: { type: String },
    vaInfo: [{
        name: String,
        vaName: String,
        vaLanguage: String
    }],
    notes: { type: String, default: '' },
    dateAdded: { type: Date, default: Date.now }
});

const WatchedAnime = mongoose.model('WatchedAnime', WatchedAnimeSchema);

// --- JWT Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden
        req.user = user;
        next();
    });
};

// --- API Routes ---

// 1. Register
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = new User({ username, password });
        await user.save();
        res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Username already exists.' });
        }
        res.status(500).json({ message: 'Error registering user.', error });
    }
});

// 2. Login
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful', token });

    } catch (error) {
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// 3. AniList Search Proxy
app.get('/search-anime', async (req, res) => {
    const query = req.query.query;
    if (!query) {
        return res.status(400).json({ message: 'Query parameter is required.' });
    }

    const anilistQuery = `
        query ($search: String) {
            Page(perPage: 10) {
                media(search: $search, type: ANIME, isAdult: false) {
                    id
                    title { romaji english }
                    coverImage { large }
                    description
                    characters {
                        nodes {
                            name { full }
                            voiceActors(language: JAPANESE, sort: [RELEVANCE, LANGUAGE]) {
                                name { full }
                                language
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: anilistQuery,
                variables: { search: query }
            })
        });

        const data = await response.json();

        // Map the structure to what the client expects (data.data.Page.media)
        if (data.data && data.data.Page && data.data.Page.media) {
            // Further process the data to ensure characters/VAs are correctly included
             const results = data.data.Page.media.map(anime => {
                // AniList GraphQL allows multiple voice actors per character, 
                // but the client only needs one (preferred Japanese).
                const charactersWithVA = anime.characters.nodes.map(node => {
                    // Try to find a Japanese VA, otherwise take the first available
                    let va = node.voiceActors.find(v => v.language === 'JAPANESE') || node.voiceActors[0];
                    return {
                        name: node.name,
                        voiceActors: va ? [{ name: va.name, language: va.language }] : []
                    };
                });
                return { ...anime, characters: { nodes: charactersWithVA } };
            });

            res.json({ results: data.data.Page.media });
        } else {
            res.json({ results: [] });
        }

    } catch (error) {
        console.error('AniList API error:', error);
        res.status(500).json({ message: 'Error fetching data from AniList.' });
    }
});


// 4. Add Watched Anime (Protected)
app.post('/watched', authenticateToken, async (req, res) => {
    try {
        const { animeId, title, coverImage, description, vaInfo } = req.body;
        const userId = req.user.id;

        // Check if anime is already in the list
        const existingAnime = await WatchedAnime.findOne({ userId, animeId });
        if (existingAnime) {
            return res.status(400).json({ message: 'This anime is already in your list.' });
        }

        const newAnime = new WatchedAnime({
            userId,
            animeId,
            title,
            coverImage,
            description,
            vaInfo,
            dateAdded: new Date()
        });

        await newAnime.save();
        res.status(201).json({ message: `${title} added to list!` });

    } catch (error) {
        console.error('Error adding watched anime:', error);
        res.status(500).json({ message: 'Error adding anime to list.' });
    }
});

// 5. Get Watched List (Protected)
app.get('/watched', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const list = await WatchedAnime.find({ userId }).sort({ dateAdded: -1 });
        res.json(list);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving watched list.' });
    }
});

// 6. Delete Watched Anime (Protected)
app.delete('/watched/:id', authenticateToken, async (req, res) => {
    try {
        const animeId = req.params.id;
        const userId = req.user.id;

        const result = await WatchedAnime.findOneAndDelete({ _id: animeId, userId });

        if (!result) {
            return res.status(404).json({ message: 'Anime not found or unauthorized.' });
        }

        res.json({ message: `${result.title} removed from list.` });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting anime.' });
    }
});

// 7. Update Notes (Protected)
app.put('/watched/:id/notes', authenticateToken, async (req, res) => {
    try {
        const animeId = req.params.id;
        const userId = req.user.id;
        const { notes } = req.body;

        const result = await WatchedAnime.findOneAndUpdate(
            { _id: animeId, userId },
            { notes: notes },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({ message: 'Anime not found or unauthorized.' });
        }

        res.json({ message: 'Notes updated successfully.', notes: result.notes });
    } catch (error) {
        res.status(500).json({ message: 'Error updating notes.' });
    }
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
