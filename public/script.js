// script.js

// -------------------
// Global Variables & Initialization
// -------------------
const appContainer = document.getElementById('app');
const authContainer = document.getElementById('auth');
const watchedContainer = document.getElementById('page-watched');
const addAnimeContainer = document.getElementById('page-add-anime');

let userId = localStorage.getItem('animeTrackerUserId'); 
const watched = [];
let currentController = null;

// New Global Variables for Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;

// NEW GLOBAL STATE FOR VOICE ACTOR FILTER
let activeVAFilter = null; // Stores the name of the active VA, e.g., "Bryce Papenbrook" 
// ----------------------------------------


// -------------------
// 1. Initial Setup and Navigation
// -------------------

// Check login status on load
document.addEventListener('DOMContentLoaded', () => {
    if (userId) {
        // Fetch username from localStorage to display in profile
        const username = localStorage.getItem('animeTrackerUsername') || 'User'; 
        document.getElementById('profile-username').textContent = username;
        showView('watched');
        fetchWatchedAnime(userId);
    } else {
        showView('auth');
    }
});

// Navigation buttons
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

profileButton.addEventListener('click', () => {
    const isVisible = profileDropdown.style.display === 'block';
    profileDropdown.style.display = isVisible ? 'none' : 'block';
});

// Close dropdown if user clicks outside
document.addEventListener('click', (event) => {
    if (!profileButton.contains(event.target) && !profileDropdown.contains(event.target)) {
        profileDropdown.style.display = 'none';
    }
});


// Logout Handler
document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('animeTrackerUserId');
    localStorage.removeItem('animeTrackerUsername');
    userId = null;
    showView('auth');
    // Clear watched array and list
    watched.length = 0;
    document.getElementById('watched-list').innerHTML = '';
});


function showView(view) {
    authContainer.style.display = 'none';
    watchedContainer.style.display = 'none';
    addAnimeContainer.style.display = 'none';
    appContainer.classList.remove('logged-in'); // Remove title when logged out

    // Deactivate all navbar buttons
    document.querySelectorAll('.navbar button').forEach(btn => btn.classList.remove('active'));

    switch (view) {
        case 'auth':
            appContainer.style.maxWidth = '600px';
            authContainer.style.display = 'block';
            document.getElementById('app-main-title').style.display = 'none';
            document.querySelector('.navbar').style.display = 'none';
            document.getElementById('profile-container').style.display = 'none';
            break;
        case 'watched':
            appContainer.style.maxWidth = '1200px';
            watchedContainer.style.display = 'block';
            document.getElementById('profile-container').style.display = 'block';
            document.getElementById('app-main-title').style.display = 'block';
            document.querySelector('.navbar').style.display = 'block';
            document.querySelector('.navbar button[data-view="watched"]').classList.add('active');
            appContainer.classList.add('logged-in'); // Show title when logged in
            break;
        case 'add-anime':
            appContainer.style.maxWidth = '1200px';
            addAnimeContainer.style.display = 'block';
            document.getElementById('profile-container').style.display = 'block';
            document.getElementById('app-main-title').style.display = 'block';
            document.querySelector('.navbar').style.display = 'block';
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
    const username = e.target.elements.regUsername.value;
    const password = e.target.elements.regPassword.value;

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
    const username = e.target.elements.logUsername.value;
    const password = e.target.elements.logPassword.value;

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
document.getElementById('register-link').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('auth-title').textContent = 'Register';
    document.getElementById('register-link').style.display = 'none';
    document.getElementById('login-link').style.display = 'inline';
});

document.getElementById('login-link').addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('auth-title').textContent = 'Login';
    document.getElementById('register-link').style.display = 'inline';
    document.getElementById('login-link').style.display = 'none';
});


// -------------------
// 3. AniList Search and Add Anime
// -------------------

document.getElementById('anime-search').addEventListener('input', debounce(async (e) => {
    const query = e.target.value.trim();
    const resultsList = document.getElementById('search-results');
    resultsList.innerHTML = '';
    
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
            resultsList.appendChild(li);
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            // console.log('Fetch aborted');
        } else {
            console.error('Search failed:', error);
        }
    }
}, 300));

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Function to handle the selected anime from search results
async function handleAnimeSelection(anime) {
    document.getElementById('search-results').innerHTML = ''; // Clear search results

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
        document.getElementById('anime-search').value = '';
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
            // Clear and repopulate the global 'watched' array
            watched.length = 0; 
            data.data.forEach(anime => {
                // Add a parsed version of the VA string for easier access
                anime.voice_actors_parsed = parseVoiceActors(anime.voice_actors);
                watched.push(anime);
            });
            
            // Apply sorting if needed (default to descending id, i.e., most recent first)
            watched.sort((a, b) => b.id - a.id); 

            // IMPORTANT: Clear any active filter before fetching/sorting new data
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
document.getElementById('va-lang').addEventListener('change', () => {
    renderWatchedList(); // Re-render when language changes
});

// Handler for the Sort By dropdown
document.getElementById('sort-by').addEventListener('change', (e) => {
    sortWatchedList(e.target.value);
});

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
             // Sorting by internal database ID ensures 'recent' order (newest ID is highest)
            watched.sort((a, b) => b.id - a.id);
            break;
    }
    // Always reset filter and page after sorting
    activeVAFilter = null;
    currentPage = 1;
    renderWatchedList();
}


// -------------------
// NEW VOICE ACTOR FILTER LOGIC
// -------------------
function toggleVAFilter(vaName) {
    // If the currently active filter is clicked, clear it.
    if (activeVAFilter === vaName) {
        activeVAFilter = null;
    } else {
        // Otherwise, set the new filter.
        activeVAFilter = vaName;
    }
    // Always reset page to 1 and re-render after filtering
    currentPage = 1; 
    renderWatchedList(); 
}

// -------------------
// RENDER FUNCTION
// -------------------
function renderWatchedList() {
    const list = document.getElementById('watched-list');
    list.innerHTML = '';
    const vaLang = document.getElementById('va-lang').value;
    
    // 1. Determine which list to use (Filtered or Full)
    const filteredList = watched.filter(anime => {
        if (!activeVAFilter) return true; // Show all if no filter
        
        // Check if the anime's VA string for the selected language contains the active VA's name
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        return vaString.includes(activeVAFilter); 
    });
    
    // 2. Pagination Calculations (based on filtered list)
    totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE);
    currentPage = Math.min(currentPage, totalPages > 0 ? totalPages : 1); // Prevent page from exceeding total
    currentPage = Math.max(currentPage, 1); // Ensure page is at least 1

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
    if (activeVAFilter) {
        // Use innerHTML to allow the span for highlighting
        pageTitle.innerHTML = `Watched by <span class="highlight clickable active-filter">${activeVAFilter}</span> (Click to clear)`;
        // If the VA name is clicked here, we clear the filter
        pageTitle.querySelector('.highlight').onclick = () => toggleVAFilter(activeVAFilter);
    } else {
        pageTitle.textContent = 'Your Watched List';
        if (filteredList.length === 0 && watched.length > 0) {
            pageTitle.textContent = 'No results found with current filters.';
        }
    }

    // 5. Render Anime Cards
    if (animeToRender.length === 0) {
        if (!activeVAFilter && watched.length === 0) {
             list.innerHTML = '<p style="text-align: center;">Your watched list is empty. Add some anime!</p>';
        } else if (filteredList.length === 0) {
             list.innerHTML = `<p style="text-align: center;">No anime found featuring <span class="highlight">${activeVAFilter}</span> in the selected language.</p>`;
        }
    }

    animeToRender.forEach(anime => {
        const li = document.createElement('li');
        
        // --- Image Container (Fixed Aspect Ratio) ---
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
        
        // Check if clipping is necessary
        const tempDiv = document.createElement('div');
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.position = 'absolute';
        tempDiv.style.maxHeight = '7em'; 
        tempDiv.textContent = descText.textContent;
        document.body.appendChild(tempDiv);
        const needsClipping = tempDiv.scrollHeight > tempDiv.clientHeight;
        document.body.removeChild(tempDiv);
        
        if (needsClipping) {
             readMoreBtn.onclick = () => {
                descText.parentNode.classList.toggle('expanded');
                readMoreBtn.textContent = descText.parentNode.classList.contains('expanded') ? 'Read Less' : 'Read More';
             };
             descriptionWrapper.appendChild(readMoreBtn);
        } else {
            // If it doesn't need clipping, remove the button
            readMoreBtn.style.display = 'none';
        }
        
        infoDiv.appendChild(descriptionWrapper);


        // Voice Actor Tags
        const vaTagsContainer = document.createElement('div');
        vaTagsContainer.className = 'va-tags-container';
        
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|').filter(v => v.trim() !== ''); // Filter out empty strings
        let actualVACount = 0;

        vaList.forEach(va=>{
            // va is "Character1, Character2: VA Name"
            const parts = va.split(': ');
            const vaName = parts[1]?.trim() || '';
            
            if(vaName){
                let vaHtml = va;
                
                // Check if the VA name is shared (count > 1)
                if(vaCount[vaName]>1) {
                    // Replace VA Name with a highlighted, clickable span
                    vaHtml = va.replace(vaName, `<span class="highlight clickable">${vaName}</span>`);
                    
                    // If this is the active filter, add an 'active-filter' class for visual feedback
                    if (activeVAFilter === vaName) {
                        vaHtml = vaHtml.replace('highlight clickable', 'highlight clickable active-filter');
                    }
                }
                
                const vaSpan = document.createElement('span');
                vaSpan.className = 'va';
                vaSpan.innerHTML = vaHtml;

                // NEW: Add click listener only to the shared VA name if present
                if(vaCount[vaName]>1) {
                    // Find the newly inserted span element inside vaSpan
                    const vaFilterSpan = vaSpan.querySelector('.highlight.clickable');
                    if (vaFilterSpan) {
                        vaFilterSpan.addEventListener('click', (event) => {
                            // Stop propagation so the click doesn't trigger the card or other elements
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
    
    // Update pagination controls
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

    if (totalPages <= 1) {
        controls.style.display = 'none';
        return;
    }
    
    controls.style.display = 'flex';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
}

document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderWatchedList();
    }
});

document.getElementById('next-page').addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        renderWatchedList();
    }
});


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
            fetchWatchedAnime(userId); // Re-fetch/Re-render the list
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
const saveNotesBtn = document.getElementById('save-notes-btn');
const modalTitle = document.getElementById('notes-modal-title');

let currentAnimeId = null;

function openNotesModal(animeId, title, currentNotes) {
    currentAnimeId = animeId;
    modalTitle.textContent = `Notes for: ${title}`;
    notesTextarea.value = currentNotes;
    modal.style.display = 'block';
}

closeBtn.onclick = () => {
    modal.style.display = 'none';
    currentAnimeId = null;
};

window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
        currentAnimeId = null;
    }
};

saveNotesBtn.onclick = async () => {
    if (!currentAnimeId || !userId) return;

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
            modal.style.display = 'none';
            // Update the local watched array and re-render
            const index = watched.findIndex(a => a.anime_id === currentAnimeId);
            if (index !== -1) {
                watched[index].notes = newNotes;
            }
            // A full re-render is safer to ensure the 'Add Notes' button text updates
            renderWatchedList(); 
        } else {
            alert(`Failed to save notes: ${data.error}`);
        }
    } catch (e) {
        console.error('Network error saving notes:', e);
        alert('An error occurred while trying to save notes.');
    }
};
