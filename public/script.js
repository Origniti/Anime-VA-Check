// =================================================================================
// GLOBAL STATE & INITIALIZATION
// =================================================================================

let userId = null;
let username = null;
let watched = []; // Stores the current user's (your) permanent list data
let currentViewedList = []; // Stores the list data currently being rendered (yours or a friend's)
let currentViewedUserId = null; // Stores the ID of the user whose list is currently being rendered
let friendRequests = [];
[cite_start]// Stores pending requests for the current user [cite: 223]
let friendsList = []; // Stores confirmed friends
let currentPage = 1;
[cite_start]const itemsPerPage = 6; [cite: 224]
let activeVAFilter = null; // Used for click-to-filter on the watched list
let currentSort = 'recent';
const PLACEHOLDER_IMAGE = '/placeholder.png'; [cite_start]// Placeholder image path [cite: 225]

// DOM Elements
const profileSidebar = document.getElementById('profile-sidebar');
const listSearchInput = document.getElementById('list-search');
// =================================================================================
// 1. INITIAL SETUP AND NAVIGATION
[cite_start]// ================================================================================= [cite: 226]

document.addEventListener('DOMContentLoaded', () => {
    // --- Session Check ---
    userId = localStorage.getItem('animeTrackerUserId');
    username = localStorage.getItem('animeTrackerUsername');
    
    if (userId) {
        userId = String(userId);
        currentViewedUserId = userId; // Initialize current view ID to self
        document.getElementById('profile-username').textContent = username;
        showView('app-main');
        [cite_start]fetchWatchedAnime(userId); // Load user's own list initially [cite: 226]
        fetchPendingRequests(); [cite_start]// Load pending requests immediately [cite: 226]
     
        fetchFriendsList(); [cite_start]// Load confirmed friends list immediately [cite: 227]
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
 [cite_start]*/ [cite: 228, 229]
function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    [cite_start]document.getElementById(viewId).style.display = 'block'; [cite: 230]

    const profileContainer = document.getElementById('profile-container');
    if (profileContainer) {
        profileContainer.style.display = (viewId === 'app-main' ? 'block' : 'none');
    [cite_start]} [cite: 231]
}

/**
 * Helper to switch between Watched, Search, and Find Friends sub-views.
 [cite_start]*/ [cite: 232]
function showSubView(subViewId) {
    document.querySelectorAll('#app-main .sub-view').forEach(view => {
        view.style.display = 'none';
    });
    [cite_start]document.getElementById(subViewId).style.display = 'block'; [cite: 233]

    // Update navigation active state
    document.querySelectorAll('.navbar button').forEach(button => {
        button.classList.remove('active');
        const viewName = subViewId.replace('page-', '');
        if (button.dataset.view === viewName) {
            button.classList.add('active');
        }
    });
    [cite_start]// Logic to reset the watched view if a friend's list was being viewed [cite: 234]
    if (subViewId === 'page-watched') {
        const watchedHeader = document.getElementById('watched-list-header');
        [cite_start]// Restore current user's list view settings [cite: 235]
        const backBtn = document.getElementById('back-to-my-list-btn');
        [cite_start]if (backBtn) backBtn.remove(); [cite: 236]
        document.getElementById('watched-list-title').textContent = `${username}'s Watched List`;
        [cite_start]document.getElementById('list-controls').style.display = 'grid'; [cite: 237]
        
        // Only re-fetch if we are currently NOT viewing the current user's list
        if (String(currentViewedUserId) !== String(userId)) {
             [cite_start]// Ensure the current user's list is loaded when navigating back to 'page-watched' [cite: 237]
            fetchWatchedAnime(userId);
        } else {
            // Re-render quickly if we were already viewing our own list
            renderWatchedList(); 
        }

    } else if (subViewId === 'page-find-friends') {
        fetchPendingRequests();
        fetchFriendsList();
        renderConfirmedFriendsList();
    [cite_start]} [cite: 239]
}

function setupMainAppListeners() {
    // Navigation buttons
    document.querySelectorAll('.navbar button').forEach(button => {
        button.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            showSubView(`page-${view}`);
            // Close sidebar whenever a main navigation button is clicked
            if (profileSidebar && profileSidebar.classList.contains('active')) {
          
                [cite_start]profileSidebar.classList.remove('active'); [cite: 240]
            }
        });
    });
    [cite_start]// Profile Button Handler (Toggle sidebar) [cite: 241]
    const profileButton = document.querySelector('.profile-button');
    [cite_start]if (profileButton) { [cite: 242]
        profileButton.addEventListener('click', toggleProfileSidebar);
    [cite_start]} [cite: 243]

    // Close sidebar if user clicks outside
    document.addEventListener('click', (event) => {
        if (profileSidebar && profileSidebar.classList.contains('active') && !profileSidebar.contains(event.target) && !profileButton.contains(event.target)) {
            profileSidebar.classList.remove('active');
        }
    });
    [cite_start]// Logout Handler [cite: 244]
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

    // VA Language Selector
    document.getElementById('va-lang')?.addEventListener('change', () => {
        // Use renderWatchedList without arguments to use the current state
        renderWatchedList();
    });
    [cite_start]// Sort By Selector [cite: 245]
    document.getElementById('sort-by')?.addEventListener('change', (e) => {
        currentSort = e.target.value;
        // Only sort the main 'watched' array if we are viewing our own list
        if (String(currentViewedUserId) === String(userId)) {
            sortWatchedList(currentSort);
        }
        renderWatchedList();
    });
    [cite_start]// List Search Input [cite: 246]
    if (listSearchInput) {
        listSearchInput.addEventListener('input', () => {
            // Only apply search/filter reset if viewing current user's list
            if (String(currentViewedUserId) === String(userId)) {
                activeVAFilter = null;
                currentPage = 1;
            }
            renderWatchedList();
        });
    [cite_start]} [cite: 247]

    // Pagination Listeners
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderWatchedList();
        }
    });
    document.getElementById('next-page')?.addEventListener('click', () => {
        // Use the currently viewed list for max page calculation
        const filteredList = getFilteredWatchedList(currentViewedList, currentViewedUserId);
        const maxPage = Math.ceil(filteredList.length / itemsPerPage);
        if (currentPage < maxPage) {
            currentPage++;
            renderWatchedList();
        }
    });
[cite_start]} [cite: 249]

/**
 * Toggles the profile sidebar and loads stats.
 */
function toggleProfileSidebar() {
    if (!profileSidebar) return;
    [cite_start]const isActive = profileSidebar.classList.toggle('active'); [cite: 250]

    if (isActive) {
        [cite_start]calculateAndRenderStats(); [cite: 251]
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
    currentViewedList = []; // Clear new state
    currentViewedUserId = null; // Clear new state
    [cite_start]showView('auth'); [cite: 252]
    watched.length = 0;
    document.getElementById('watched-list').innerHTML = '';
    if (profileSidebar) profileSidebar.classList.remove('active');
[cite_start]} [cite: 253]


// =================================================================================
// 2. AUTHENTICATION
// =================================================================================

function setupAuthListeners() {
    document.getElementById('show-register-btn')?.addEventListener('click', () => {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        document.getElementById('auth-message').textContent = '';
    });
    [cite_start]document.getElementById('show-login-btn')?.addEventListener('click', () => { [cite: 254]
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('auth-message').textContent = '';
    [cite_start]}); [cite: 255]
    document.getElementById('register-btn')?.addEventListener('click', handleRegister);
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
}

async function handleRegister() {
    const usernameInput = document.getElementById('register-username').value;
    [cite_start]const passwordInput = document.getElementById('register-password').value; [cite: 256]
    const messageEl = document.getElementById('auth-message');

    const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
    [cite_start]}); [cite: 257]
    const data = await res.json();
    
    if (data.success) {
        messageEl.textContent = 'Registration successful!
[cite_start]Please log in.'; [cite: 258]
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    } else {
        messageEl.textContent = data.error ||
[cite_start]'Registration failed.'; [cite: 259]
    }
}

async function handleLogin() {
    const usernameInput = document.getElementById('login-username').value;
    [cite_start]const passwordInput = document.getElementById('login-password').value; [cite: 260]
    const messageEl = document.getElementById('auth-message');

    const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
    [cite_start]}); [cite: 261]
    const data = await res.json();

    if (data.success) {
        userId = String(data.userId);
        [cite_start]username = usernameInput; [cite: 262]
        localStorage.setItem('animeTrackerUserId', userId);
        localStorage.setItem('animeTrackerUsername', username);
        document.getElementById('profile-username').textContent = username;
        
        currentViewedUserId = userId; // Set current view to self upon login
        
        showView('app-main');
        showSubView('page-watched');
        fetchWatchedAnime(userId);
        fetchPendingRequests();
        fetchFriendsList();
    [cite_start]} else { [cite: 263]
        messageEl.textContent = data.error || [cite_start]'Login failed.'; [cite: 264]
    }
}


// =================================================================================
// 3. ANILIST SEARCH AND ADD
// =================================================================================

document.getElementById('anime-search')?.addEventListener('input', debounce(handleSearch, 300));
[cite_start]document.getElementById('search-results')?.addEventListener('click', handleAddAnime); [cite: 265]
/**
 * Debounce utility to limit the rate of function calls.
 */
function debounce(func, delay) {
    [cite_start]let timeout; [cite: 266]
    return function(...args) {
        const context = this;
        [cite_start]clearTimeout(timeout); [cite: 267]
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

async function handleSearch(e) {
    [cite_start]const search = e.target.value.trim(); [cite: 268]
    const searchResultsEl = document.getElementById('search-results');
    searchResultsEl.innerHTML = '';
    
    [cite_start]if (search.length < 3) return; [cite: 269]
    [cite_start]searchResultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Searching...</li>'; [cite: 270]
    try {
        const res = await fetch(`/search-anime?q=${encodeURIComponent(search)}&lang=romaji`);
        [cite_start]const data = await res.json(); [cite: 271]
        searchResultsEl.innerHTML = '';

        if (data && data.length) {
            data.forEach(anime => {
                const coverUrl = anime.coverImage?.large || PLACEHOLDER_IMAGE;
                const li = document.createElement('li');
                li.dataset.anime = JSON.stringify(anime);
                li.innerHTML = `
   
                    [cite_start]<img src="${coverUrl}" onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}'" style="width: 30px; height: 45px; vertical-align: middle; margin-right: 10px; border-radius: 3px;"> [cite: 272]
                    <strong>${anime.title.romaji || anime.title.english}</strong> (Score: ${anime.averageScore || 'N/A'})
                `;
                document.getElementById('search-results').appendChild(li);
            
            [cite_start]}); [cite: 273]
        } else {
            [cite_start]searchResultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">No results found.</li>'; [cite: 274]
        }
    } catch (e) {
        [cite_start]searchResultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #f44336;">Error during search.</li>'; [cite: 275]
    }
}

async function handleAddAnime(e) {
    [cite_start]let target = e.target; [cite: 276]
    while(target && target.tagName !== 'LI') {
        [cite_start]target = target.parentNode; [cite: 277]
    }
    if (!target || !target.dataset.anime) return;

    const animeData = JSON.parse(target.dataset.anime);
    [cite_start]const animeTitle = animeData.title.romaji || animeData.title.english; [cite: 278]
    let rating = prompt(`Enter your rating for "${animeTitle}" (1-100):`);
    [cite_start]rating = parseInt(rating); [cite: 279]
    if (isNaN(rating) || rating < 1 || rating > 100) {
        [cite_start]alert("Invalid rating. Anime not added."); [cite: 280]
        return;
    }
    
    const coverImageURL = animeData.coverImage?.large || [cite_start]''; [cite: 281]
    try {
        const res = await fetch('/add-anime', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                animeId: animeData.id,
          
                [cite_start]animeTitle: animeTitle, [cite: 282]
                rating: rating / 10, // Store as 1-10 scale
                description: animeData.description,
                coverImage: coverImageURL,
                characters: animeData.characters ? animeData.characters.edges : []
            })
  
        [cite_start]}); [cite: 283]

        [cite_start]const data = await res.json(); [cite: 284]
        if (data.success) {
            alert(`${animeTitle} added successfully!`);
            [cite_start]document.getElementById('anime-search').value = ''; [cite: 285]
            document.getElementById('search-results').innerHTML = '';
            fetchWatchedAnime(userId);
            showSubView('page-watched');
        } else {
            [cite_start]alert(`Failed to add anime: ${data.error}`); [cite: 286]
        }
    } catch (e) {
        [cite_start]console.error("Add anime failed:", e); [cite: 287]
        alert("An error occurred while adding the anime.");
    }
}


// =================================================================================
// 4. WATCHED ANIME LIST MANAGEMENT
// =================================================================================

/**
 * Helper to safely parse voice actor data string from DB.
 [cite_start]*/ [cite: 288]
function parseVoiceActors(vaString) {
    try {
        [cite_start]const vaData = JSON.parse(vaString); [cite: 289]
        return {
            japanese: vaData.japanese ||
[cite_start]"", [cite: 290]
            english: vaData.english ||
[cite_start]"" [cite: 291]
        };
    } catch (e) {
        [cite_start]return { japanese: "", english: "" }; [cite: 292]
    }
}

/**
 * Fetches the watched list for a given user ID and updates the display.
 [cite_start]*/ [cite: 293]
async function fetchWatchedAnime(targetUserId) {
    [cite_start]if (!targetUserId) return; [cite: 294]
    [cite_start]document.getElementById('watched-list').innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: var(--color-text-subtle);">Loading...</li>'; [cite: 295]
    try {
        const res = await fetch(`/watched/${targetUserId}`);
        [cite_start]const data = await res.json(); [cite: 296]
        
        [cite_start]const isCurrentUser = String(targetUserId) === String(userId); [cite: 297]
        
        if (data.success) {
            const listData = data.data.map(item => ({
                ...item,
                voice_actors_parsed: parseVoiceActors(item.voice_actors),
                rating: parseFloat(item.rating)
            [cite_start]})); [cite: 298]

            // --- Set Global State for Current View ---
            currentViewedList = listData;
            currentViewedUserId = targetUserId;

            if (isCurrentUser) {
                watched = listData; [cite_start]// Update permanent user list [cite: 299]
                sortWatchedList(currentSort); // Sort the permanent list
                calculateAndRenderStats();
                // When refreshing the user's own list, reset filters/page
                [cite_start]activeVAFilter = null; [cite: 300]
                currentPage = 1;
            } else {
                [cite_start]// Friend's list - sort by title ascending for simplicity in read-only view [cite: 300]
                currentViewedList.sort((a, b) => a.anime_title.localeCompare(b.anime_title));
                currentPage = 1; // Reset page when viewing a friend's list
            }
            
            // Render the list using the new global state
            [cite_start]renderWatchedList(); [cite: 301]

        } else {
            [cite_start]document.getElementById('watched-list').innerHTML = `<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #f44336;">Error loading list: ${data.error}</li>`; [cite: 302]
        }

    } catch (e) {
        [cite_start]console.error('Network error fetching watched anime:', e); [cite: 303]
        [cite_start]document.getElementById('watched-list').innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #f44336;">Network error.</li>'; [cite: 304]
    }
}

/**
 * Sorts the global 'watched' array based on the current sort criteria.
 [cite_start]*/ [cite: 305]
function sortWatchedList(sortType) {
    switch (sortType) {
        case 'rating-desc':
            [cite_start]watched.sort((a, b) => b.rating - a.rating); [cite: 306]
            break;
        case 'rating-asc':
            [cite_start]watched.sort((a, b) => a.rating - b.rating); [cite: 307]
            break;
        case 'title-asc':
            watched.sort((a, b) => a.anime_title.localeCompare(b.anime_title));
            break;
        [cite_start]case 'recent': [cite: 308]
        default:
            [cite_start]watched.sort((a, b) => b.id - a.id); [cite: 309]
            break;
    }
}

/**
 * Applies active text search and VA filters to the current user's list.
 * Accepts the list to filter as an argument.
 [cite_start]*/ [cite: 310]
function getFilteredWatchedList(listToFilter) {
    let filtered = listToFilter;
    const search = listSearchInput?.value.toLowerCase().trim() || [cite_start]''; [cite: 311]
    const vaLang = document.getElementById('va-lang')?.value || 'japanese';

    // 1. Apply VA Filter
    if (activeVAFilter) {
        filtered = filtered.filter(anime => {
            const vaString = anime.voice_actors_parsed[vaLang];
            const vaNames = vaString.split('|').map(entry => entry.split(':').pop().trim());
            return vaNames.includes(activeVAFilter);
        [cite_start]}); [cite: 312]
    }

    // 2. Apply Text Search
    if (search) {
        filtered = filtered.filter(anime => {
            const vaString = anime.voice_actors_parsed[vaLang];
            return anime.anime_title.toLowerCase().includes(search) || vaString.toLowerCase().includes(search);
        [cite_start]}); [cite: 313]
    }

    return filtered;
}

/**
 * Renders the list items to the DOM, handling pagination and view modes (user vs. friend).
 * Now uses the global state (currentViewedList, currentViewedUserId) by default.
 [cite_start]*/ [cite: 314]
function renderWatchedList() {
    // Use global state variables for the list to render and owner ID
    const listToRender = currentViewedList;
    const ownerId = currentViewedUserId;
    
    if (!listToRender || !ownerId) return;

    const listEl = document.getElementById('watched-list');
    [cite_start]const isCurrentUser = String(ownerId) === String(userId); [cite: 315]
    
    // Filtering logic: Only apply filters/search if viewing the current user's list
    const filtered = isCurrentUser ? getFilteredWatchedList(listToRender) : listToRender;
    [cite_start]const totalItems = filtered.length; [cite: 316]
    const maxPage = Math.ceil(totalItems / itemsPerPage);
    
    // Toggle list controls visibility
    [cite_start]const listControls = document.getElementById('list-controls'); [cite: 317]
    if (listControls) {
        listControls.style.display = isCurrentUser ? [cite_start]'grid' : 'none'; [cite: 318]
    }

    // Handle pagination boundaries
    [cite_start]if (currentPage > maxPage && maxPage > 0) currentPage = maxPage; [cite: 319]
    else if (currentPage < 1 && maxPage > 0) currentPage = 1;

    [cite_start]const start = (currentPage - 1) * itemsPerPage; [cite: 320]
    const end = start + itemsPerPage;
    const paginatedItems = filtered.slice(start, end);

    [cite_start]listEl.innerHTML = ''; [cite: 321]
    if (paginatedItems.length === 0) {
        listEl.innerHTML = `<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: var(--color-text-subtle);">
            ${isCurrentUser ?
(activeVAFilter ? 'No anime found matching your filter.' : 'Your watched list is empty.') [cite_start]: 'This user\'s list is empty.'} [cite: 322]
        [cite_start]</li>`; [cite: 323]
    }

    const vaLang = isCurrentUser ? (document.getElementById('va-lang')[cite_start]?.value || 'japanese') : 'japanese'; [cite: 324]
    paginatedItems.forEach(anime => {
        // Prepare VA Tags
        const vaString = anime.voice_actors_parsed[vaLang];
        let vaTags = vaString.split('|').map(entry => {
            if (!entry.trim()) return '';

            const parts = entry.split(':');
            const charNames = parts[0].trim();
            const vaName = parts.length > 1 
[cite_start]? parts[1].trim() : parts[0].trim(); [cite: 325]
            
            const highlightClass = (isCurrentUser && vaName === activeVAFilter) ? ' highlight active-filter' : '';
            const clickableClass = isCurrentUser ? ' clickable' : '';

            return `<span class="va"><span class="highlight${clickableClass}${highlightClass}" data-va-name="${vaName}">${vaName}</span> (${charNames})</span>`;
        }).join('');

        const displayDescription = anime.description || 'No description 
[cite_start]available.'; [cite: 326]
        const isClipped = displayDescription.length > 200;
        const coverImageUrl = anime.coverimage || anime.coverImage ||
[cite_start]PLACEHOLDER_IMAGE; [cite: 327]

        const listItem = document.createElement('li');
        listItem.dataset.id = anime.id;
        [cite_start]listItem.dataset.animeId = anime.anime_id; [cite: 328]
        listItem.innerHTML = `
            <div class="anime-cover-container">
                <img src="${coverImageUrl}" onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}'" alt="${anime.anime_title} cover" class="anime-cover">
            </div>
            <div class="anime-info">
                <div>
                    <b>${anime.anime_title}</b>
  
                    [cite_start]<p style="color: ${anime.rating >= 8.5 ? '#4CAF50' : (anime.rating >= 7.0 ? '#FFC107' : '#F44336')}; font-weight: bold; margin: 5px 0 10px 0;"> [cite: 329]
                        Rating: ${anime.rating.toFixed(1)} / 10
                    </p>
              
                    [cite_start]<div class="description-wrapper"> [cite: 330]
                        <span class="anime-description-text">${displayDescription}</span>
                        ${isClipped ?
[cite_start]'<button class="read-more-btn" data-action="toggle-desc">Read More</button>' : ''} [cite: 331]
                    </div>
                </div>
                <div class="va-tags-container">
                    ${vaTags}
                </div>
      
                [cite_start]${isCurrentUser ? [cite: 332, 333]
`
                    <div class="action-buttons">
                        <button class="notes-btn" data-action="open-notes" data-title="${anime.anime_title}" data-anime-id="${anime.anime_id}" data-notes="${escapeHtml(anime.notes || '')}">Notes</button>
                        <button class="remove-btn" data-action="remove-anime" data-anime-id="${anime.anime_id}">Remove</button>
                    </div>
 
                [cite_start]` : ''} [cite: 334]
            </div>
        `;
        [cite_start]listEl.appendChild(listItem); [cite: 335]
    });

    // Update Pagination Controls
    document.getElementById('page-info').textContent = `Page ${maxPage > 0 ?
[cite_start]currentPage : 0} of ${maxPage}`; [cite: 336]
    document.getElementById('prev-page').disabled = currentPage <= 1;
    document.getElementById('next-page').disabled = currentPage >= maxPage;
    [cite_start]// Setup listeners only for the current user's list [cite: 337]
    if (isCurrentUser) {
        [cite_start]setupCardListeners(listEl); [cite: 338]
    }
}

/**
 * Escapes HTML characters for safe use in dataset attributes.
 [cite_start]*/ [cite: 339]
function escapeHtml(text) {
    [cite_start]if (!text) return ''; [cite: 340]
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
            const descWrapper = 
[cite_start]e.target.closest('.description-wrapper'); [cite: 341]
            descWrapper.classList.toggle('expanded');
            e.target.textContent = descWrapper.classList.contains('expanded') ? 'Read Less' : 'Read More';
        });
    });

    // VA Filter Listener
    container.querySelectorAll('.highlight.clickable').forEach(vaTag => {
        vaTag.addEventListener('click', (e) => {
            const vaName = e.target.dataset.vaName;
            
     
            [cite_start]if (activeVAFilter === vaName) { [cite: 342]
                [cite_start]activeVAFilter = null; [cite: 343]
            } else {
                [cite_start]activeVAFilter = vaName; [cite: 344]
                listSearchInput.value = '';
            }
            
            [cite_start]currentPage = 1; [cite: 345]
            renderWatchedList();
        });
    });

    // Remove Anime Listener
    container.querySelectorAll('[data-action="remove-anime"]').forEach(button => {
        button.addEventListener('click', handleRemoveAnime);
    [cite_start]}); [cite: 346]
    // Notes Button Listener
    container.querySelectorAll('[data-action="open-notes"]').forEach(button => {
        button.addEventListener('click', handleOpenNotesModal);
    [cite_start]}); [cite: 347]
}

async function handleRemoveAnime(e) {
    const animeId = e.target.dataset.animeId;
    [cite_start]const animeTitle = e.target.closest('li').querySelector('.anime-info b').textContent; [cite: 348]
    [cite_start]if (!confirm(`Are you sure you want to remove "${animeTitle}" from your watched list?`)) return; [cite: 349]
    try {
        const res = await fetch(`/remove-anime/${userId}/${animeId}`, {
            method: 'DELETE'
        [cite_start]}); [cite: 350]
        const data = await res.json();
        if (data.success) {
            [cite_start]alert(`${animeTitle} removed successfully.`); [cite: 351]
            watched = watched.filter(anime => anime.anime_id !== parseInt(animeId));
            // Also update the current view list if it's the user's own list
            if (String(currentViewedUserId) === String(userId)) {
                currentViewedList = watched; 
            }
            renderWatchedList();
            calculateAndRenderStats();
        } else {
            [cite_start]alert(`Failed to remove anime: ${data.error}`); [cite: 352]
        }
    } catch (e) {
        [cite_start]console.error("Remove anime failed:", e); [cite: 353]
        alert("An error occurred while removing the anime.");
    }
}


// =================================================================================
// 5. NOTES MODAL LOGIC
// =================================================================================

[cite_start]const notesModal = document.getElementById('notes-modal'); [cite: 354]
const closeButton = document.querySelector('.close-button');
const saveNotesBtn = document.getElementById('save-notes-btn');
const notesTextarea = document.getElementById('notes-textarea');
[cite_start]let currentAnimeId = null; [cite: 355]
function setupModalListeners() {
    if (closeButton) closeButton.onclick = () => { notesModal.style.display = 'none'; [cite_start]}; [cite: 356]
    if (notesModal) {
        window.onclick = (event) => {
            if (event.target == notesModal) {
                [cite_start]notesModal.style.display = 'none'; [cite: 357]
            }
        };
    }
    [cite_start]if (saveNotesBtn) saveNotesBtn.onclick = handleSaveNotes; [cite: 358]
}

function handleOpenNotesModal(e) {
    // Only allow notes modal if viewing own list (buttons are already conditionally rendered)
    if (String(currentViewedUserId) !== String(userId)) return;

    const button = e.target;
    const title = button.dataset.title;
    const notes = button.dataset.notes ?
[cite_start]unescapeHtml(button.dataset.notes) : ''; [cite: 359]
    currentAnimeId = button.dataset.animeId;

    document.getElementById('modal-anime-title').textContent = title;
    notesTextarea.value = notes;
    [cite_start]notesModal.style.display = 'block'; [cite: 360]
}

/**
 * Unescapes HTML characters read from dataset attributes.
 */
function unescapeHtml(text) {
    [cite_start]if (!text) return ''; [cite: 361]
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
         
            [cite_start]headers: { 'Content-Type': 'application/json' }, [cite: 362]
            body: JSON.stringify({
                userId: userId,
                animeId: currentAnimeId,
                notes: notes
            })
        });

        const 
[cite_start]data = await res.json(); [cite: 363]
        
        if (data.success) {
            alert("Notes saved successfully!");
            notesModal.style.display = 'none';
            
            // Update the local 'watched' array (user's permanent list)
            const index = watched.findIndex(a => String(a.anime_id) 
[cite_start]=== String(currentAnimeId)); [cite: 364]
            if (index !== -1) {
                [cite_start]watched[index].notes = notes; [cite: 365]
                // Also update the current view list if it's the user's own list
                if (String(currentViewedUserId) === String(userId)) {
                    currentViewedList = watched; 
                }
                [cite_start]renderWatchedList(); [cite: 365]
            }
        } else {
            [cite_start]alert(`Failed to save notes: ${data.error}`); [cite: 366]
        }
    } catch (e) {
        [cite_start]console.error("Save notes failed:", e); [cite: 367]
        alert("An error occurred while saving notes.");
    }
}


// =================================================================================
// 6. STATS LOGIC
// =================================================================================

function calculateAndRenderStats() {
    [cite_start]const statsContainer = document.getElementById('stats-content'); [cite: 368]
    if (!statsContainer) return;

    // Stats always use the current user's (watched) list
    if (watched.length === 0) {
        statsContainer.innerHTML = '<p class="stats-message">Your list is empty.
[cite_start]Add some anime to see stats!</p>'; [cite: 369]
        return;
    }

    // --- 1. Total Anime ---
    [cite_start]const totalAnime = watched.length; [cite: 370]
    // --- 2. Average Rating ---
    [cite_start]const ratedAnime = watched.filter(anime => anime.rating > 0); [cite: 371]
    const totalRating = ratedAnime.reduce((sum, anime) => sum + anime.rating, 0);
    const avgRating = ratedAnime.length > 0 ?
[cite_start]totalRating / ratedAnime.length : 0; [cite: 372]

    // --- 3. Top Voice Actor ---
    [cite_start]const vaCount = {}; [cite: 373]
    const vaLang = document.getElementById('va-lang')?.value || 'japanese';
    
    watched.forEach(anime => {
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|');
        vaList.forEach(vaEntry => {
            const vaNameMatch = vaEntry.match(/: (.*)$/);
            const vaName = vaNameMatch ? vaNameMatch[1].trim() : vaEntry.trim();

            if (vaName) {
         
                [cite_start]vaCount[vaName] = (vaCount[vaName] || 0) + 1; [cite: 374]
            }
        });
    [cite_start]}); [cite: 375]
    let topVA = { name: 'N/A', count: 0 };
    for (const name in vaCount) {
        if (vaCount[name] > topVA.count) {
            [cite_start]topVA = { name, count: vaCount[name] }; [cite: 376]
        }
    }
    
    // --- 4. Most Recent Watch ---
    // The list is sorted by recent (descending id) by default during fetch
    const mostRecent = watched.length > 0 ?
[cite_start]watched[0].anime_title : 'N/A'; [cite: 377]

    // --- Render the Stats ---
    statsContainer.innerHTML = `
        <div class="stats-group">
            <div class="stat-item">
                <span class="stat-value">${totalAnime}</span>
                <span class="stat-label">Total Watched Titles</span>
            </div>
            <div class="stat-item">
   
                [cite_start]<span class="stat-value">${avgRating.toFixed(2)} / 10</span> [cite: 378]
                <span class="stat-label">Average Rating</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${topVA.name}</span>
                <span class="stat-label">Top ${vaLang.charAt(0).toUpperCase() + vaLang.slice(1)} VA (${topVA.count} titles)</span>
 
            [cite_start]</div> [cite: 379]
            <div class="stat-item">
                <span class="stat-value">${mostRecent}</span>
                <span class="stat-label">Most Recently Added</span>
            </div>
        </div>
    [cite_start]`; [cite: 380]
}


// =================================================================================
// 7. FRIEND SYSTEM LOGIC
// =================================================================================

function setupFriendSearchListeners() {
    [cite_start]document.getElementById('friend-search-input')?.addEventListener('input', debounce(handleFriendSearch, 300)); [cite: 381]
    document.getElementById('friend-search-results')?.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'send-request') {
            const recipientId = e.target.dataset.recipientId;
            handleSendFriendRequest(recipientId, e.target);
        }
    [cite_start]}); [cite: 382]
    document.getElementById('pending-requests-list')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.dataset.action === 'accept-request') {
            handleRequestAction(target.dataset.requestId, 'accept', target);
        }
        if (target.dataset.action === 'reject-request') {
            handleRequestAction(target.dataset.requestId, 'reject', target);
        }
    [cite_start]}); [cite: 383]
    document.getElementById('confirmed-friends-list')?.addEventListener('click', (e) => {
        const target = e.target;
        if (target.dataset.action === 'view-friend-list') {
            viewFriendWatchedList(target.dataset.friendId, target.dataset.friendUsername);
        }
    [cite_start]}); [cite: 384]
}

async function handleFriendSearch(e) {
    if (!userId) return;

    const search = e.target.value.trim();
    [cite_start]const resultsEl = document.getElementById('friend-search-results'); [cite: 385]
    if (search.length < 3) {
        [cite_start]resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Start typing a username to search for friends.</li>'; [cite: 386]
        return;
    }

    [cite_start]resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Searching...</li>'; [cite: 387]
    try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(search)}&userId=${userId}`);
        [cite_start]const data = await res.json(); [cite: 388]
        if (data.success) {
            [cite_start]renderFriendSearchResults(data.users); [cite: 389]
        } else {
            resultsEl.innerHTML = `<li style="grid-column: 1; text-align: center; border: none; background: none; color: #f44336;">Error: ${data.error ||
[cite_start]'Could not fetch users.'}</li>`; [cite: 390]
        }
    } catch (e) {
        [cite_start]console.error("Network error during friend search:", e); [cite: 391]
        [cite_start]resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #f44336;">A network error occurred.</li>'; [cite: 392]
    }
}

function renderFriendSearchResults(users) {
    const resultsEl = document.getElementById('friend-search-results');
    [cite_start]resultsEl.innerHTML = ''; [cite: 393]
    if (users.length === 0) {
        [cite_start]resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">No users found matching that name.</li>'; [cite: 394]
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
           
            [cite_start]buttonClass = 'status-btn status-friends'; [cite: 395]
            disabled = 'disabled';
            buttonAction = 'none';
        } else if (user.relationshipStatus === 'request_sent') {
            buttonText = 'Pending (Sent)';
            buttonClass = 'status-btn status-pending-sent';
            disabled = 'disabled';
          
            [cite_start]buttonAction = 'none'; [cite: 396]
        } else if (user.relationshipStatus === 'request_received') {
            buttonText = 'Action Needed';
            buttonClass = 'status-btn status-pending-received';
            buttonAction = 'view-requests'; 
            [cite_start]statusMessage = ' (<a href="#" onclick="showSubView(\'page-find-friends\')">Accept/Reject</a>)'; [cite: 397]
        }

        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center;
[cite_start]background-color: #2c2c2c;'; [cite: 398]
        
        li.innerHTML = `
            <span>
                <strong style="font-size: 1.1em; color: var(--color-text-main);">${user.username}</strong>
                <span style="color: var(--color-text-subtle);">${statusMessage}</span>
            </span>
            <button class="${buttonClass}" data-action="${buttonAction}" data-recipient-id="${user.id}" ${disabled}>
                ${buttonText}
  
            [cite_start]</button> [cite: 399]
        `;
        [cite_start]resultsEl.appendChild(li); [cite: 400]
    });
}

async function handleSendFriendRequest(recipientId, buttonEl) {
    [cite_start]if (!userId) return alert("You must be logged in to send a request."); [cite: 401]
    buttonEl.textContent = 'Sending...';
    buttonEl.disabled = true;

    try {
        const res = await fetch(`/api/friends/request/${recipientId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        [cite_start]}); [cite: 402]
        const data = await res.json();

        if (data.success) {
            [cite_start]buttonEl.textContent = 'Pending (Sent)'; [cite: 403]
            buttonEl.classList.add('status-pending-sent');
            alert(data.message);
            
            // Refresh search results to update status, if search is active
            [cite_start]const searchInput = document.getElementById('friend-search-input'); [cite: 404]
            if(searchInput) handleFriendSearch({target: searchInput});

        } else {
            [cite_start]buttonEl.textContent = 'Failed (Retry)'; [cite: 405]
            buttonEl.disabled = false;
            alert(data.error || 'Failed to send request.');
        }

    } catch (e) {
        [cite_start]console.error("Send request failed:", e); [cite: 406]
        buttonEl.textContent = 'Network Error (Retry)';
        buttonEl.disabled = false;
    }
}

async function fetchPendingRequests() {
    [cite_start]if (!userId) return; [cite: 407]
    const requestsEl = document.getElementById('pending-requests-list');
    if (!requestsEl) return;
    [cite_start]requestsEl.innerHTML = ''; [cite: 408]
    try {
        const res = await fetch(`/api/friends/pending/${userId}`);
        [cite_start]const data = await res.json(); [cite: 409]
        const notificationCountEl = document.getElementById('friend-notification-count');

        if (data.success && data.requests.length > 0) {
            [cite_start]friendRequests = data.requests; [cite: 410]
            data.requests.forEach(request => {
                const li = document.createElement('li');
                li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background-color: #2c2c2c;';
                
                li.innerHTML = `
                    
[cite_start]<span style="color: var(--color-accent-highlight);">${request.requester_username}</span> [cite: 411]
                    <span style="color: var(--color-text-subtle);"> wants to be friends.</span>
                    <div>
                        <button data-action="accept-request" data-request-id="${request.id}" style="background-color: #4CAF50; margin-right: 5px;">Accept</button>
                      
                        [cite_start]<button data-action="reject-request" data-request-id="${request.id}" style="background-color: #f44336;">Reject</button> [cite: 412]
                    </div>
                `;
                requestsEl.appendChild(li);
            [cite_start]}); [cite: 413]
            if (notificationCountEl) {
                [cite_start]notificationCountEl.textContent = data.requests.length; [cite: 414]
                notificationCountEl.style.display = 'inline-block';
            }
        } else {
            [cite_start]friendRequests = []; [cite: 415]
            [cite_start]requestsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">No pending friend requests.</li>'; [cite: 416]
            if (notificationCountEl) notificationCountEl.style.display = 'none';
        }

    } catch (e) {
        [cite_start]console.error("Error fetching pending requests:", e); [cite: 417]
    }
}

async function handleRequestAction(requestId, action, buttonEl) {
    if (!userId) return;

    buttonEl.textContent = 'Loading...';
    [cite_start]buttonEl.closest('div').querySelectorAll('button').forEach(btn => btn.disabled = true); [cite: 418]
    try {
        const res = await fetch(`/api/friends/request/${requestId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                action: action
          
            [cite_start]}) [cite: 419]
        });

        [cite_start]const data = await res.json(); [cite: 420]
        if (data.success) {
            alert(`Request ${action}ed successfully!`);
            fetchPendingRequests();
            [cite_start]fetchFriendsList(); [cite: 421]
        } else {
            [cite_start]alert(data.error || `Failed to ${action} request.`); [cite: 422]
            buttonEl.closest('div').querySelectorAll('button').forEach(btn => btn.disabled = false);
        }

    } catch (e) {
        [cite_start]console.error(`Error handling request action (${action}):`, e); [cite: 423]
        alert('Network error while processing request.');
    }
}


// =================================================================================
// 8. CONFIRMED FRIENDS LIST LOGIC
// =================================================================================

async function fetchFriendsList() {
    [cite_start]if (!userId) return; [cite: 424]
    try {
        const res = await fetch(`/api/friends/${userId}`);
        [cite_start]const data = await res.json(); [cite: 425]
        if (data.success) {
            [cite_start]friendsList = data.friends; [cite: 426]
            // Only re-render if the user is currently viewing the friends tab
            if (document.getElementById('page-find-friends')?.style.display === 'block') {
                [cite_start]renderConfirmedFriendsList(); [cite: 427]
            }
        }
    } catch (error) {
        [cite_start]console.error('Error fetching friends list:', error); [cite: 428]
    }
}

function renderConfirmedFriendsList() {
    const listContainer = document.getElementById('confirmed-friends-list');
    if (!listContainer) return;
    
    [cite_start]listContainer.innerHTML = ''; [cite: 429]
    if (friendsList.length === 0) {
        [cite_start]listContainer.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">You have no confirmed friends.</li>'; [cite: 430]
        return;
    }

    friendsList.forEach(friend => {
        const li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background-color: #2c2c2c;';
        
        li.innerHTML = `
            <span style="color: var(--color-text-main); font-weight: bold;">${friend.friend_username}</span>
            <button class="status-btn status-friends" data-action="view-friend-list" data-friend-id="${friend.friend_id}" data-friend-username="${friend.friend_username}">
              
                [cite_start]View List [cite: 431]
            </button>
        `;
        listContainer.appendChild(li);
    [cite_start]}); [cite: 432]
}

function viewFriendWatchedList(friendId, friendUsername) {
    // 1. Switch to the 'watched' section
    [cite_start]showSubView('page-watched'); [cite: 433]
    // 2. Update the list title
    [cite_start]document.getElementById('watched-list-title').textContent = `${friendUsername}'s Watched List`; [cite: 434]
    // 3. Load the friend's list (this will update currentViewedList and currentViewedUserId)
    [cite_start]fetchWatchedAnime(friendId); [cite: 435]
    // 4. Add a "Back to My List" button
    const watchedHeader = document.getElementById('watched-list-header');
    [cite_start]if (!watchedHeader) return; [cite: 436]
    let backBtn = document.getElementById('back-to-my-list-btn');
    if (!backBtn) {
        backBtn = document.createElement('button');
        [cite_start]backBtn.id = 'back-to-my-list-btn'; [cite: 437]
        backBtn.className = 'status-btn status-reject';
        watchedHeader.prepend(backBtn);
    }
    
    [cite_start]backBtn.textContent = '← Back to My List'; [cite: 438]
    // Ensure only one listener is active by removing and re-adding
    const newBackButton = backBtn.cloneNode(true);
    [cite_start]backBtn.parentNode.replaceChild(newBackButton, backBtn); [cite: 439]
    backBtn = newBackButton;
    
    backBtn.addEventListener('click', () => {
        [cite_start]// Navigating back to the watched page triggers the showSubView('page-watched') logic [cite: 440]
        // which resets the title, removes the back button, and calls fetchWatchedAnime(userId).
        showSubView('page-watched');
    [cite_start]}); [cite: 440]
}
