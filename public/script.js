// script.js

// -------------------
// Global Variables & Initialization
// -------------------
const appContainer = document.getElementById('app');
const authContainer = document.getElementById('auth');
// Correct IDs matching the fixed HTML:
const watchedContainer = document.getElementById('page-watched');
const addAnimeContainer = document.getElementById('page-add-anime');

let userId = localStorage.getItem('animeTrackerUserId'); 
const watched = [];
let currentController = null;

// Global Variables for Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;

// Global State for Voice Actor Filter
let activeVAFilter = null; 


// -------------------
// 1. Initial Setup and Navigation
// -------------------

// Check login status on load
document.addEventListener('DOMContentLoaded', () => {
    if (userId) {
        const username = localStorage.getItem('animeTrackerUsername') || 'User'; 
        document.getElementById('profile-username').textContent = username;
        showView('watched');
        fetchWatchedAnime(userId);
    } else {
        showView('auth');
    }
});

// Navigation buttons (Uses the .navbar button selector)
document.querySelectorAll('.navbar button').forEach(button => {
    button.addEventListener('click', (e) => {
        const view = e.target.dataset.view;
        showView(view);
        if (view === 'watched') {
            fetchWatchedAnime(userId);
        }
    });
});

// Profile Dropdown Button
const profileButton = document.querySelector('.profile-button');
const profileDropdown = document.getElementById('profile-dropdown');

if (profileButton) { // Ensure button exists before attaching listener
    profileButton.addEventListener('click', () => {
        const isVisible = profileDropdown.style.display === 'block';
        profileDropdown.style.display = isVisible ? 'none' : 'block';
    });
}

// Close dropdown if user clicks outside
document.addEventListener('click', (event) => {
    if (profileButton && profileDropdown && !profileButton.contains(event.target) && !profileDropdown.contains(event.target)) {
        profileDropdown.style.display = 'none';
    }
});


// Logout Handler
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('animeTrackerUserId');
        localStorage.removeItem('animeTrackerUsername');
        userId = null;
        showView('auth');
        watched.length = 0;
        const watchedList = document.getElementById('watched-list');
        if (watchedList) watchedList.innerHTML = '';
    });
}


function showView(view) {
    // Check if containers were found (Handles initial "Cannot read properties of null" error if HTML is not loaded)
    if (!authContainer || !watchedContainer || !addAnimeContainer) {
        console.error("Missing one or more required container IDs in HTML.");
        return;
    }

    authContainer.style.display = 'none';
    watchedContainer.style.display = 'none';
    addAnimeContainer.style.display = 'none';
    appContainer.classList.remove('logged-in'); 

    // Deactivate all navbar buttons
    document.querySelectorAll('.navbar button').forEach(btn => btn.classList.remove('active'));
    
    // Get profile elements safely
    const profileContainer = document.getElementById('profile-container');
    const appTitle = document.getElementById('app-main-title');
    const navbar = document.querySelector('.navbar');

    switch (view) {
        case 'auth':
            appContainer.style.maxWidth = '600px';
            authContainer.style.display = 'block';
            if (appTitle) appTitle.style.display = 'none';
            if (navbar) navbar.style.display = 'none';
            if (profileContainer) profileContainer.style.display = 'none';
            break;
        case 'watched':
            appContainer.style.maxWidth = '1200px';
            watchedContainer.style.display = 'block';
            if (profileContainer) profileContainer.style.display = 'block';
            if (appTitle) appTitle.style.display = 'block';
            if (navbar) navbar.style.display = 'flex'; // Use flex to match CSS
            document.querySelector('.navbar button[data-view="watched"]').classList.add('active');
            appContainer.classList.add('logged-in'); 
            break;
        case 'add-anime':
            appContainer.style.maxWidth = '1200px';
            addAnimeContainer.style.display = 'block';
            if (profileContainer) profileContainer.style.display = 'block';
            if (appTitle) appTitle.style.display = 'block';
            if (navbar) navbar.style.display = 'flex'; // Use flex to match CSS
            document.querySelector('.navbar button[data-view="add-anime"]').classList.add('active');
            appContainer.classList.add('logged-in');
            break;
    }
}

// -------------------
// 2. Auth Logic (Register/Login)
// -------------------

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Use correct IDs: regUsername, regPassword
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;

    const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    alert(data.success ? 'Registration successful. Please log in.' : `Registration failed: ${data.error}`);
    if (data.success) {
        e.target.reset();
        document.getElementById('login-link').click(); // Switch to login form
    }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Use correct IDs: logUsername, logPassword
    const username = document.getElementById('logUsername').value;
    const password = document.getElementById('logPassword').value;

    const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (data.success) {
        userId = data.userId;
        localStorage.setItem('animeTrackerUserId', userId);
        localStorage.setItem('animeTrackerUsername', username); // Save username
        document.getElementById('profile-username').textContent = username; // Update display
        showView('watched');
        fetchWatchedAnime(userId);
    } else {
        alert(`Login failed: ${data.error}`);
    }
});

// Switch between login and register forms
document.getElementById('register-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-title').textContent = 'Register';
    document.getElementById('register-link').style.display = 'none';
    document.getElementById('login-link').style.display = 'inline';
});

document.getElementById('login-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('auth-title').textContent = 'Login';
    document.getElementById('register-link').style.display = 'inline';
    document.getElementById('login-link').style.display = 'none';
});


// -------------------
// 3. AniList Search and Add Anime
// -------------------

const animeSearchInput = document.getElementById('anime-search');
if (animeSearchInput) {
    animeSearchInput.addEventListener('input', debounce(async (e) => {
        const query = e.target.value.trim();
        const resultsList = document.getElementById('search-results');
        if (resultsList) resultsList.innerHTML = '';
        
        if (currentController) {
            currentController.abort();
        }
        currentController = new AbortController();
        const { signal } = currentController;

        if (query.length < 3) return;

        try {
            const lang = document.getElementById('search-lang').value;
            const res = await fetch(`/search-anime?q=${encodeURIComponent(query)}&lang=${lang}`, { signal });
            const data = await res.json();

            data.forEach(anime => {
                const li = document.createElement('li');
                const title = anime.title.english || anime.title.romaji || 'Untitled';
                li.textContent = title;
                li.dataset.anime = JSON.stringify(anime);
                li.addEventListener('click', () => handleAnimeSelection(anime));
                if (resultsList) resultsList.appendChild(li);
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                // Fetch aborted
            } else {
                console.error('Search failed:', error);
            }
        }
    }, 300));
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

async function handleAnimeSelection(anime) {
    const resultsList = document.getElementById('search-results');
    if (resultsList) resultsList.innerHTML = ''; // Clear search results

    const title = anime.title.english || anime.title.romaji || 'Untitled';
    const rating = anime.averageScore || 0;
    const description = anime.description || 'No description available.';
    const coverImage = anime.coverImage.large;
    const characters = anime.characters.edges;

    const res = await fetch('/add-anime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            animeId: anime.id,
            animeTitle: title,
            rating: rating / 10, // AniList is 0-100, we want 0-10
            description,
            characters,
            coverImage
        })
    });
    const data = await res.json();
    
    if (data.success) {
        alert(`${title} added to your watched list!`);
        if (animeSearchInput) animeSearchInput.value = '';
        showView('watched');
        fetchWatchedAnime(userId); // Refresh the list
    } else {
        alert(`Failed to add anime: ${data.error}`);
    }
}


// -------------------
// 4. Watched Anime List Management
// -------------------

// Helper to safely parse voice_actors JSON string
function parseVoiceActors(jsonString) {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("Failed to parse voice actors JSON:", e);
        return { japanese: "", english: "" };
    }
}

async function fetchWatchedAnime(userId) {
    if (!userId) return;

    try {
        const res = await fetch(`/watched/${userId}`);
        const data = await res.json();

        if (data.success) {
            watched.length = 0; 
            data.data.forEach(anime => {
                anime.voice_actors_parsed = parseVoiceActors(anime.voice_actors);
                watched.push(anime);
            });
            
            // Apply sorting if needed (default to descending id, i.e., most recent first)
            watched.sort((a, b) => b.id - a.id); 

            activeVAFilter = null; 
            currentPage = 1;
            renderWatchedList();
        } else {
            console.error('Failed to fetch watched anime:', data.error);
        }
    } catch (e) {
        console.error('Network error fetching watched anime:', e);
    }
}

// Handler for the VA Language filter dropdown
const vaLangSelect = document.getElementById('va-lang');
if (vaLangSelect) {
    vaLangSelect.addEventListener('change', () => {
        renderWatchedList(); // Re-render when language changes
    });
}

// Handler for the Sort By dropdown
const sortBySelect = document.getElementById('sort-by');
if (sortBySelect) {
    sortBySelect.addEventListener('change', (e) => {
        sortWatchedList(e.target.value);
    });
}

function sortWatchedList(criteria) {
    switch (criteria) {
        case 'title-asc':
            watched.sort((a, b) => a.anime_title.localeCompare(b.anime_title));
            break;
        case 'title-desc':
            watched.sort((a, b) => b.anime_title.localeCompare(a.anime_title));
            break;
        case 'rating-desc':
            watched.sort((a, b) => b.rating - a.rating);
            break;
        case 'rating-asc':
            watched.sort((a, b) => a.rating - b.rating);
            break;
        case 'recent':
        default:
            watched.sort((a, b) => b.id - a.id);
            break;
    }
    activeVAFilter = null;
    currentPage = 1;
    renderWatchedList();
}


// -------------------
// VOICE ACTOR FILTER LOGIC
// -------------------
function toggleVAFilter(vaName) {
    if (activeVAFilter === vaName) {
        activeVAFilter = null;
    } else {
        activeVAFilter = vaName;
    }
    currentPage = 1; 
    renderWatchedList(); 
}

// -------------------
// RENDER FUNCTION
// -------------------
function renderWatchedList() {
    const list = document.getElementById('watched-list');
    if (!list) return; // Exit if list container isn't found
    
    list.innerHTML = '';
    
    const vaLang = document.getElementById('va-lang').value;
    
    // 1. Determine which list to use (Filtered or Full)
    const filteredList = watched.filter(anime => {
        if (!activeVAFilter) return true; 
        
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        return vaString.includes(activeVAFilter); 
    });
    
    // 2. Pagination Calculations (based on filtered list)
    totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);
    currentPage = Math.min(currentPage, totalPages > 0 ? totalPages : 1);
    currentPage = Math.max(currentPage, 1); 

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const animeToRender = filteredList.slice(start, end);
    
    // 3. VA Count (Count across ALL watched items for highlighting accuracy)
    const vaCount = {};
    watched.forEach(anime => {
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|');
        vaList.forEach(vaEntry => {
            const vaName = vaEntry.split(': ')[1]?.trim();
            if (vaName) {
                vaCount[vaName] = (vaCount[vaName] || 0) + 1;
            }
        });
    });

    // 4. Update the Page Title to show filter status
    const pageTitle = document.querySelector('#page-watched h2');
    if (pageTitle) {
        if (activeVAFilter) {
            pageTitle.innerHTML = `Watched by <span class="highlight clickable active-filter">${activeVAFilter}</span> (Click to clear)`;
            const vaTitleSpan = pageTitle.querySelector('.highlight');
            if (vaTitleSpan) vaTitleSpan.onclick = () => toggleVAFilter(activeVAFilter);
        } else {
            pageTitle.textContent = 'Your Watched List';
        }
        if (filteredList.length === 0 && watched.length > 0) {
            pageTitle.textContent = activeVAFilter 
                ? `No anime found featuring ${activeVAFilter} in the selected language.`
                : 'No results found with current filters.';
        }
    }

    // 5. Render Anime Cards
    if (animeToRender.length === 0) {
        if (!activeVAFilter && watched.length === 0) {
             list.innerHTML = '<p style="text-align: center; color: var(--color-text-subtle);">Your watched list is empty. Add some anime!</p>';
        }
    }

    animeToRender.forEach(anime => {
        const li = document.createElement('li');
        
        // --- Image Container ---
        const coverContainer = document.createElement('div');
        coverContainer.className = 'anime-cover-container';
        const img = document.createElement('img');
        img.className = 'anime-cover';
        img.src = anime.coverimage || 'placeholder.jpg';
        img.alt = `${anime.anime_title} cover`;
        coverContainer.appendChild(img);
        li.appendChild(coverContainer);

        // --- Info Container ---
        const infoDiv = document.createElement('div');
        infoDiv.className = 'anime-info';

        // Title and Rating
        infoDiv.innerHTML = `
            <b>${anime.anime_title}</b>
            <p>Rating: ${anime.rating.toFixed(1)}/10.0</p>
        `;

        // Description with Read More Toggle
        const descriptionWrapper = document.createElement('div');
        descriptionWrapper.className = 'description-wrapper';
        
        const descText = document.createElement('span');
        descText.className = 'anime-description-text';
        descText.textContent = stripHtml(anime.description || 'No description.');
        descriptionWrapper.appendChild(descText);

        const readMoreBtn = document.createElement('button');
        readMoreBtn.className = 'read-more-btn';
        readMoreBtn.textContent = 'Read More';
        
        // SIMPLIFIED READ MORE LOGIC: Use a character threshold
        const descriptionLengthThreshold = 200;
        const needsClipping = descText.textContent.length > descriptionLengthThreshold;
        
        if (needsClipping) {
             // Ensure initial state is clipped in JS, overriding potential CSS issues
             descText.style.maxHeight = '7em'; 
             descText.style.overflow = 'hidden'; 
             
             readMoreBtn.onclick = () => {
                const isExpanded = descText.parentNode.classList.toggle('expanded');
                readMoreBtn.textContent = isExpanded ? 'Read Less' : 'Read More';
                
                // Manually set styles to override CSS clipping/expansion
                descText.style.maxHeight = isExpanded ? '1000px' : '7em'; 
                descText.style.overflow = isExpanded ? 'visible' : 'hidden'; 
             };
             descriptionWrapper.appendChild(readMoreBtn);
        } else {
            // If it doesn't need clipping, ensure max-height is removed
            descText.style.maxHeight = 'none';
            readMoreBtn.style.display = 'none';
        }
        
        infoDiv.appendChild(descriptionWrapper);


        // Voice Actor Tags
        const vaTagsContainer = document.createElement('div');
        vaTagsContainer.className = 'va-tags-container';
        
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|').filter(v => v.trim() !== '');
        let actualVACount = 0;

        vaList.forEach(va=>{
            const parts = va.split(': ');
            const vaName = parts[1]?.trim() || '';
            
            if(vaName){
                let vaHtml = va;
                
                if(vaCount[vaName]>1) {
                    vaHtml = va.replace(vaName, `<span class="highlight clickable">${vaName}</span>`);
                    
                    if (activeVAFilter === vaName) {
                        vaHtml = vaHtml.replace('highlight clickable', 'highlight clickable active-filter');
                    }
                }
                
                const vaSpan = document.createElement('span');
                vaSpan.className = 'va';
                vaSpan.innerHTML = vaHtml;

                if(vaCount[vaName]>1) {
                    const vaFilterSpan = vaSpan.querySelector('.highlight.clickable');
                    if (vaFilterSpan) {
                        vaFilterSpan.addEventListener('click', (event) => {
                            event.stopPropagation();
                            toggleVAFilter(vaName);
                        });
                    }
                }

                vaTagsContainer.appendChild(vaSpan);
                actualVACount++;
            }
        });
        
        if (actualVACount === 0) {
            vaTagsContainer.innerHTML = `<span class="va" style="color: var(--color-text-subtle);">No ${vaLang} VAs listed.</span>`;
        }
        infoDiv.appendChild(vaTagsContainer);

        // Action Buttons (Notes and Remove)
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        const notesBtn = document.createElement('button');
        notesBtn.className = 'notes-btn';
        notesBtn.textContent = anime.notes ? 'View/Edit Notes' : 'Add Notes';
        notesBtn.onclick = () => openNotesModal(anime.anime_id, anime.anime_title, anime.notes || '');
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => removeAnime(anime.anime_id, anime.anime_title);
        
        actionButtons.appendChild(notesBtn);
        actionButtons.appendChild(removeBtn);
        
        infoDiv.appendChild(actionButtons);
        
        li.appendChild(infoDiv);
        list.appendChild(li);
    });
    
    updatePaginationControls();
}


// -------------------
// 5. Pagination
// -------------------

function updatePaginationControls() {
    const controls = document.getElementById('pagination-controls');
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (!controls) return;
    
    if (totalPages <= 1) {
        controls.style.display = 'none';
        return;
    }
    
    controls.style.display = 'flex';
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
}

const prevPageBtn = document.getElementById('prev-page');
if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderWatchedList();
        }
    });
}

const nextPageBtn = document.getElementById('next-page');
if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderWatchedList();
        }
    });
}


// -------------------
// 6. Utility Functions (Remove, Notes Modal)
// -------------------

function stripHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
}

async function removeAnime(animeId, animeTitle) {
    if (!confirm(`Are you sure you want to remove "${animeTitle}" from your watched list?`)) {
        return;
    }

    try {
        const res = await fetch(`/remove-anime/${userId}/${animeId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        
        if (data.success) {
            alert(`${animeTitle} removed successfully.`);
            fetchWatchedAnime(userId); 
        } else {
            alert(`Failed to remove anime: ${data.error}`);
        }
    } catch (e) {
        console.error('Network error during remove:', e);
    }
}

// --- Notes Modal Logic ---
const modal = document.getElementById('notes-modal');
const closeBtn = document.querySelector('.close-button');
const notesTextarea = document.getElementById('notes-textarea');
// Use the correct ID from the fixed HTML:
const saveNotesBtn = document.getElementById('save-notes-btn'); 
const modalTitle = document.getElementById('notes-modal-title');

let currentAnimeId = null;

if (closeBtn) {
    closeBtn.onclick = () => {
        if (modal) modal.style.display = 'none';
        currentAnimeId = null;
    };
}

window.onclick = (event) => {
    if (modal && event.target === modal) {
        modal.style.display = 'none';
        currentAnimeId = null;
    }
};

function openNotesModal(animeId, title, currentNotes) {
    currentAnimeId = animeId;
    if (modalTitle) modalTitle.textContent = `Notes for: ${title}`;
    if (notesTextarea) notesTextarea.value = currentNotes;
    if (modal) modal.style.display = 'block';
}

if (saveNotesBtn) {
    saveNotesBtn.onclick = async () => {
        if (!currentAnimeId || !userId || !notesTextarea) return;

        const newNotes = notesTextarea.value;
        
        try {
            const res = await fetch('/update-notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    animeId: currentAnimeId,
                    notes: newNotes
                })
            });
            const data = await res.json();

            if (data.success) {
                alert('Notes saved successfully!');
                if (modal) modal.style.display = 'none';
                
                const index = watched.findIndex(a => a.anime_id === currentAnimeId);
                if (index !== -1) {
                    watched[index].notes = newNotes;
                }
                renderWatchedList(); 
            } else {
                alert(`Failed to save notes: ${data.error}`);
            }
        } catch (e) {
            console.error('Network error saving notes:', e);
            alert('An error occurred while trying to save notes.');
        }
    };
}
