// script.js
// Note: This requires the server.js to be running on localhost:3000
// It also relies on the 'type="module"' attribute in the script tag in index.html

// -------------------
// Global Variables & Initialization
// -------------------
let userId = null;
let username = null;
let watched = [];
let currentPage = 1;
const itemsPerPage = 6;
let activeVAFilter = null;
let currentSort = 'recent';

// NEW: Get the sidebar container
const profileSidebar = document.getElementById('profile-sidebar'); 


// -------------------
// 1. Initial Setup and Navigation (Updated Profile Button Handler)
// -------------------

document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for user ID
    userId = localStorage.getItem('animeTrackerUserId');
    username = localStorage.getItem('animeTrackerUsername');
    
    if (userId) {
        document.getElementById('profile-username').textContent = username;
        showView('app-main');
        fetchWatchedAnime(userId);
    } else {
        showView('auth');
    }

    // Set up Auth Listeners
    setupAuthListeners();
    
    // Set up Main App View Listeners
    setupMainAppListeners();

    // Setup Modal Listeners
    setupModalListeners();
});

// Helper to switch between Auth and App views
function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    document.getElementById(viewId).style.display = 'block';

    // Update visibility of the profile button
    const profileContainer = document.getElementById('profile-container');
    if (profileContainer) {
        profileContainer.style.display = (viewId === 'app-main' ? 'block' : 'none');
    }
}

// Helper to switch between Watched and Search sub-views
function showSubView(subViewId) {
    document.querySelectorAll('#app-main .sub-view').forEach(view => {
        view.style.display = 'none';
    });
    document.getElementById(subViewId).style.display = 'block';

    document.querySelectorAll('.navbar button').forEach(button => {
        button.classList.remove('active');
        if (button.dataset.view === subViewId.replace('page-', '')) {
            button.classList.add('active');
        }
    });
}

function setupMainAppListeners() {
    // Navigation buttons (Uses the .navbar button selector)
    document.querySelectorAll('.navbar button').forEach(button => {
        button.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            showSubView(`page-${view}`);
            if (view === 'watched') {
                fetchWatchedAnime(userId);
            }
            // NEW: Close sidebar whenever a main navigation button is clicked
            if (profileSidebar && profileSidebar.classList.contains('active')) {
                profileSidebar.classList.remove('active');
            }
        });
    });

    // Profile Button Handler (UPDATED to toggle sidebar)
    const profileButton = document.querySelector('.profile-button');
    if (profileButton) {
        profileButton.addEventListener('click', toggleProfileSidebar);
    }
    
    // Close sidebar if user clicks outside
    document.addEventListener('click', (event) => {
        // If the sidebar is open AND the click is outside both the button and the sidebar
        if (profileSidebar && profileSidebar.classList.contains('active') && !profileSidebar.contains(event.target) && !profileButton.contains(event.target)) {
            profileSidebar.classList.remove('active');
        }
    });

    // Logout Handler (Ensure sidebar is closed and cleared on logout)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('animeTrackerUserId');
            localStorage.removeItem('animeTrackerUsername');
            userId = null;
            username = null;
            showView('auth');
            watched.length = 0;
            const watchedList = document.getElementById('watched-list');
            if (watchedList) watchedList.innerHTML = '';
            // NEW: Hide the sidebar on logout
            if (profileSidebar) profileSidebar.classList.remove('active');
        });
    }

    // VA Language Selector
    const vaLangSelect = document.getElementById('va-lang');
    if (vaLangSelect) {
        vaLangSelect.addEventListener('change', () => {
            // Re-render list to apply new language filter visual
            renderWatchedList(); 
        });
    }

    // Sort By Selector
    const sortBySelect = document.getElementById('sort-by');
    if (sortBySelect) {
        sortBySelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            sortWatchedList(currentSort);
            renderWatchedList();
        });
    }

    // List Search Input
    const listSearchInput = document.getElementById('list-search');
    if (listSearchInput) {
        listSearchInput.addEventListener('input', () => {
            activeVAFilter = null; // Clear VA filter on text search
            currentPage = 1;
            renderWatchedList();
        });
    }

    // Pagination Listeners
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderWatchedList();
        }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
        const filteredList = getFilteredWatchedList();
        const maxPage = Math.ceil(filteredList.length / itemsPerPage);
        if (currentPage < maxPage) {
            currentPage++;
            renderWatchedList();
        }
    });
}

// NEW FUNCTION: Toggles the profile sidebar and loads stats
function toggleProfileSidebar() {
    if (!profileSidebar) return;

    const isActive = profileSidebar.classList.toggle('active');

    if (isActive) {
        // Only fetch and render stats when opening
        calculateAndRenderStats();
    }
}


// -------------------
// 2. Authentication
// -------------------

function setupAuthListeners() {
    // ... (Login/Register logic remains the same as previously defined) ...
    document.getElementById('show-register-btn')?.addEventListener('click', () => {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        document.getElementById('auth-message').textContent = '';
    });

    document.getElementById('show-login-btn')?.addEventListener('click', () => {
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('auth-message').textContent = '';
    });

    document.getElementById('register-btn')?.addEventListener('click', async () => {
        const usernameInput = document.getElementById('register-username').value;
        const passwordInput = document.getElementById('register-password').value;
        const messageEl = document.getElementById('auth-message');

        const res = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await res.json();
        
        if (data.success) {
            messageEl.textContent = 'Registration successful! Please log in.';
            // Switch back to login form
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('login-form').style.display = 'block';
        } else {
            messageEl.textContent = data.error || 'Registration failed.';
        }
    });

    document.getElementById('login-btn')?.addEventListener('click', async () => {
        const usernameInput = document.getElementById('login-username').value;
        const passwordInput = document.getElementById('login-password').value;
        const messageEl = document.getElementById('auth-message');

        const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        const data = await res.json();

        if (data.success) {
            userId = data.userId;
            username = usernameInput;
            localStorage.setItem('animeTrackerUserId', userId);
            localStorage.setItem('animeTrackerUsername', username);
            document.getElementById('profile-username').textContent = username;
            
            showView('app-main');
            showSubView('page-watched');
            fetchWatchedAnime(userId);
        } else {
            messageEl.textContent = data.error || 'Login failed.';
        }
    });
}


// -------------------
// 3. AniList Search and Add
// -------------------

document.getElementById('anime-search')?.addEventListener('input', debounce(handleSearch, 300));
document.getElementById('search-results')?.addEventListener('click', handleAddAnime);

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

async function handleSearch(e) {
    const search = e.target.value.trim();
    const searchResultsEl = document.getElementById('search-results');
    searchResultsEl.innerHTML = '';
    
    if (search.length < 3) return;

    // Use romaji by default for searching, the VA lang selector is only for the watched list display
    const res = await fetch(`/search-anime?q=${encodeURIComponent(search)}&lang=romaji`);
    const data = await res.json();

    if (data && data.length) {
        data.forEach(anime => {
            const li = document.createElement('li');
            li.dataset.anime = JSON.stringify(anime);
            li.innerHTML = `
                <img src="${anime.coverImage.large}" style="width: 30px; height: 45px; vertical-align: middle; margin-right: 10px; border-radius: 3px;">
                <strong>${anime.title.romaji || anime.title.english}</strong> (Score: ${anime.averageScore || 'N/A'})
            `;
            searchResultsEl.appendChild(li);
        });
    } else {
        searchResultsEl.innerHTML = '<li>No results found.</li>';
    }
}

async function handleAddAnime(e) {
    let target = e.target;
    while(target && target.tagName !== 'LI') {
        target = target.parentNode;
    }
    if (!target || !target.dataset.anime) return;

    const animeData = JSON.parse(target.dataset.anime);
    const animeTitle = animeData.title.romaji || animeData.title.english;

    // Prompt user for rating
    let rating = prompt(`Enter your rating for "${animeTitle}" (1-100):`);
    rating = parseInt(rating);

    if (isNaN(rating) || rating < 1 || rating > 100) {
        alert("Invalid rating. Anime not added.");
        return;
    }

    try {
        const res = await fetch('/add-anime', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                animeId: animeData.id,
                animeTitle: animeTitle,
                rating: rating / 10, // Store as 1-10 scale
                description: animeData.description,
                coverImage: animeData.coverImage.large,
                characters: animeData.characters ? animeData.characters.edges : []
            })
        });

        const data = await res.json();
        
        if (data.success) {
            alert(`${animeTitle} added successfully!`);
            document.getElementById('anime-search').value = '';
            document.getElementById('search-results').innerHTML = '';
            // Refresh the watched list
            fetchWatchedAnime(userId); 
            // Switch back to the watched list view
            showSubView('page-watched'); 
        } else {
            alert(`Failed to add anime: ${data.error}`);
        }
    } catch (e) {
        console.error("Add anime failed:", e);
        alert("An error occurred while adding the anime.");
    }
}

// -------------------
// 4. Watched Anime List Management (Updated fetchWatchedAnime)
// -------------------

// Helper to safely parse voice actor data string from DB
function parseVoiceActors(vaString) {
    try {
        const vaData = JSON.parse(vaString);
        // Ensure both Japanese and English are present, even if empty string
        return {
            japanese: vaData.japanese || "",
            english: vaData.english || ""
        };
    } catch (e) {
        console.error("Error parsing voice actors JSON:", e);
        return { japanese: "", english: "" };
    }
}

async function fetchWatchedAnime(userId) {
    if (!userId) return;

    try {
        const res = await fetch(`/watched/${userId}`);
        const data = await res.json();

        if (data.success) {
            watched = data.data.map(item => ({
                ...item,
                // Add a parsed version of the voice actors data for easier filtering/display
                voice_actors_parsed: parseVoiceActors(item.voice_actors),
                // Ensure rating is a number
                rating: parseFloat(item.rating)
            }));
            
            // Apply sorting if needed (default to descending id, i.e., most recent first)
            sortWatchedList(currentSort); 

            activeVAFilter = null; 
            currentPage = 1;
            renderWatchedList();

            // NEW: Recalculate and render stats whenever the watched list is refreshed
            calculateAndRenderStats(); 
        } else {
            console.error('Failed to fetch watched anime:', data.error);
        }
    } catch (e) {
        console.error('Network error fetching watched anime:', e);
    }
}

function sortWatchedList(sortType) {
    switch (sortType) {
        case 'rating-desc':
            watched.sort((a, b) => b.rating - a.rating);
            break;
        case 'rating-asc':
            watched.sort((a, b) => a.rating - b.rating);
            break;
        case 'title-asc':
            watched.sort((a, b) => a.anime_title.localeCompare(b.anime_title));
            break;
        case 'recent':
        default:
            // Sort by DB ID descending (most recent first)
            watched.sort((a, b) => b.id - a.id); 
            break;
    }
}

function getFilteredWatchedList() {
    let filtered = watched;
    const search = document.getElementById('list-search')?.value.toLowerCase().trim() || '';
    const vaLang = document.getElementById('va-lang')?.value || 'japanese';

    // 1. Apply VA Filter
    if (activeVAFilter) {
        filtered = filtered.filter(anime => {
            const vaString = anime.voice_actors_parsed[vaLang];
            return vaString.includes(activeVAFilter);
        });
    }

    // 2. Apply Text Search
    if (search) {
        filtered = filtered.filter(anime => {
            const vaString = anime.voice_actors_parsed[vaLang];
            return anime.anime_title.toLowerCase().includes(search) || vaString.toLowerCase().includes(search);
        });
    }

    return filtered;
}

function renderWatchedList() {
    const listEl = document.getElementById('watched-list');
    const filtered = getFilteredWatchedList();
    const totalItems = filtered.length;
    const maxPage = Math.ceil(totalItems / itemsPerPage);
    
    // Boundary check for current page
    if (currentPage > maxPage && maxPage > 0) {
        currentPage = maxPage;
    } else if (currentPage < 1 && maxPage > 0) {
        currentPage = 1;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = filtered.slice(start, end);

    listEl.innerHTML = '';
    if (paginatedItems.length === 0) {
        listEl.innerHTML = `<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: var(--color-text-subtle);">
            No anime found. ${activeVAFilter ? `Clear VA filter or list search.` : 'Your watched list is empty.'}
        </li>`;
    }

    const vaLang = document.getElementById('va-lang')?.value || 'japanese';

    paginatedItems.forEach(anime => {
        // Prepare VA Tags
        const vaString = anime.voice_actors_parsed[vaLang];
        let vaTags = vaString.split('|').map(entry => {
            if (!entry.trim()) return '';

            // Split into characters and VA name
            const parts = entry.split(':');
            const charNames = parts[0].trim();
            const vaName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
            
            // Highlight if VA is the active filter
            const highlightClass = (vaName === activeVAFilter) ? ' highlight active-filter' : '';
            
            return `<span class="va"><span class="highlight clickable${highlightClass}" data-va-name="${vaName}">${vaName}</span> (${charNames})</span>`;
        }).join('');

        // Truncate description for card view
        const displayDescription = anime.description || 'No description available.';
        const isClipped = displayDescription.length > 200; // Heuristic based on max-height: 7em in CSS
        
        const listItem = document.createElement('li');
        listItem.dataset.id = anime.id;
        listItem.dataset.animeId = anime.anime_id;
        listItem.innerHTML = `
            <div class="anime-cover-container">
                <img src="${anime.coverImage}" alt="${anime.anime_title} cover" class="anime-cover">
            </div>
            <div class="anime-info">
                <div>
                    <b>${anime.anime_title}</b>
                    <p style="color: ${anime.rating >= 8.5 ? '#4CAF50' : (anime.rating >= 7.0 ? '#FFC107' : '#F44336')}; font-weight: bold; margin: 5px 0 10px 0;">
                        Rating: ${anime.rating.toFixed(1)} / 10
                    </p>
                    <div class="description-wrapper">
                        <span class="anime-description-text">${displayDescription}</span>
                        ${isClipped ? '<button class="read-more-btn" data-action="toggle-desc">Read More</button>' : ''}
                    </div>
                </div>
                <div class="va-tags-container">
                    ${vaTags}
                </div>
                <div class="action-buttons">
                    <button class="notes-btn" data-action="open-notes" data-title="${anime.anime_title}" data-anime-id="${anime.anime_id}" data-notes="${escapeHtml(anime.notes || '')}">Notes</button>
                    <button class="remove-btn" data-action="remove-anime" data-anime-id="${anime.anime_id}">Remove</button>
                </div>
            </div>
        `;
        listEl.appendChild(listItem);
    });

    // Update Pagination Controls
    document.getElementById('page-info').textContent = `Page ${maxPage > 0 ? currentPage : 0} of ${maxPage}`;
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= maxPage;

    // Add event listeners for the newly rendered elements
    setupCardListeners(listEl);
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setupCardListeners(container) {
    container.querySelectorAll('[data-action="toggle-desc"]').forEach(button => {
        button.addEventListener('click', (e) => {
            const descWrapper = e.target.closest('.description-wrapper');
            descWrapper.classList.toggle('expanded');
            e.target.textContent = descWrapper.classList.contains('expanded') ? 'Read Less' : 'Read More';
        });
    });

    // VA Filter Listener
    container.querySelectorAll('.highlight.clickable').forEach(vaTag => {
        vaTag.addEventListener('click', (e) => {
            const vaName = e.target.dataset.vaName;
            
            if (activeVAFilter === vaName) {
                // Clear filter
                activeVAFilter = null;
            } else {
                // Set new filter
                activeVAFilter = vaName;
                document.getElementById('list-search').value = ''; // Clear search bar
            }
            
            currentPage = 1; // Reset page after filtering
            renderWatchedList();
        });
    });

    // Remove Anime Listener
    container.querySelectorAll('[data-action="remove-anime"]').forEach(button => {
        button.addEventListener('click', handleRemoveAnime);
    });

    // Notes Button Listener
    container.querySelectorAll('[data-action="open-notes"]').forEach(button => {
        button.addEventListener('click', handleOpenNotesModal);
    });
}

async function handleRemoveAnime(e) {
    const animeId = e.target.dataset.animeId;
    const animeTitle = e.target.closest('li').querySelector('.anime-info b').textContent;

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
            // Optimistically remove from local array
            watched = watched.filter(anime => anime.anime_id !== parseInt(animeId));
            // Re-render list
            renderWatchedList();
            // NEW: Recalculate stats
            calculateAndRenderStats();
        } else {
            alert(`Failed to remove anime: ${data.error}`);
        }
    } catch (e) {
        console.error("Remove anime failed:", e);
        alert("An error occurred while removing the anime.");
    }
}

// -------------------
// 5. Notes Modal Logic
// -------------------

const notesModal = document.getElementById('notes-modal');
const closeButton = document.querySelector('.close-button');
const saveNotesBtn = document.getElementById('save-notes-btn');
const notesTextarea = document.getElementById('notes-textarea');
let currentAnimeId = null;

function setupModalListeners() {
    closeButton.onclick = () => { notesModal.style.display = 'none'; };
    window.onclick = (event) => {
        if (event.target == notesModal) {
            notesModal.style.display = 'none';
        }
    };
    saveNotesBtn.onclick = handleSaveNotes;
}

function handleOpenNotesModal(e) {
    const button = e.target;
    const title = button.dataset.title;
    const notes = button.dataset.notes ? unescapeHtml(button.dataset.notes) : '';
    currentAnimeId = button.dataset.animeId;

    document.getElementById('modal-anime-title').textContent = title;
    notesTextarea.value = notes;
    notesModal.style.display = 'block';
}

function unescapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#039;/g, "'");
}

async function handleSaveNotes() {
    const notes = notesTextarea.value;
    
    try {
        const res = await fetch('/update-notes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                animeId: currentAnimeId,
                notes: notes
            })
        });

        const data = await res.json();
        
        if (data.success) {
            alert("Notes saved successfully!");
            notesModal.style.display = 'none';
            
            // Update the local 'watched' array and re-render the list
            const index = watched.findIndex(a => a.anime_id === parseInt(currentAnimeId));
            if (index !== -1) {
                // Store the notes escaped for the dataset attribute
                watched[index].notes = notes; 
                // We re-render the list to update the notes button's dataset.notes attribute
                renderWatchedList();
            }
        } else {
            alert(`Failed to save notes: ${data.error}`);
        }
    } catch (e) {
        console.error("Save notes failed:", e);
        alert("An error occurred while saving notes.");
    }
}


// NEW FUNCTION: Calculate and Render Statistics
function calculateAndRenderStats() {
    const statsContainer = document.getElementById('stats-content');
    if (!statsContainer) return;

    if (watched.length === 0) {
        statsContainer.innerHTML = '<p class="stats-message">Your list is empty. Add some anime to see stats!</p>';
        return;
    }

    // --- 1. Total Anime ---
    const totalAnime = watched.length;

    // --- 2. Average Rating ---
    const ratedAnime = watched.filter(anime => anime.rating > 0);
    const totalRating = ratedAnime.reduce((sum, anime) => sum + anime.rating, 0);
    const avgRating = ratedAnime.length > 0 ? totalRating / ratedAnime.length : 0;

    // --- 3. Top Voice Actor ---
    const vaCount = {};
    const vaLang = document.getElementById('va-lang')?.value || 'japanese'; 
    
    watched.forEach(anime => {
        // Use the parsed object directly
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|');
        vaList.forEach(vaEntry => {
            // Extract the VA name, which is after the colon and space (e.g., 'Character: VA Name')
            const vaNameMatch = vaEntry.match(/: (.*)$/);
            const vaName = vaNameMatch ? vaNameMatch[1].trim() : null;

            if (vaName) {
                vaCount[vaName] = (vaCount[vaName] || 0) + 1;
            }
        });
    });

    let topVA = { name: 'N/A', count: 0 };
    for (const name in vaCount) {
        if (vaCount[name] > topVA.count) {
            topVA = { name, count: vaCount[name] };
        }
    }
    
    // --- 4. Most Recent Watch ---
    // Since watched is sorted by descending id, the first element is the most recent
    const mostRecent = watched[0].anime_title; 
    
    // --- Render the Stats ---
    statsContainer.innerHTML = `
        <div class="stats-group">
            <div class="stat-item">
                <span class="stat-value">${totalAnime}</span>
                <span class="stat-label">Total Watched Titles</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${avgRating.toFixed(2)} / 10</span>
                <span class="stat-label">Average Rating</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${topVA.name}</span>
                <span class="stat-label">Top ${vaLang.charAt(0).toUpperCase() + vaLang.slice(1)} VA (${topVA.count} titles)</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${mostRecent}</span>
                <span class="stat-label">Most Recently Added</span>
            </div>
        </div>
    `;
}
