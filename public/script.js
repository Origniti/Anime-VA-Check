// script.js
// Note: This file requires the server.js to be running on localhost:3000

// =================================================================================
// GLOBAL STATE & INITIALIZATION (using 'var' for maximum compatibility)
// =================================================================================

var userId = null;
var username = null;
var watched = []; // Stores the current user's (your) permanent watched list data
var toWatchList = []; // NEW: Stores the current user's (your) permanent to-watch/planning list data
var currentViewedList = []; // Stores the list data currently being rendered (yours or a friend's)
var currentViewedUserId = null; // Stores the ID of the user whose list is currently being rendered
var currentListType = 'watched'; // NEW: 'watched' or 'to-watch'
var vaCounts = {}; // Stores counts of all VAs in the current user's list (for filtering/highlighting)
var friendRequests = [];
// Stores pending requests for the current user
var friendsList = []; // Stores confirmed friends
var currentPage = 1;
var itemsPerPage = 6;
var activeVAFilter = null; // Used for click-to-filter on the watched list
var currentSort = 'recent';
var PLACEHOLDER_IMAGE = '/placeholder.png'; // Placeholder image path

// DOM Elements
var profileSidebar = document.getElementById('profile-sidebar');
var listSearchInput = document.getElementById('list-search');
var notesRatingInput = document.getElementById('notes-rating');
var notesDateStartedInput = document.getElementById('notes-date-started');
var notesDateFinishedInput = document.getElementById('notes-date-finished');
// =================================================================================
// 1. INITIAL SETUP AND NAVIGATION
// =================================================================================

document.addEventListener('DOMContentLoaded', function() {
    // --- Session Check ---
    userId = localStorage.getItem('animeTrackerUserId');
    username = localStorage.getItem('animeTrackerUsername');
    
    if (userId) {
        userId = String(userId);
        currentViewedUserId = userId; // Initialize current view ID to self
        document.getElementById('profile-username').textContent = username;
        showView('app-main');
        // Initial load is for the 'watched' list
        fetchUserLists(userId); 
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
    document.querySelectorAll('.view').forEach(function(view) {
        view.style.display = 'none';
    });
    document.getElementById(viewId).style.display = 'block';

    var profileContainer = document.getElementById('profile-container');
    if (profileContainer) {
        profileContainer.style.display = (viewId === 'app-main' ? 'block' : 'none');
    }
}

/**
 * Helper to switch between Watched, Search, and Find Friends sub-views.
 * Updated to handle list types ('watched' or 'to-watch').
 */
function showSubView(subViewId, listType = null) {
    document.querySelectorAll('#app-main .sub-view').forEach(function(view) {
        view.style.display = 'none';
    });
    document.getElementById(subViewId).style.display = 'block';

    // Update navigation active state
    document.querySelectorAll('.navbar button').forEach(function(button) {
        button.classList.remove('active');
        var viewName = subViewId.replace('page-', '');
        if (button.dataset.view === viewName) {
            button.classList.add('active');
        }
    });
    
    // Logic to handle list viewing
    if (subViewId === 'page-watched') {
        var watchedHeader = document.getElementById('watched-list-header');
        // Restore current user's list view settings
        var backBtn = document.getElementById('back-to-my-list-btn');
        if (backBtn) backBtn.remove();
        document.getElementById('list-controls').style.display = 'grid'; // Always show controls for user's own list
        
        // Handle list type switching only for the current user's view
        if (listType && String(currentViewedUserId) === String(userId)) {
            currentListType = listType;
        }

        // Set the appropriate title
        document.getElementById('watched-list-title').textContent = (String(currentViewedUserId) === String(userId) ? username + "'s " : currentViewedList.length > 0 ? currentViewedList[0].username + "'s " : "Friend's ") + 
            (currentListType === 'watched' ? 'Watched List' : 'To Watch List');

        // Only re-fetch if we are currently NOT viewing the correct list or if we switched list types
        if (String(currentViewedUserId) !== String(userId) || listType) {
             fetchUserLists(currentViewedUserId, currentListType);
        } else {
            // Re-render quickly if we were already viewing our own list of the current type
            renderWatchedList(); 
        }

    } else if (subViewId === 'page-find-friends') {
        fetchPendingRequests();
        fetchFriendsList();
        renderConfirmedFriendsList();
    }
}

function setupMainAppListeners() {
    // Navigation buttons
    document.querySelectorAll('.navbar button').forEach(function(button) {
        button.addEventListener('click', function(e) {
            var view = e.target.dataset.view;
            var listType = e.target.dataset.listType || null; // Read new data attribute
            
            showSubView('page-' + view, listType);
            // Close sidebar whenever a main navigation button is clicked
            if (profileSidebar && profileSidebar.classList.contains('active')) {
          
                profileSidebar.classList.remove('active');
            }
        });
    });
    // Profile Button Handler (Toggle sidebar)
    var profileButton = document.querySelector('.profile-button');
    if (profileButton) {
        profileButton.addEventListener('click', toggleProfileSidebar);
    }

    // Close sidebar if user clicks outside
    document.addEventListener('click', function(event) {
        if (profileSidebar && profileSidebar.classList.contains('active') && !profileSidebar.contains(event.target) && !profileButton.contains(event.target)) {
            profileSidebar.classList.remove('active');
        }
    });
    // Logout Handler
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

    // VA Language Selector
    document.getElementById('va-lang')?.addEventListener('change', function() {
        if (String(currentViewedUserId) === String(userId)) {
            getVoiceActorCounts(); // Recalculate counts when language changes
        }
        // Use renderWatchedList without arguments to use the current state
        renderWatchedList();
    });
    // Sort By Selector
    document.getElementById('sort-by')?.addEventListener('change', function(e) {
        currentSort = e.target.value;
        // Only sort the main 'watched' array if we are viewing our own list
        if (String(currentViewedUserId) === String(userId)) {
            if (currentListType === 'watched') {
                sortList(watched, currentSort);
            } else {
                sortList(toWatchList, currentSort);
            }
        }
        renderWatchedList();
    });
    // List Search Input
    if (listSearchInput) {
        listSearchInput.addEventListener('input', function() {
            // Only apply search/filter reset if viewing current user's list
            if (String(currentViewedUserId) === String(userId)) {
                activeVAFilter = null;
                currentPage = 1;
            }
            renderWatchedList();
        });
    }

    // Pagination Listeners
    document.getElementById('prev-page')?.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            renderWatchedList();
        }
    });
    document.getElementById('next-page')?.addEventListener('click', function() {
        // Use the currently viewed list for max page calculation
        var filteredList = getFilteredWatchedList(currentViewedList); // Note: Removed ownerId argument
        var maxPage = Math.ceil(filteredList.length / itemsPerPage);
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
    var isActive = profileSidebar.classList.toggle('active');

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
    currentViewedList = []; // Clear new state
    currentViewedUserId = null; // Clear new state
    watched = [];
    toWatchList = [];
    currentListType = 'watched';
    showView('auth');
    document.getElementById('watched-list').innerHTML = '';
    if (profileSidebar) profileSidebar.classList.remove('active');
}


// =================================================================================
// 2. AUTHENTICATION
// =================================================================================

function setupAuthListeners() {
    document.getElementById('show-register-btn')?.addEventListener('click', function() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        document.getElementById('auth-message').textContent = '';
    });
    document.getElementById('show-login-btn')?.addEventListener('click', function() {
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('auth-message').textContent = '';
    });
    document.getElementById('register-btn')?.addEventListener('click', handleRegister);
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
}

async function handleRegister() {
    var usernameInput = document.getElementById('register-username').value;
    var passwordInput = document.getElementById('register-password').value;
    var messageEl = document.getElementById('auth-message');

    var res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });
    var data = await res.json();
    
    if (data.success) {
        messageEl.textContent = 'Registration successful!\n\nPlease log in.';
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    } else {
        messageEl.textContent = data.error || 'Registration failed.';
    }
}

async function handleLogin() {
    var usernameInput = document.getElementById('login-username').value;
    var passwordInput = document.getElementById('login-password').value;
    var messageEl = document.getElementById('auth-message');

    var res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
    });
    var data = await res.json();

    if (data.success) {
        userId = String(data.userId);
        username = usernameInput;
        localStorage.setItem('animeTrackerUserId', userId);
        localStorage.setItem('animeTrackerUsername', username);
        document.getElementById('profile-username').textContent = username;
        
        currentViewedUserId = userId; // Set current view to self upon login
        
        showView('app-main');
        showSubView('page-watched', 'watched'); // Load watched list by default
        fetchUserLists(userId);
        fetchPendingRequests();
        fetchFriendsList();
    } else {
        messageEl.textContent = data.error || 'Login failed.';
    }
}


// =================================================================================
// 3. ANILIST SEARCH AND ADD (FIXED)
// =================================================================================

// Removed old document.getElementById('search-results')?.addEventListener('click', handleAddAnime);
document.getElementById('anime-search')?.addEventListener('input', debounce(handleSearch, 300));

/**
 * Debounce utility to limit the rate of function calls.
 */
function debounce(func, delay) {
    var timeout;
    return function() {
        var context = this;
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() { func.apply(context, args); }, delay);
    };
}

async function handleSearch(e) {
    var search = e.target.value.trim();
    var searchResultsEl = document.getElementById('search-results');
    searchResultsEl.innerHTML = '';
    
    if (search.length < 3) return;
    searchResultsEl.innerHTML = '<li class="search-message" style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #a0a0a0;">Searching...</li>';
    try {
        var res = await fetch('/search-anime?q=' + encodeURIComponent(search) + '&lang=romaji');
        var data = await res.json();
        
        // --- NEW: Call dedicated display function ---
        displaySearchResults(data); 

    } catch (e) {
        console.error("[SEARCH ERROR] AniList fetch failed:", e.message);
        searchResultsEl.innerHTML = '<li class="search-message" style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #f44336;">Error during search.</li>';
    }
}

/**
 * NEW FUNCTION: Displays the structured search results with Add buttons.
 */
function displaySearchResults(results) {
    const listContainer = document.getElementById('search-results');
    listContainer.innerHTML = '';
    
    if (!results || results.length === 0) {
        listContainer.innerHTML = '<li class="search-message" style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #a0a0a0;">No anime found. Try a different search term.</li>';
        return;
    }

    // Combine local lists to check if an anime already exists (in any status)
    const existingAnimeIds = new Set([
        ...watched.map(a => String(a.anime_id)),
        ...toWatchList.map(a => String(a.anime_id))
    ]);

    results.forEach(anime => {
        // Use Romaji title as default, fall back to English if Romaji is not available
        const title = anime.title.romaji || anime.title.english || 'Untitled Anime';
        // Sanitize and truncate description for display
        const description = anime.description 
            ? anime.description.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').trim().substring(0, 200) + (anime.description.length > 200 ? '...' : '') 
            : 'No description available.';
        const coverImage = anime.coverImage ? anime.coverImage.large : PLACEHOLDER_IMAGE;
        const animeIdStr = String(anime.id);
        const alreadyInList = existingAnimeIds.has(animeIdStr);

        const li = document.createElement('li');
        li.className = 'search-result-item'; // Class for CSS styling
        li.dataset.animeId = animeIdStr;
        
        li.innerHTML = `
            <div class="search-info-container">
                <div class="search-cover-container">
                    <img src="${coverImage}" alt="${title} cover" class="search-cover-image" onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}'">
                </div>
                <div class="search-details">
                    <h4 class="anime-title">${title}</h4>
                    <p class="anime-score">Score: ${anime.averageScore ? (anime.averageScore / 10).toFixed(1) : 'N/A'}</p>
                    <p class="anime-description-text">${description}</p>
                </div>
            </div>
            <div class="search-actions">
                <button class="add-btn status-watched" data-status="watched" data-anime-id="${anime.id}" ${alreadyInList ? 'disabled' : ''}>
                    ${alreadyInList ? 'Already in List' : 'Add to Watched'}
                </button>
                <button class="add-btn status-planning" data-status="planning" data-anime-id="${anime.id}" ${alreadyInList ? 'disabled' : ''}>
                    ${alreadyInList ? 'Already in List' : 'Add to To Watch'}
                </button>
            </div>
        `;

        // --- Event Listeners for New Buttons ---
        const watchedBtn = li.querySelector('.status-watched');
        const planningBtn = li.querySelector('.status-planning');
        
        if (alreadyInList) {
            watchedBtn.classList.add('disabled-add');
            planningBtn.classList.add('disabled-add');
            // If already in list, no need to add listeners
            listContainer.appendChild(li);
            return;
        }

        // FIX: Moved addAnimeHandler inside the loop to resolve the scoping bug (TypeError)
        const addAnimeHandler = async (event) => {
            const status = event.currentTarget.dataset.status;
            event.currentTarget.disabled = true;
            event.currentTarget.textContent = status === 'watched' ? 'Adding...' : 'Planning...';

            // Ask for rating only if adding to the 'watched' list immediately
            let rating = 0;
            if (status === 'watched') {
                 let ratingInput = prompt("Enter your rating for \"" + title + "\" (0-10 scale). Press OK for 0 rating or Cancel to stop:");
                 
                 // If the user presses Cancel or provides an empty string, we treat it as no rating but proceed
                 if (ratingInput === null) {
                    event.currentTarget.disabled = false;
                    event.currentTarget.textContent = 'Add to Watched';
                    return;
                 }
                 
                 rating = parseFloat(ratingInput) || 0;
                 
                 if (rating < 0 || rating > 10) {
                    alert("Invalid rating. Please enter a number between 0 and 10.");
                    event.currentTarget.disabled = false;
                    event.currentTarget.textContent = 'Add to Watched';
                    return;
                 }
            }
            

            const success = await addAnimeToList({
                userId: userId,
                animeId: anime.id,
                animeTitle: title,
                description: anime.description,
                coverImage: coverImage,
                characters: anime.characters ? anime.characters.edges : [],
                status: status, // Pass the correct status to the server
                rating: rating // Pass the rating
            });

            if (success) {
                event.currentTarget.textContent = status === 'watched' ? 'Added! (Watched)' : 'Added! (To Watch)';
                event.currentTarget.classList.add('added');
                
                // Disable the other button as well
                const otherBtn = status === 'watched' ? planningBtn : watchedBtn; 
                if (otherBtn) { // ADDED NULL CHECK TO PREVENT TYPEERROR
                    otherBtn.disabled = true;
                    otherBtn.textContent = 'Already Added';
                    otherBtn.classList.add('disabled-add');
                }
                
                // Update both watched and toWatch lists after adding
                fetchUserLists(userId); 
            } else {
                // Assuming failure is due to 'Already Exists' based on server implementation
                event.currentTarget.textContent = 'Already Exists';
                event.currentTarget.classList.add('disabled-add');
                event.currentTarget.disabled = true;
                
                // Disable the other button too as the anime is now in the list
                const otherBtn = status === 'watched' ? planningBtn : watchedBtn;
                if (otherBtn) { // ADDED NULL CHECK TO PREVENT TYPEERROR
                    otherBtn.disabled = true;
                    otherBtn.textContent = 'Already Exists';
                    otherBtn.classList.add('disabled-add');
                }
            }
        };

        watchedBtn.addEventListener('click', addAnimeHandler);
        planningBtn.addEventListener('click', addAnimeHandler);

        listContainer.appendChild(li);
    });
}

/**
 * NEW ASYNC HELPER: Handles the API call to add an anime with a specific status.
 */
async function addAnimeToList({ userId, animeId, animeTitle, description, coverImage, characters, status, rating }) {
    try {
        var res = await fetch('/add-anime', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                animeId: animeId,
                animeTitle: animeTitle,
                rating: rating, // Rating is now 0-10, passed directly
                description: description,
                coverImage: coverImage,
                characters: characters,
                status: status // Pass the required status
            })
        });

        var data = await res.json();
        
        if (data.success) {
            return true;
        } else {
            console.error("Failed to add anime:", data.error);
            // Alert user only on unique failure (not 'already added')
            if (!data.error.includes("already added")) {
                 alert("Failed to add anime: " + data.error);
            }
            return false;
        }
    } catch (e) {
        console.error("Add anime failed:", e);
        alert("An error occurred while adding the anime.");
        return false;
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
        var vaData = JSON.parse(vaString);
        return {
            japanese: vaData.japanese || "",
            english: vaData.english || ""
        };
    } catch (e) {
        return { japanese: "", english: "" };
    }
}

/**
 * Calculates the occurrence count for every voice actor in the user's watched list.
 * NOTE: Only calculates for the WATCHED list, as to-watch is less relevant for this stat.
 * Updates the global vaCounts object.
 */
function getVoiceActorCounts() {
    vaCounts = {}; // Reset counts
    // Uses the language selected in the UI
    var vaLang = document.getElementById('va-lang')?.value || 'japanese';

    watched.forEach(function(anime) { // Only iterate over the watched list
        var vaString = anime.voice_actors_parsed[vaLang] || "";
        var vaList = vaString.split('|');
        vaList.forEach(function(vaEntry) {
            var vaNameMatch = vaEntry.match(/: (.*)$/);
            // Use the VA name, handling both 'Char Name: VA Name' and just 'VA Name' formats
            var vaName = vaNameMatch ? vaNameMatch[1].trim() : vaEntry.trim();

            if (vaName) {
                vaCounts[vaName] = (vaCounts[vaName] || 0) + 1;
            }
        });
    });
}


/**
 * Sorts the provided list based on the given sort criteria.
 */
function sortList(list, sortType) {
    switch (sortType) {
        case 'rating-desc':
            list.sort(function(a, b) { 
                // Treat null/0 rating as lowest for sorting
                var ratingA = a.rating || 0;
                var ratingB = b.rating || 0;
                return ratingB - ratingA; 
            });
            break;
        case 'rating-asc':
            list.sort(function(a, b) { 
                 var ratingA = a.rating || 0;
                 var ratingB = b.rating || 0;
                 return ratingA - ratingB; 
            });
            break;
        case 'title-asc':
            list.sort(function(a, b) { return a.anime_title.localeCompare(b.anime_title); });
            break;
        case 'recent':
        default:
            list.sort(function(a, b) { return b.id - a.id; });
            break;
    }
}

/**
 * Fetches ALL list data (watched and to-watch) for a given user ID and updates the display.
 * @param {string} targetUserId - The ID of the user whose list to fetch.
 * @param {string} [listType=currentListType] - The type of list to set as the active view ('watched' or 'to-watch').
 */
async function fetchUserLists(targetUserId, listType = currentListType) {
    if (!targetUserId) return;
    
    document.getElementById('watched-list').innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: var(--color-text-subtle);">Loading ' + listType + ' list...</li>';
    
    // Clear the current view list while fetching to avoid stale data display
    currentViewedList = []; 

    try {
        // Fetch ALL lists for the user ID (sends ?status=all)
        var res = await fetch('/watched/' + targetUserId + '?status=all'); 
        var data = await res.json();
        
        var isCurrentUser = String(targetUserId) === String(userId);
        
        if (data.success) {
            var listData = data.data.map(function(item) {
                return {
                    ...item,
                    voice_actors_parsed: parseVoiceActors(item.voice_actors),
                    rating: parseFloat(item.rating) || 0,
                    date_started: item.date_started || '',
                    date_finished: item.date_finished || ''
                };
            });

            if (isCurrentUser) {
                // Separate into the two permanent user lists
                watched = listData.filter(item => item.status === 'watched');
                toWatchList = listData.filter(item => item.status === 'planning');

                // Sort the permanent lists
                sortList(watched, currentSort);
                sortList(toWatchList, currentSort);
                getVoiceActorCounts(); // Calculate VA counts for 'watched' list
                calculateAndRenderStats(); 
                
                // Set the current view based on the active list type
                currentListType = listType; 
                currentViewedList = currentListType === 'watched' ? watched : toWatchList;
                
                // When refreshing the user's own list, reset filters/page
                activeVAFilter = null;
                currentPage = 1;
            } else {
                // Friend's list - keep the fetched full list and set currentViewedUserId
                currentViewedList = listData.filter(item => item.status === currentListType); // Filter friend's list by current list type
                currentViewedUserId = targetUserId;
                // Sort by title ascending for simplicity in read-only view
                sortList(currentViewedList, 'title-asc'); 
                currentPage = 1; // Reset page when viewing a friend's list
            }
            
            // Render the list using the new global state
            renderWatchedList();

        } else {
            document.getElementById('watched-list').innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #f44336;">Error loading list: ' + data.error + '</li>';
        }

    } catch (e) {
        console.error('Network error fetching watched anime:', e);
        document.getElementById('watched-list').innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #f44336;">Network error. Please check your server connection.</li>';
    }
}


/**
 * Applies active text search and VA filters to the current viewed list.
 * Accepts the list to filter as an argument.
 */
function getFilteredWatchedList(listToFilter) {
    var filtered = listToFilter;
    var search = listSearchInput?.value.toLowerCase().trim() || '';
    var vaLang = document.getElementById('va-lang')?.value || 'japanese';

    // 1. Apply VA Filter (Only relevant if viewing OWN watched list)
    if (activeVAFilter && currentListType === 'watched' && String(currentViewedUserId) === String(userId)) {
        filtered = filtered.filter(function(anime) {
            var vaString = anime.voice_actors_parsed[vaLang];
            var vaNames = vaString.split('|').map(function(entry) { return entry.split(':').pop().trim(); });
            return vaNames.includes(activeVAFilter);
        });
    }
    
    // 2. Apply Text Search
    if (search) {
        filtered = filtered.filter(function(anime) {
            var vaString = anime.voice_actors_parsed[vaLang];
            return anime.anime_title.toLowerCase().includes(search) || vaString.toLowerCase().includes(search);
        });
    }

    return filtered;
}

/**
 * Renders the list items to the DOM, handling pagination and view modes (user vs. friend).
 */
function renderWatchedList() {
    // Use global state variables for the list to render and owner ID
    var listToRender = currentViewedList;
    var ownerId = currentViewedUserId;
    
    if (!listToRender || !ownerId) {
        document.getElementById('watched-list').innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: var(--color-text-subtle);">Select a list type or user.</li>';
        return;
    }

    var listEl = document.getElementById('watched-list');
    var isCurrentUser = String(ownerId) === String(userId);
    
    // Filtering logic: Only apply filters/search if viewing the current user's list
    var filtered = isCurrentUser ? getFilteredWatchedList(listToRender) : listToRender;
    var totalItems = filtered.length;
    var maxPage = Math.ceil(totalItems / itemsPerPage);
    
    // Toggle list controls visibility
    var listControls = document.getElementById('list-controls');
    if (listControls) {
        // Controls only show for the current user AND if viewing the watched list (where VA filter and rating sort are relevant)
        listControls.style.display = isCurrentUser && currentListType === 'watched' ? 'grid' : 'none';
        
        // Hide VA filter if not in watched view
        var vaControl = document.getElementById('va-filter-control');
        if (vaControl) {
            vaControl.style.display = currentListType === 'watched' ? 'block' : 'none';
        }
    }


    // Handle pagination boundaries
    if (currentPage > maxPage && maxPage > 0) currentPage = maxPage;
    else if (currentPage < 1 && maxPage > 0) currentPage = 1;

    var start = (currentPage - 1) * itemsPerPage;
    var end = start + itemsPerPage;
    var paginatedItems = filtered.slice(start, end);

    listEl.innerHTML = '';
    if (paginatedItems.length === 0) {
        listEl.innerHTML = '<li style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: var(--color-text-subtle);">\n' +
            (isCurrentUser ? (activeVAFilter ? 'No anime found matching your filter.' : 'Your ' + currentListType + ' list is empty.') : "This user's list is empty.") +
        '</li>';
    }

    var vaLang = isCurrentUser ? (document.getElementById('va-lang')?.value || 'japanese') : 'japanese';
    paginatedItems.forEach(function(anime) {
        // Prepare VA Tags (Only for watched list)
        var vaTags = '';
        if (anime.status === 'watched') {
             vaTags = (anime.voice_actors_parsed[vaLang] || '').split('|').map(function(entry) {
                if (!entry.trim()) return '';

                var parts = entry.split(':');
                var charNames = parts[0].trim();
                var vaName = parts.length > 1 ? parts[1].trim() : parts[0].trim();
                
                var classes = [];
                
                if (isCurrentUser) {
                    // 1. Check if the VA appears more than once (count > 1) to be highlighted and clickable
                    if (vaCounts[vaName] > 1) {
                        classes.push('highlight'); // Add the highlight style
                        classes.push('clickable'); // Add the click listener
                    }
                    
                    // 2. Check if the VA is the currently active filter
                    if (vaName === activeVAFilter) {
                        // The active filter should always be highlighted, even if its count is 1
                        if (!classes.includes('highlight')) {
                            classes.push('highlight');
                        }
                        classes.push('active-filter');
                    }
                }

                var finalClasses = classes.join(' ');

                // The inner span now only uses the computed classes. The hardcoded 'highlight' is removed.
                return '<span class="va"><span class="' + finalClasses + '" data-va-name="' + vaName + '">' + vaName + '</span> (' + charNames + ')</span>';
            }).join('');
        }


        var displayDescription = anime.description || 'No description available.';
        var isClipped = displayDescription.length > 200;
        var coverImageUrl = anime.coverimage || anime.coverImage || PLACEHOLDER_IMAGE;
        
        // Conditional Display based on status
        var statusLabel = anime.status === 'watched' ? 'Rating' : 'Status';
        var statusValue = anime.status === 'watched' 
            ? anime.rating.toFixed(1) + ' / 10' 
            : '<span style="color: #ffc107; font-weight: bold;">Planning</span>';
        var statusColor = anime.status === 'watched' 
            ? (anime.rating >= 8.5 ? '#4CAF50' : (anime.rating >= 7.0 ? '#FFC107' : '#F44336'))
            : '#03A9F4'; // Blue for planning

        var listItem = document.createElement('li');
        listItem.dataset.id = anime.id;
        listItem.dataset.animeId = anime.anime_id;
        // Add a class for different statuses for specific styling if needed
        listItem.classList.add('anime-status-' + anime.status);

        listItem.innerHTML = `
            <div class="anime-cover-container">
                <img src="${coverImageUrl}" onerror="this.onerror=null; this.src='${PLACEHOLDER_IMAGE}'" alt="${anime.anime_title} cover" class="anime-cover">
            </div>
            <div class="anime-info">
                <div>
                    <b>${anime.anime_title}</b>
  
                    <p style="color: ${statusColor}; font-weight: bold; margin: 5px 0 10px 0;">
                        ${statusLabel}: ${statusValue}
                    </p>
              
                    <div class="description-wrapper">
                        <span class="anime-description-text">${displayDescription}</span>
                        ${isClipped ? '<button class="read-more-btn" data-action="toggle-desc">Read More</button>' : ''}
                    </div>
                </div>
                ${anime.status === 'watched' ? `
                    <div class="va-tags-container">
                        ${vaTags}
                    </div>
                ` : ''}
      
                ${isCurrentUser ? `
                    <div class="action-buttons">
                        <button class="notes-btn" data-action="open-notes" 
                            data-title="${anime.anime_title}" 
                            data-anime-id="${anime.anime_id}" 
                            data-status="${anime.status}"
                            data-notes="${escapeHtml(anime.notes || '')}"
                            data-rating="${anime.rating || 0}"
                            data-date-started="${anime.date_started || ''}"
                            data-date-finished="${anime.date_finished || ''}"
                        >
                            Notes & Details
                        </button>
                        <button class="remove-btn" data-action="remove-anime" data-anime-id="${anime.anime_id}">
                            Remove
                        </button>
                    </div>
 
                ` : ''}
            </div>
        `;
        listEl.appendChild(listItem);
    });

    // Update Pagination Controls
    document.getElementById('page-info').textContent = 'Page ' + (maxPage > 0 ? currentPage : 0) + ' of ' + maxPage;
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
    container.querySelectorAll('[data-action="toggle-desc"]').forEach(function(button) {
        button.addEventListener('click', function(e) {
            var descWrapper = e.target.closest('.description-wrapper');
            descWrapper.classList.toggle('expanded');
            e.target.textContent = descWrapper.classList.contains('expanded') ? 'Read Less' : 'Read More';
        });
    });

    // VA Filter Listener
    // Note: Only VAs that appear more than once get the 'clickable' class
    container.querySelectorAll('.clickable').forEach(function(vaTag) {
        vaTag.addEventListener('click', function(e) {
            var vaName = e.target.dataset.vaName;
            
     
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
    container.querySelectorAll('[data-action="remove-anime"]').forEach(function(button) {
        button.addEventListener('click', handleRemoveAnime);
    });
    // Notes Button Listener
    container.querySelectorAll('[data-action="open-notes"]').forEach(function(button) {
        button.addEventListener('click', handleOpenNotesModal);
    });
}

async function handleRemoveAnime(e) {
    var animeId = e.target.dataset.animeId;
    var animeTitle = e.target.closest('li').querySelector('.anime-info b').textContent;
    if (!confirm("Are you sure you want to remove \"" + animeTitle + "\" from your list?")) return;
    try {
        var res = await fetch('/remove-anime/' + userId + '/' + animeId, {
            method: 'DELETE'
        });
        var data = await res.json();
        if (data.success) {
            alert(animeTitle + " removed successfully.");
            
            // Re-fetch ALL lists to ensure local data is consistent, especially if status changed
            fetchUserLists(userId);

            // No need to manually filter local arrays as fetchUserLists handles it
            calculateAndRenderStats();
        } else {
            alert("Failed to remove anime: " + data.error);
        }
    } catch (e) {
        console.error("Remove anime failed:", e);
        alert("An error occurred while removing the anime.");
    }
}


// =================================================================================
// 5. NOTES MODAL LOGIC (UPDATED)
// =================================================================================

var notesModal = document.getElementById('notes-modal');
var closeButton = document.querySelector('.close-button');
var saveNotesBtn = document.getElementById('save-notes-btn');
var notesTextarea = document.getElementById('notes-textarea');
var currentAnimeId = null;
var currentStatus = null; // New global to track item status for saving
function setupModalListeners() {
    if (closeButton) closeButton.onclick = function() { notesModal.style.display = 'none'; };
    if (notesModal) {
        window.onclick = function(event) {
            if (event.target == notesModal) {
                notesModal.style.display = 'none';
            }
        };
    }
    if (saveNotesBtn) saveNotesBtn.onclick = handleSaveNotes;
}

function handleOpenNotesModal(e) {
    // Only allow notes modal if viewing own list (buttons are already conditionally rendered)
    if (String(currentViewedUserId) !== String(userId)) return;

    var button = e.target.closest('[data-action="open-notes"]');
    var title = button.dataset.title;
    var notes = button.dataset.notes ? unescapeHtml(button.dataset.notes) : '';
    var rating = button.dataset.rating || 0;
    var dateStarted = button.dataset.dateStarted || '';
    var dateFinished = button.dataset.dateFinished || '';
    var status = button.dataset.status;

    currentAnimeId = button.dataset.animeId;
    currentStatus = status; // Store status for saving

    document.getElementById('modal-anime-title').textContent = title;
    notesTextarea.value = notes;
    notesRatingInput.value = rating;
    notesDateStartedInput.value = dateStarted;
    notesDateFinishedInput.value = dateFinished;
    
    // FIX: Show rating and date fields for BOTH 'watched' and 'planning' 
    // to allow promotion from planning to watched by adding a finished date.
    var watchedFields = document.getElementById('watched-fields');
    if (watchedFields) {
        watchedFields.style.display = (status === 'watched' || status === 'planning') ? 'grid' : 'none';
    }

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
    var notes = notesTextarea.value;
    // Rating/Dates are only relevant if the fields are currently visible (i.e., status is watched/planning)
    var isListManaged = (currentStatus === 'watched' || currentStatus === 'planning');
    var rating = isListManaged ? parseFloat(notesRatingInput.value) : 0;
    var dateStarted = isListManaged ? notesDateStartedInput.value : null;
    var dateFinished = isListManaged ? notesDateFinishedInput.value : null;

    // Basic validation for rating
    if (currentStatus === 'watched' && (isNaN(rating) || rating < 0 || rating > 10)) {
        alert("Please enter a valid rating between 0 and 10.");
        return;
    }
    
    // Determine the status to save (If moving from planning to watched, update status)
    var newStatus = currentStatus;
    // Check if the item is planning AND the user entered a finished date
    if (currentStatus === 'planning' && dateFinished) {
         if (confirm("Setting a finished date will move this anime to your Watched list. Proceed?")) {
            newStatus = 'watched';
         } else {
             // If user cancels, clear the date finished so it remains in planning
             dateFinished = null; 
         }
    }


    try {
        var res = await fetch('/update-list-item', { // Using a more general endpoint
            method: 'PATCH',
         
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                animeId: currentAnimeId,
                notes: notes,
                rating: rating,
                date_started: dateStarted,
                date_finished: dateFinished,
                status: newStatus // Pass new status
            })
        });

        var data = await res.json();
        
        if (data.success) {
            alert("Details saved successfully!");
            notesModal.style.display = 'none';
            
            // Re-fetch ALL lists to ensure local data is consistent, especially if status changed
            fetchUserLists(userId, newStatus === 'watched' ? 'watched' : 'to-watch');

        } else {
            alert("Failed to save details: " + data.error);
        }
    } catch (e) {
        console.error("Save details failed:", e);
        alert("An error occurred while saving details.");
    }
}


// =================================================================================
// 6. STATS LOGIC
// =================================================================================

function calculateAndRenderStats() {
    var statsContainer = document.getElementById('stats-content');
    if (!statsContainer) return;

    // Stats always use the current user's (watched) list
    if (watched.length === 0) {
        statsContainer.innerHTML = '<p class="stats-message">Your watched list is empty. Add some anime to see stats!</p>';
        return;
    }

    // --- 1. Total Anime ---
    var totalWatchedAnime = watched.length;
    var totalPlanningAnime = toWatchList.length;
    // --- 2. Average Rating ---
    var ratedAnime = watched.filter(function(anime) { return anime.rating > 0; });
    var totalRating = ratedAnime.reduce(function(sum, anime) { return sum + anime.rating; }, 0);
    var avgRating = ratedAnime.length > 0 ? totalRating / ratedAnime.length : 0;

    // --- 3. Top Voice Actor ---
    // Recalculate counts to ensure the language selection is honored
    getVoiceActorCounts(); 
    var vaLang = document.getElementById('va-lang')?.value || 'japanese';

    var topVA = { name: 'N/A', count: 0 };
    for (var name in vaCounts) {
        if (vaCounts[name] > topVA.count) {
            topVA = { name: name, count: vaCounts[name] };
        }
    }
    
    // --- 4. Most Recent Watch ---
    // The list is sorted by recent (descending id) by default during fetch
    var mostRecent = watched.length > 0 ? watched[0].anime_title : 'N/A';

    // --- Render the Stats ---
    statsContainer.innerHTML = `
        <div class="stats-group">
            <div class="stat-item">
                <span class="stat-value">${totalWatchedAnime}</span>
                <span class="stat-label">Total Watched Titles</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${totalPlanningAnime}</span>
                <span class="stat-label">Total To Watch Titles</span>
            </div>
            <div class="stat-item">
   
                <span class="stat-value">${avgRating.toFixed(2)} / 10</span>
                <span class="stat-label">Average Rating (Watched)</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">${topVA.name}</span>
                <span class="stat-label">Top ${vaLang.charAt(0).toUpperCase() + vaLang.slice(1)} VA (${topVA.count} titles)</span>
 
            </div>
            <div class="stat-item">
                <span class="stat-value">${mostRecent}</span>
                <span class="stat-label">Most Recently Added (Watched)</span>
            </div>
        </div>
    `;
}


// =================================================================================
// 7. FRIEND SYSTEM LOGIC
// =================================================================================

function setupFriendSearchListeners() {
    document.getElementById('friend-search-input')?.addEventListener('input', debounce(handleFriendSearch, 300));
    document.getElementById('friend-search-results')?.addEventListener('click', function(e) {
        if (e.target.dataset.action === 'send-request') {
            var recipientId = e.target.dataset.recipientId;
            handleSendFriendRequest(recipientId, e.target);
        }
    });
    document.getElementById('pending-requests-list')?.addEventListener('click', function(e) {
        var target = e.target;
        if (target.dataset.action === 'accept-request') {
            handleRequestAction(target.dataset.requestId, 'accept', target);
        }
        if (target.dataset.action === 'reject-request') {
            handleRequestAction(target.dataset.requestId, 'reject', target);
        }
    });
    document.getElementById('confirmed-friends-list')?.addEventListener('click', function(e) {
        var target = e.target;
        if (e.target.dataset.action === 'view-friend-list') {
            // Default to viewing a friend's 'watched' list
            viewFriendWatchedList(target.dataset.friendId, target.dataset.friendUsername, 'watched'); 
        }
    });
}

async function handleFriendSearch(e) {
    if (!userId) return;

    var search = e.target.value.trim();
    var resultsEl = document.getElementById('friend-search-results');
    if (search.length < 3) {
        resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Start typing a username to search for friends.</li>';
        return;
    }

    resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Searching...</li>';
    try {
        var res = await fetch('/api/users/search?q=' + encodeURIComponent(search) + '&userId=' + userId);
        var data = await res.json();
        if (data.success) {
            renderFriendSearchResults(data.users);
        } else {
            resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #f44336;">Error: ' + (data.error || 'Could not fetch users.') + '</li>';
        }
    } catch (e) {
        console.error("Network error during friend search:", e);
        resultsEl.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #f44336;">A network error occurred.</li>';
    }
}

function renderFriendSearchResults(users) {
    var resultsEl = document.getElementById('friend-search-results');
    resultsEl.innerHTML = '';
    if (users.length === 0) {
        listContainer.innerHTML = '<li class="search-message" style="grid-column: 1 / -1; text-align: center; border: none; background: none; color: #a0a0a0;">No anime found. Try a different search term.</li>';
        return;
    }

    users.forEach(function(user) {
        var buttonText = 'Add Friend';
        var buttonClass = 'add-friend-btn';
        var disabled = '';
        var buttonAction = 'send-request';
        var statusMessage = '';

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

        var li = document.createElement('li');
        li.style.cssText = 'display: flex; justify-content: space-between; align-items: center;\nbackground-color: #2c2c2c;';
        
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
        var res = await fetch('/api/friends/request/' + recipientId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: userId })
        });
        var data = await res.json();

        if (data.success) {
            buttonEl.textContent = 'Pending (Sent)';
            buttonEl.classList.add('status-pending-sent');
            alert(data.message);
            
            // Refresh search results to update status, if search is active
            var searchInput = document.getElementById('friend-search-input');
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
    var requestsEl = document.getElementById('pending-requests-list');
    if (!requestsEl) return;
    requestsEl.innerHTML = '';
    try {
        var res = await fetch('/api/friends/pending/' + userId);
        var data = await res.json();
        var notificationCountEl = document.getElementById('friend-notification-count');

        if (data.success && data.requests.length > 0) {
            friendRequests = data.requests;
            data.requests.forEach(function(request) {
                var li = document.createElement('li');
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
    buttonEl.closest('div').querySelectorAll('button').forEach(function(btn) { btn.disabled = true; });
    try {
        var res = await fetch('/api/friends/request/' + requestId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                action: action
          
            })
        });

        var data = await res.json();
        if (data.success) {
            alert('Request ' + action + 'ed successfully!');
            fetchPendingRequests();
            fetchFriendsList();
        } else {
            alert(data.error || 'Failed to ' + action + ' request.');
            buttonEl.closest('div').querySelectorAll('button').forEach(function(btn) { btn.disabled = false; });
        }

    } catch (e) {
        console.error('Error handling request action (' + action + '):', e);
        alert('Network error while processing request.');
    }
}


// =================================================================================
// 8. CONFIRMED FRIENDS LIST LOGIC
// =================================================================================

async function fetchFriendsList() {
    if (!userId) return;
    try {
        var res = await fetch('/api/friends/' + userId);
        var data = await res.json();
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
    var listContainer = document.getElementById('confirmed-friends-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    if (friendsList.length === 0) {
        listContainer.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">You have no confirmed friends.</li>';
        return;
    }

    friendsList.forEach(function(friend) {
        var li = document.createElement('li');
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

function viewFriendWatchedList(friendId, friendUsername, listType) {
    // 1. Switch to the 'watched' section, passing the listType ('watched' or 'to-watch')
    showSubView('page-watched', listType);
    
    // 2. Set currentViewedUserId and load the friend's list 
    currentViewedUserId = friendId;
    fetchUserLists(friendId, listType);
    
    // 3. Add a "Back to My List" button
    var watchedHeader = document.getElementById('watched-list-header');
    if (!watchedHeader) return;
    var backBtn = document.getElementById('back-to-my-list-btn');
    if (!backBtn) {
        backBtn = document.createElement('button');
        backBtn.id = 'back-to-my-list-btn';
        backBtn.className = 'status-btn status-reject';
        watchedHeader.prepend(backBtn);
    }
    
    backBtn.textContent = '← Back to My List';
    // Ensure only one listener is active by removing and re-adding
    var newBackButton = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackButton, backBtn);
    backBtn = newBackButton;
    
    backBtn.addEventListener('click', function() {
        // Navigating back to the watched page triggers the showSubView('page-watched') logic
        // which resets the title, removes the back button, and calls fetchWatchedAnime(userId).
        currentViewedUserId = userId; // Reset to self
        showSubView('page-watched', currentListType); // Re-render own list of current type
    });
}
