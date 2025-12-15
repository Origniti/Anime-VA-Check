// script.js
// Note: This file requires the server.js to be running on localhost:3000

// =================================================================================
// GLOBAL STATE & INITIALIZATION
// =================================================================================

let userId = null;
let username = null;
let watched = [];
let friendRequests = []; // Stores pending requests for the current user
let friendsList = []; // Stores confirmed friends
let currentPage = 1;
const itemsPerPage = 6;
let activeVAFilter = null; // Used for click-to-filter on the watched list
let currentSort = 'recent';
const PLACEHOLDER_IMAGE = '/placeholder.png'; // Placeholder image path

// DOM Elements
const profileSidebar = document.getElementById('profile-sidebar');
const listSearchInput = document.getElementById('list-search');


// =================================================================================
// 1. INITIAL SETUP AND NAVIGATION
// =================================================================================

document.addEventListener('DOMContentLoaded', () => {
    // --- Session Check ---
    userId = localStorage.getItem('animeTrackerUserId');
    username = localStorage.getItem('animeTrackerUsername');
    
    if (userId) {
        userId = String(userId);
        document.getElementById('profile-username').textContent = username;
        showView('app-main');
        fetchWatchedAnime(userId); // Load user's own list initially
        fetchPendingRequests(); // Load pending requests immediately
        fetchFriendsList(); // Load confirmed friends list immediately
    } else {
        showView('auth');
    }

    // --- Setup Listeners ---
    setupAuthListeners();
    setupMainAppListeners();
    setupModalListeners();
    setupFriendSearchListeners();
});

/**
 * Helper to switch between Auth and App main views.
 */
function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    document.getElementById(viewId).style.display = 'block';

    const profileContainer = document.getElementById('profile-container');
    if (profileContainer) {
        profileContainer.style.display = (viewId === 'app-main' ? 'block' : 'none');
    }
}

/**
 * Helper to switch between Watched, Search, and Find Friends sub-views.
 */
function showSubView(subViewId) {
    document.querySelectorAll('#app-main .sub-view').forEach(view => {
        view.style.display = 'none';
    });
    document.getElementById(subViewId).style.display = 'block';

    // Update navigation active state
    document.querySelectorAll('.navbar button').forEach(button => {
        button.classList.remove('active');
        const viewName = subViewId.replace('page-', '');
        if (button.dataset.view === viewName) {
            button.classList.add('active');
        }
    });

    // Logic to reset the watched view if a friend's list was being viewed
    if (subViewId === 'page-watched') {
        const watchedHeader = document.getElementById('watched-list-header');
        // Restore current user's list view settings
        const backBtn = document.getElementById('back-to-my-list-btn');
        if (backBtn) backBtn.remove();
        document.getElementById('watched-list-title').textContent = `${username}'s Watched List`;
        document.getElementById('list-controls').style.display = 'grid';

        // Ensure the current user's list is loaded when navigating back to 'page-watched'
        fetchWatchedAnime(userId);
    } else if (subViewId === 'page-find-friends') {
        fetchPendingRequests();
        fetchFriendsList();
        renderConfirmedFriendsList();
    }
}

function setupMainAppListeners() {
    // Navigation buttons
    document.querySelectorAll('.navbar button').forEach(button => {
        button.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            showSubView(`page-${view}`);
            // Close sidebar whenever a main navigation button is clicked
            if (profileSidebar && profileSidebar.classList.contains('active')) {
                profileSidebar.classList.remove('active');
            }
        });
    });

    // Profile Button Handler (Toggle sidebar)
    const profileButton = document.querySelector('.profile-button');
    if (profileButton) {
        profileButton.addEventListener('click', toggleProfileSidebar);
    }

    // Close sidebar if user clicks outside
    document.addEventListener('click', (event) => {
        if (profileSidebar && profileSidebar.classList.contains('active') && !profileSidebar.contains(event.target) && !profileButton.contains(event.target)) {
            profileSidebar.classList.remove('active');
        }
    });

    // Logout Handler
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

    // VA Language Selector
    document.getElementById('va-lang')?.addEventListener('change', () => {
        renderWatchedList();
    });

    // Sort By Selector
    document.getElementById('sort-by')?.addEventListener('change', (e) => {
        currentSort = e.target.value;
        sortWatchedList(currentSort);
        renderWatchedList();
    });

    // List Search Input
    if (listSearchInput) {
        listSearchInput.addEventListener('input', () => {
            activeVAFilter = null;
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

/**
 * Toggles the profile sidebar and loads stats.
 */
function toggleProfileSidebar() {
    if (!profileSidebar) return;

    const isActive = profileSidebar.classList.toggle('active');

    if (isActive) {
        calculateAndRenderStats();
    }
}

/**
 * Handles the logout process.
 */
function handleLogout() {
    localStorage.removeItem('animeTrackerUserId');
    localStorage.removeItem('animeTrackerUsername');
    userId = null;
    username = null;
    showView('auth');
    watched.length = 0;
    document.getElementById('watched-list').innerHTML = '';
    if (profileSidebar) profileSidebar.classList.remove('active');
}


// =================================================================================
// 2. AUTHENTICATION
// =================================================================================

function setupAuthListeners() {
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

    document.getElementById('register-btn')?.addEventListener('click', handleRegister);
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
}

async function handleRegister() {
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
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    } else {
        messageEl.textContent = data.error || 'Registration failed.';
    }
}

async function handleLogin() {
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
        userId = String(data.userId);
        username = usernameInput;
        localStorage.setItem('animeTrackerUserId', userId);
        localStorage.setItem('animeTrackerUsername', username);
        document.getElementById('profile-username').textContent = username;
        
        showView('app-main');
        showSubView('page-watched');
        fetchWatchedAnime(userId);
        fetchPendingRequests();
        fetchFriendsList();
    } else {
        messageEl.textContent = data.error || 'Login failed.';
    }
}


// =================================================================================
// 3. ANILIST SEARCH AND ADD
// =================================================================================

document.getElementById('anime-search')?.addEventListener('input', debounce(handleSearch, 300));
document.getElementById('search-results')?.addEventListener('click', handleAddAnime);

/**
 * Debounce utility to limit the rate of function calls.
 */
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

    searchResultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Searching...</li>';
    
    try {
        const res = await fetch(`/search-anime?q=${encodeURIComponent(search)}&lang=romaji`);
        const data = await res.json();

        searchResultsEl.innerHTML = '';

        if (data && data.length) {
            data.forEach(anime => {
                const coverUrl = anime.coverImage?.large || PLACEHOLDER_IMAGE;
                const li = document.createElement('li');
                li.dataset.anime = JSON.stringify(anime);
                li.innerHTML = `
                    <img src="${coverUrl}" onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}'" style="width: 30px; height: 45px; vertical-align: middle; margin-right: 10px; border-radius: 3px;">
                    <strong>${anime.title.romaji || anime.title.english}</strong> (Score: ${anime.averageScore || 'N/A'})
                `;
                document.getElementById('search-results').appendChild(li);
            });
        } else {
            searchResultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">No results found.</li>';
        }
    } catch (e) {
        searchResultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #f44336;">Error during search.</li>';
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

    let rating = prompt(`Enter your rating for "${animeTitle}" (1-100):`);
    rating = parseInt(rating);

    if (isNaN(rating) || rating < 1 || rating > 100) {
        alert("Invalid rating. Anime not added.");
        return;
    }
    
    const coverImageURL = animeData.coverImage?.large || ''; 

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
                coverImage: coverImageURL,
                characters: animeData.characters ? animeData.characters.edges : []
            })
        });

        const data = await res.json();
        
        if (data.success) {
            alert(`${animeTitle} added successfully!`);
            document.getElementById('anime-search').value = '';
            document.getElementById('search-results').innerHTML = '';
            fetchWatchedAnime(userId);
            showSubView('page-watched');
        } else {
            alert(`Failed to add anime: ${data.error}`);
        }
    } catch (e) {
        console.error("Add anime failed:", e);
        alert("An error occurred while adding the anime.");
    }
}


// =================================================================================
// 4. WATCHED ANIME LIST MANAGEMENT
// =================================================================================

/**
 * Helper to safely parse voice actor data string from DB.
 */
function parseVoiceActors(vaString) {
    try {
        const vaData = JSON.parse(vaString);
        return {
            japanese: vaData.japanese || "",
            english: vaData.english || ""
        };
    } catch (e) {
        return { japanese: "", english: "" };
    }
}

/**
 * Fetches the watched list for a given user ID and updates the display.
 */
async function fetchWatchedAnime(targetUserId) {
    if (!targetUserId) return;
    
    document.getElementById('watched-list').innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: var(--color-text-subtle);">Loading...</li>';

    try {
        const res = await fetch(`/watched/${targetUserId}`);
        const data = await res.json();
        
        // Check if we are fetching the current user's list (for global state update)
        const isCurrentUser = String(targetUserId) === String(userId);

        if (data.success) {
            const listData = data.data.map(item => ({
                ...item,
                voice_actors_parsed: parseVoiceActors(item.voice_actors),
                rating: parseFloat(item.rating)
            }));
            
            if (isCurrentUser) {
                watched = listData;
                sortWatchedList(currentSort);
                calculateAndRenderStats();
                // When refreshing the user's own list, reset filters/page
                activeVAFilter = null;
                currentPage = 1;
                renderWatchedList(watched, targetUserId);
            } else {
                // Friend's list - sort by title ascending for simplicity in read-only view
                listData.sort((a, b) => a.anime_title.localeCompare(b.anime_title));
                renderWatchedList(listData, targetUserId);
            }
        } else {
            document.getElementById('watched-list').innerHTML = `<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #f44336;">Error loading list: ${data.error}</li>`;
        }

    } catch (e) {
        console.error('Network error fetching watched anime:', e);
        document.getElementById('watched-list').innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #f44336;">Network error.</li>';
    }
}

/**
 * Sorts the global 'watched' array based on the current sort criteria.
 */
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
            watched.sort((a, b) => b.id - a.id);
            break;
    }
}

/**
 * Applies active text search and VA filters to the current user's list.
 */
function getFilteredWatchedList() {
    let filtered = watched;
    const search = listSearchInput?.value.toLowerCase().trim() || '';
    const vaLang = document.getElementById('va-lang')?.value || 'japanese';

    // 1. Apply VA Filter
    if (activeVAFilter) {
        filtered = filtered.filter(anime => {
            const vaString = anime.voice_actors_parsed[vaLang];
            const vaNames = vaString.split('|').map(entry => entry.split(':').pop().trim());
            return vaNames.includes(activeVAFilter);
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

/**
 * Renders the list items to the DOM, handling pagination and view modes (user vs. friend).
 */
function renderWatchedList(listToRender = watched, ownerId = userId) {
    const listEl = document.getElementById('watched-list');
    const isCurrentUser = String(ownerId) === String(userId);
    
    const filtered = isCurrentUser ? getFilteredWatchedList() : listToRender;
    const totalItems = filtered.length;
    const maxPage = Math.ceil(totalItems / itemsPerPage);
    
    // Toggle list controls visibility
    const listControls = document.getElementById('list-controls');
    if (listControls) {
        listControls.style.display = isCurrentUser ? 'grid' : 'none';
    }

    // Handle pagination boundaries
    if (currentPage > maxPage && maxPage > 0) currentPage = maxPage;
    else if (currentPage < 1 && maxPage > 0) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = filtered.slice(start, end);

    listEl.innerHTML = '';
    if (paginatedItems.length === 0) {
        listEl.innerHTML = `<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: var(--color-text-subtle);">
            ${isCurrentUser ? (activeVAFilter ? 'No anime found matching your filter.' : 'Your watched list is empty.') : 'This user\'s list is empty.'}
        </li>`;
    }

    const vaLang = isCurrentUser ? (document.getElementById('va-lang')?.value || 'japanese') : 'japanese';

    paginatedItems.forEach(anime => {
        // Prepare VA Tags
        const vaString = anime.voice_actors_parsed[vaLang];
        let vaTags = vaString.split('|').map(entry => {
            if (!entry.trim()) return '';

            const parts = entry.split(':');
            const charNames = parts[0].trim();
            const vaName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
            
            const highlightClass = (isCurrentUser && vaName === activeVAFilter) ? ' highlight active-filter' : '';
            const clickableClass = isCurrentUser ? ' clickable' : '';

            return `<span class="va"><span class="highlight${clickableClass}${highlightClass}" data-va-name="${vaName}">${vaName}</span> (${charNames})</span>`;
        }).join('');

        const displayDescription = anime.description || 'No description available.';
        const isClipped = displayDescription.length > 200;
        const coverImageUrl = anime.coverimage || anime.coverImage || PLACEHOLDER_IMAGE;

        const listItem = document.createElement('li');
        listItem.dataset.id = anime.id;
        listItem.dataset.animeId = anime.anime_id;
        listItem.innerHTML = `
            <div class="anime-cover-container">
                <img src="${coverImageUrl}" onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}'" alt="${anime.anime_title} cover" class="anime-cover">
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
                ${isCurrentUser ? `
                    <div class="action-buttons">
                        <button class="notes-btn" data-action="open-notes" data-title="${anime.anime_title}" data-anime-id="${anime.anime_id}" data-notes="${escapeHtml(anime.notes || '')}">Notes</button>
                        <button class="remove-btn" data-action="remove-anime" data-anime-id="${anime.anime_id}">Remove</button>
                    </div>
                ` : ''}
            </div>
        `;
        listEl.appendChild(listItem);
    });

    // Update Pagination Controls
    document.getElementById('page-info').textContent = `Page ${maxPage > 0 ? currentPage : 0} of ${maxPage}`;
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= maxPage;

    // Setup listeners only for the current user's list
    if (isCurrentUser) {
        setupCardListeners(listEl);
    }
}

/**
 * Escapes HTML characters for safe use in dataset attributes.
 */
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Sets up listeners for Read More/Less, VA Filter, Remove, and Notes buttons.
 */
function setupCardListeners(container) {
    // Read More/Less
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
                activeVAFilter = null;
            } else {
                activeVAFilter = vaName;
                listSearchInput.value = '';
            }
            
            currentPage = 1;
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

    if (!confirm(`Are you sure you want to remove "${animeTitle}" from your watched list?`)) return;

    try {
        const res = await fetch(`/remove-anime/${userId}/${animeId}`, {
            method: 'DELETE'
        });

        const data = await res.json();
        if (data.success) {
            alert(`${animeTitle} removed successfully.`);
            watched = watched.filter(anime => anime.anime_id !== parseInt(animeId));
            renderWatchedList();
            calculateAndRenderStats();
        } else {
            alert(`Failed to remove anime: ${data.error}`);
        }
    } catch (e) {
        console.error("Remove anime failed:", e);
        alert("An error occurred while removing the anime.");
    }
}


// =================================================================================
// 5. NOTES MODAL LOGIC
// =================================================================================

const notesModal = document.getElementById('notes-modal');
const closeButton = document.querySelector('.close-button');
const saveNotesBtn = document.getElementById('save-notes-btn');
const notesTextarea = document.getElementById('notes-textarea');
let currentAnimeId = null;

function setupModalListeners() {
    if (closeButton) closeButton.onclick = () => { notesModal.style.display = 'none'; };
    if (notesModal) {
        window.onclick = (event) => {
            if (event.target == notesModal) {
                notesModal.style.display = 'none';
            }
        };
    }
    if (saveNotesBtn) saveNotesBtn.onclick = handleSaveNotes;
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

/**
 * Unescapes HTML characters read from dataset attributes.
 */
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
            const index = watched.findIndex(a => String(a.anime_id) === String(currentAnimeId));
            if (index !== -1) {
                watched[index].notes = notes;
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


// =================================================================================
// 6. STATS LOGIC
// =================================================================================

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
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|');
        vaList.forEach(vaEntry => {
            const vaNameMatch = vaEntry.match(/: (.*)$/);
            const vaName = vaNameMatch ? vaNameMatch[1].trim() : vaEntry.trim();

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
    // The list is sorted by recent (descending id) by default during fetch
    const mostRecent = watched.length > 0 ? watched[0].anime_title : 'N/A';

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


// =================================================================================
// 7. FRIEND SYSTEM LOGIC
// =================================================================================

function setupFriendSearchListeners() {
    document.getElementById('friend-search-input')?.addEventListener('input', debounce(handleFriendSearch, 300));
    
    document.getElementById('friend-search-results')?.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'send-request') {
            const recipientId = e.target.dataset.recipientId;
            handleSendFriendRequest(recipientId, e.target);
        }
    });

    document.getElementById('pending-requests-list')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.dataset.action === 'accept-request') {
            handleRequestAction(target.dataset.requestId, 'accept', target);
        }
        if (target.dataset.action === 'reject-request') {
            handleRequestAction(target.dataset.requestId, 'reject', target);
        }
    });
    
    document.getElementById('confirmed-friends-list')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.dataset.action === 'view-friend-list') {
            viewFriendWatchedList(target.dataset.friendId, target.dataset.friendUsername);
        }
    });
}

async function handleFriendSearch(e) {
    if (!userId) return;

    const search = e.target.value.trim();
    const resultsEl = document.getElementById('friend-search-results');

    if (search.length < 3) {
        resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Start typing a username to search for friends.</li>';
        return;
    }

    resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Searching...</li>';

    try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(search)}&userId=${userId}`);
        const data = await res.json();

        if (data.success) {
            renderFriendSearchResults(data.users);
        } else {
            resultsEl.innerHTML = `<li style="grid-column: 1; text-align: center; border: none; background: none; color: #f44336;">Error: ${data.error || 'Could not fetch users.'}</li>`;
        }
    } catch (e) {
        console.error("Network error during friend search:", e);
        resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #f44336;">A network error occurred.</li>';
    }
}

function renderFriendSearchResults(users) {
    const resultsEl = document.getElementById('friend-search-results');
    resultsEl.innerHTML = '';

    if (users.length === 0) {
        resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">No users found matching that name.</li>';
        return;
    }

    users.forEach(user => {
        let buttonText = 'Add Friend';
        let buttonClass = 'add-friend-btn';
        let disabled = '';
        let buttonAction = 'send-request';
        let statusMessage = '';

        if (user.relationshipStatus === 'friends') {
            buttonText = 'Friends';
            buttonClass = 'status-btn status-friends';
            disabled = 'disabled';
            buttonAction = 'none';
        } else if (user.relationshipStatus === 'request_sent') {
            buttonText = 'Pending (Sent)';
            buttonClass = 'status-btn status-pending-sent';
            disabled = 'disabled';
            buttonAction = 'none';
        } else if (user.relationshipStatus === 'request_received') {
            buttonText = 'Action Needed';
            buttonClass = 'status-btn status-pending-received';
            buttonAction = 'view-requests'; 
            statusMessage = ' (<a href="#" onclick="showSubView(\'page-find-friends\')">Accept/Reject</a>)';
        }

        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background-color: #2c2c2c;';
        
        li.innerHTML = `
            <span>
                <strong style="font-size: 1.1em; color: var(--color-text-main);">${user.username}</strong>
                <span style="color: var(--color-text-subtle);">${statusMessage}</span>
            </span>
            <button class="${buttonClass}" data-action="${buttonAction}" data-recipient-id="${user.id}" ${disabled}>
                ${buttonText}
            </button>
        `;
        resultsEl.appendChild(li);
    });
}

async function handleSendFriendRequest(recipientId, buttonEl) {
    if (!userId) return alert("You must be logged in to send a request.");

    buttonEl.textContent = 'Sending...';
    buttonEl.disabled = true;

    try {
        const res = await fetch(`/api/friends/request/${recipientId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        });

        const data = await res.json();

        if (data.success) {
            buttonEl.textContent = 'Pending (Sent)';
            buttonEl.classList.add('status-pending-sent');
            alert(data.message);
            
            // Refresh search results to update status, if search is active
            const searchInput = document.getElementById('friend-search-input');
            if(searchInput) handleFriendSearch({target: searchInput});

        } else {
            buttonEl.textContent = 'Failed (Retry)';
            buttonEl.disabled = false;
            alert(data.error || 'Failed to send request.');
        }

    } catch (e) {
        console.error("Send request failed:", e);
        buttonEl.textContent = 'Network Error (Retry)';
        buttonEl.disabled = false;
    }
}

async function fetchPendingRequests() {
    if (!userId) return;

    const requestsEl = document.getElementById('pending-requests-list');
    if (!requestsEl) return;
    requestsEl.innerHTML = '';
    
    try {
        const res = await fetch(`/api/friends/pending/${userId}`);
        const data = await res.json();

        const notificationCountEl = document.getElementById('friend-notification-count');

        if (data.success && data.requests.length > 0) {
            friendRequests = data.requests;
            data.requests.forEach(request => {
                const li = document.createElement('li');
                li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background-color: #2c2c2c;';
                
                li.innerHTML = `
                    <span style="color: var(--color-accent-highlight);">${request.requester_username}</span>
                    <span style="color: var(--color-text-subtle);"> wants to be friends.</span>
                    <div>
                        <button data-action="accept-request" data-request-id="${request.id}" style="background-color: #4CAF50; margin-right: 5px;">Accept</button>
                        <button data-action="reject-request" data-request-id="${request.id}" style="background-color: #f44336;">Reject</button>
                    </div>
                `;
                requestsEl.appendChild(li);
            });
            
            if (notificationCountEl) {
                notificationCountEl.textContent = data.requests.length;
                notificationCountEl.style.display = 'inline-block';
            }
        } else {
            friendRequests = [];
            requestsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">No pending friend requests.</li>';
            if (notificationCountEl) notificationCountEl.style.display = 'none';
        }

    } catch (e) {
        console.error("Error fetching pending requests:", e);
    }
}

async function handleRequestAction(requestId, action, buttonEl) {
    if (!userId) return;

    buttonEl.textContent = 'Loading...';
    buttonEl.closest('div').querySelectorAll('button').forEach(btn => btn.disabled = true);

    try {
        const res = await fetch(`/api/friends/request/${requestId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                action: action
            })
        });

        const data = await res.json();

        if (data.success) {
            alert(`Request ${action}ed successfully!`);
            fetchPendingRequests();
            fetchFriendsList();
        } else {
            alert(data.error || `Failed to ${action} request.`);
            buttonEl.closest('div').querySelectorAll('button').forEach(btn => btn.disabled = false);
        }

    } catch (e) {
        console.error(`Error handling request action (${action}):`, e);
        alert('Network error while processing request.');
    }
}


// =================================================================================
// 8. CONFIRMED FRIENDS LIST LOGIC
// =================================================================================

async function fetchFriendsList() {
    if (!userId) return;

    try {
        const res = await fetch(`/api/friends/${userId}`);
        const data = await res.json();

        if (data.success) {
            friendsList = data.friends;
            
            // Only re-render if the user is currently viewing the friends tab
            if (document.getElementById('page-find-friends')?.style.display === 'block') {
                renderConfirmedFriendsList();
            }
        }
    } catch (error) {
        console.error('Error fetching friends list:', error);
    }
}

function renderConfirmedFriendsList() {
    const listContainer = document.getElementById('confirmed-friends-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';

    if (friendsList.length === 0) {
        listContainer.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">You have no confirmed friends.</li>';
        return;
    }

    friendsList.forEach(friend => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background-color: #2c2c2c;';
        
        li.innerHTML = `
            <span style="color: var(--color-text-main); font-weight: bold;">${friend.friend_username}</span>
            <button class="status-btn status-friends" data-action="view-friend-list" data-friend-id="${friend.friend_id}" data-friend-username="${friend.friend_username}">
                View List
            </button>
        `;
        listContainer.appendChild(li);
    });
}

function viewFriendWatchedList(friendId, friendUsername) {
    // 1. Switch to the 'watched' section
    showSubView('page-watched');

    // 2. Update the list title
    document.getElementById('watched-list-title').textContent = `${friendUsername}'s Watched List`;
    
    // 3. Load the friend's list
    fetchWatchedAnime(friendId);

    // 4. Add a "Back to My List" button
    const watchedHeader = document.getElementById('watched-list-header');
    if (!watchedHeader) return;
    
    let backBtn = document.getElementById('back-to-my-list-btn');
    if (!backBtn) {
        backBtn = document.createElement('button');
        backBtn.id = 'back-to-my-list-btn';
        backBtn.className = 'status-btn status-reject';
        watchedHeader.prepend(backBtn);
    }
    
    backBtn.textContent = '← Back to My List';
    
    // Ensure only one listener is active by removing and re-adding
    const newBackButton = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackButton, backBtn);
    backBtn = newBackButton;
    
    backBtn.addEventListener('click', () => {
        // Navigating back to the watched page triggers the showSubView('page-watched') logic
        // which resets the title, removes the back button, and calls fetchWatchedAnime(userId).
        showSubView('page-watched');
    });
}
