// script.js
// Note: This file requires the server.js to be running on localhost:3000

// =================================================================================
// GLOBAL STATE & INITIALIZATION (using 'var' for maximum compatibility)
// =================================================================================

var userId = null;
var username = null;
var watched = []; // Stores the current user's (your) permanent list data
var currentViewedList = []; // Stores the list data currently being rendered (yours or a friend's)
var currentViewedUserId = null; // Stores the ID of the user whose list is currently being rendered
var vaCounts = {}; // Stores counts of all VAs in the current user's list (for filtering/highlighting)
var friendRequests = []; // Stores pending requests for the current user
var friendsList = []; // Stores confirmed friends
var currentPage = 1;
var itemsPerPage = 6;
var activeVAFilter = null; // Used for click-to-filter on the watched list
var currentSort = 'recent';
var PLACEHOLDER_IMAGE = '/placeholder.png'; // Placeholder image path

// DOM Elements
var profileSidebar = document.getElementById('profile-sidebar');
var listSearchInput = document.getElementById('list-search');
// =================================================================================
// 1. INITIAL SETUP AND NAVIGATION
// =================================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Check for existing token/session
    if (localStorage.getItem('token')) {
        // If logged in, go to dashboard
        showView('dashboard');
        loadUserProfile();
        fetchWatchedAnime(userId); 
        fetchFriendRequests();
        fetchFriendsList();
    } else {
        // If not logged in, go to auth
        showView('auth');
    }
    
    // Attach event listeners for main navigation
    document.getElementById('nav-search-btn').addEventListener('click', () => showSubView('page-search'));
    document.getElementById('nav-watched-btn').addEventListener('click', () => {
        showSubView('page-watched');
        // Reset to user's own list when navigating back to watched
        document.getElementById('watched-list-title').textContent = "My Watched List";
        document.getElementById('va-filter-display').style.display = 'none';
        activeVAFilter = null;
        fetchWatchedAnime(userId); // Fetches and displays current user's list
        
        // Remove friend back button if it exists
        var backBtn = document.getElementById('back-to-my-list-btn');
        if (backBtn) { backBtn.remove(); }
    });
    document.getElementById('nav-friends-btn').addEventListener('click', () => showSubView('page-friends'));

    // Attach profile/logout listeners
    document.querySelector('.profile-button').addEventListener('click', toggleProfileSidebar);
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Initial subview display for dashboard
    showSubView('page-watched');
    
    // Search listener
    document.getElementById('anime-search-btn').addEventListener('click', searchAnime);
    document.getElementById('anime-search-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchAnime();
        }
    });

    // Watched list control listeners
    document.getElementById('sort-select').addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderWatchedList(currentViewedList);
    });
    document.getElementById('prev-page-btn').addEventListener('click', () => paginateList(currentPage - 1));
    document.getElementById('next-page-btn').addEventListener('click', () => paginateList(currentPage + 1));

    // Friend Management Listeners
    document.getElementById('add-friend-btn').addEventListener('click', sendFriendRequest);
    
    // Notes Modal Listeners
    document.querySelector('#notes-modal .close-button').addEventListener('click', hideNotesModal);
    document.getElementById('save-notes-btn').addEventListener('click', saveNotes);
    window.addEventListener('click', (event) => {
        var modal = document.getElementById('notes-modal');
        if (event.target === modal) {
            hideNotesModal();
        }
    });
});

// Function to switch between main views (auth, dashboard)
function showView(viewId) {
    var views = document.querySelectorAll('.view');
    views.forEach(function(view) {
        if (view) { // FIX: Added null check to prevent "Cannot read properties of null (reading 'style')"
            view.style.display = 'none';
            view.classList.remove('active');
        }
    });

    var activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.style.display = 'block';
        activeView.classList.add('active');
    }

    // Adjust profile sidebar visibility
    var profileSidebar = document.getElementById('profile-sidebar');
    if (viewId === 'dashboard') {
        if (profileSidebar) {
            profileSidebar.style.display = 'flex';
        }
    } else {
        if (profileSidebar) {
            profileSidebar.style.display = 'none';
        }
    }
}

// Function to switch between dashboard subviews (search, watched, friends)
function showSubView(subviewId) {
    // 1. Hide all subviews
    var subviews = document.querySelectorAll('.subview');
    subviews.forEach(view => view.style.display = 'none');
    
    // 2. Show the active subview
    var activeSubView = document.getElementById(subviewId);
    if (activeSubView) {
        activeSubView.style.display = 'block';
    }

    // 3. Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('nav-' + subviewId.replace('page-', '') + '-btn').classList.add('active');
}

// Function to toggle the profile sidebar
function toggleProfileSidebar() {
    var sidebar = document.getElementById('profile-sidebar');
    if (!sidebar) return;
    
    // Check the computed style if 'display' is 'none'
    var isHidden = window.getComputedStyle(sidebar).display === 'none';

    if (isHidden) {
        sidebar.style.display = 'flex';
    } else {
        sidebar.style.display = 'none';
    }
}

// =================================================================================
// 2. AUTHENTICATION
// =================================================================================

document.getElementById('show-register-btn').addEventListener('click', function() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
});

document.getElementById('show-login-btn').addEventListener('click', function() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
});

document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('register-btn').addEventListener('click', register);

async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            userId = data.userId;
            window.alert('Login successful!');
            
            // Switch view
            showView('dashboard');
            loadUserProfile();
            fetchWatchedAnime(userId); 
            fetchFriendRequests();
            fetchFriendsList();
            showSubView('page-watched');
        } else {
            window.alert('Login failed: ' + (data.message || 'Invalid credentials'));
        }
    } catch (error) {
        console.error('Login error:', error);
        window.alert('An error occurred during login.');
    }
}

async function register() {
    const regUsername = document.getElementById('register-username').value;
    const regPassword = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-password-confirm').value;

    if (regPassword !== confirmPassword) {
        window.alert('Passwords do not match.');
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: regUsername, password: regPassword })
        });
        
        const data = await response.json();

        if (response.ok) {
            window.alert('Registration successful! Please log in.');
            document.getElementById('register-form').style.display = 'none';
            document.getElementById('login-form').style.display = 'block';
        } else {
            window.alert('Registration failed: ' + (data.message || 'User might already exist.'));
        }
    } catch (error) {
        console.error('Registration error:', error);
        window.alert('An error occurred during registration.');
    }
}

function logout() {
    localStorage.removeItem('token');
    userId = null;
    username = null;
    watched = [];
    currentViewedList = [];
    currentViewedUserId = null;
    vaCounts = {};
    friendRequests = [];
    friendsList = [];
    currentPage = 1;
    activeVAFilter = null;
    
    // Clear list displays
    document.getElementById('watched-list').innerHTML = '<p class="empty-message">Your watched list is empty. Add some anime from the Search tab!</p>';
    document.getElementById('search-results').innerHTML = '<p class="empty-message">Search for an anime to get started!</p>';
    document.getElementById('pending-requests-list').innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">No pending friend requests.</li>';
    document.getElementById('confirmed-friends-list').innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">You have no confirmed friends.</li>';

    showView('auth');
    toggleProfileSidebar(); // Hide the sidebar when logging out
}

async function loadUserProfile() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch('/profile', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            username = data.username;
            userId = data.id; // Ensure userId is updated
            document.getElementById('profile-username').textContent = username;
            document.getElementById('welcome-username').textContent = username;
            
            // Fetch stats after profile is loaded
            fetchUserStats(); 
        } else {
            // Token might be expired or invalid, force logout
            logout();
        }
    } catch (error) {
        console.error('Profile load error:', error);
        logout();
    }
}

// =================================================================================
// 3. ANIME SEARCH & ADDING
// =================================================================================

async function searchAnime() {
    const query = document.getElementById('anime-search-input').value.trim();
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '<p class="empty-message">Searching...</p>';

    if (!query) {
        resultsContainer.innerHTML = '<p class="empty-message">Please enter a title to search.</p>';
        return;
    }

    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (response.ok) {
            renderSearchResults(data);
        } else {
            resultsContainer.innerHTML = `<p class="empty-message">Search failed: ${data.message || 'Server error'}</p>`;
        }
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<p class="empty-message">An error occurred during search.</p>';
    }
}

function renderSearchResults(results) {
    const container = document.getElementById('search-results');
    container.innerHTML = ''; // Clear previous results

    if (!results || results.length === 0) {
        container.innerHTML = '<p class="empty-message">No anime found matching your search.</p>';
        return;
    }

    results.forEach(anime => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="anime-cover-container">
                <img src="${anime.coverImage || PLACEHOLDER_IMAGE}" alt="${anime.title}" class="anime-cover">
            </div>
            <span class="anime-score">${anime.averageScore || 'N/A'}%</span>
            <div class="anime-title">${anime.title}</div>
            <p class="anime-description-text">${anime.description || 'No description available.'}</p>
            ${renderVoiceActors(anime.characters)}
            <button class="add-btn" data-anime-id="${anime.id}" data-anime-title="${anime.title}">Add to Watched</button>
        `;
        container.appendChild(li);
        
        // Add event listener to the Add button
        li.querySelector('.add-btn').addEventListener('click', handleAddToWatched);
    });
}

async function handleAddToWatched(event) {
    const button = event.target;
    const animeId = button.dataset.animeId;
    const animeTitle = button.dataset.animeTitle;
    const token = localStorage.getItem('token');

    if (!token || !userId) {
        alert('You must be logged in to add anime.');
        return;
    }

    try {
        const response = await fetch('/api/watched/add', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ animeId, animeTitle })
        });

        const data = await response.json();

        if (response.ok) {
            alert(`"${animeTitle}" added to your watched list!`);
            // Refresh the user's main watched list after adding
            fetchWatchedAnime(userId); 
            // Update stats
            fetchUserStats();
        } else {
            alert('Failed to add anime: ' + (data.message || 'Server error.'));
        }
    } catch (error) {
        console.error('Add to watched error:', error);
        alert('An error occurred while adding the anime.');
    }
}

// Helper function to format voice actors for display
function renderVoiceActors(characters) {
    if (!characters || characters.length === 0) return '';
    
    let html = '<h4>Main Voice Actors:</h4><ul class="anime-va-list">';
    const uniqueVAs = new Map();

    // Collect up to 3 unique Japanese VAs per anime
    for (const charEdge of characters) {
        for (const va of charEdge.voiceActors) {
            if (va.language === 'Japanese' && !uniqueVAs.has(va.name.full)) {
                uniqueVAs.set(va.name.full, true);
                // Limit to 3 VAs
                if (uniqueVAs.size >= 3) break;
            }
        }
        if (uniqueVAs.size >= 3) break;
    }

    uniqueVAs.forEach((_, vaName) => {
        // Voice actors are not highlighted/clickable in the search view
        html += `<li>${vaName}</li>`;
    });
    
    html += '</ul>';
    return html;
}

// =================================================================================
// 4. WATCHED LIST MANAGEMENT
// =================================================================================

async function fetchWatchedAnime(targetUserId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    currentViewedUserId = targetUserId;
    
    // Check if we are viewing the current user's list
    if (targetUserId === userId) {
        // Fetch the user's permanent list data
        try {
            const response = await fetch('/api/watched', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                watched = data; // Update the user's permanent list
                currentViewedList = data; // Set the viewed list to the user's list
                
                // Only count VAs for the *current user's* list
                vaCounts = calculateVACounts(watched); 
                
                // Re-render the list based on the new data
                renderWatchedList(currentViewedList); 
            } else {
                console.error('Failed to fetch watched list:', response.status);
                currentViewedList = [];
                renderWatchedList([]);
            }
        } catch (error) {
            console.error('Fetch watched error:', error);
            currentViewedList = [];
            renderWatchedList([]);
        }
    } else {
        // Fetch a friend's list
        try {
            const response = await fetch(`/api/watched/friend/${targetUserId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                currentViewedList = data; // Set the viewed list to the friend's list
                
                // Do NOT update vaCounts for friend's list, only for highlighting
                renderWatchedList(currentViewedList);
            } else {
                alert('Failed to fetch friend\'s list.');
                currentViewedList = [];
                renderWatchedList([]);
                // Fallback to user's list if friend fetch fails
                fetchWatchedAnime(userId); 
            }
        } catch (error) {
            console.error('Fetch friend watched error:', error);
            alert('An error occurred while fetching friend\'s list.');
            fetchWatchedAnime(userId); 
        }
    }
}

function calculateVACounts(list) {
    const counts = {};
    list.forEach(item => {
        (item.voiceActors || []).forEach(va => {
            counts[va] = (counts[va] || 0) + 1;
        });
    });
    return counts;
}

function renderWatchedList(list) {
    // 1. Apply Filtering (only if viewing the user's own list)
    let filteredList = list;
    if (activeVAFilter && currentViewedUserId === userId) {
        filteredList = list.filter(anime => 
            (anime.voiceActors || []).includes(activeVAFilter)
        );
    }
    
    // 2. Apply Sorting
    filteredList.sort((a, b) => {
        if (currentSort === 'title') {
            return a.title.localeCompare(b.title);
        }
        if (currentSort === 'score') {
            return (b.score || 0) - (a.score || 0);
        }
        if (currentSort === 'recent') {
            // Sort by the 'added_at' timestamp (descending for recent)
            return new Date(b.added_at) - new Date(a.added_at);
        }
        if (currentSort === 'vas') {
            // Sort by the count of VAs in the list (most VAs first)
            const countA = (a.voiceActors || []).length;
            const countB = (b.voiceActors || []).length;
            return countB - countA;
        }
        return 0;
    });
    
    // 3. Apply Pagination
    const totalItems = filteredList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    currentPage = Math.max(1, Math.min(currentPage, totalPages)); // Clamp page
    if (totalPages === 0) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const paginatedList = filteredList.slice(start, start + itemsPerPage);

    // 4. Update Pagination Display
    document.getElementById('current-page-display').textContent = currentPage;
    document.getElementById('total-pages-display').textContent = totalPages;
    document.getElementById('prev-page-btn').disabled = currentPage === 1 || totalPages === 0;
    document.getElementById('next-page-btn').disabled = currentPage === totalPages || totalPages === 0;

    // 5. Render List Items
    const container = document.getElementById('watched-list');
    container.innerHTML = ''; 

    if (!paginatedList || paginatedList.length === 0) {
        container.innerHTML = filteredList.length > 0 && activeVAFilter 
            ? '<p class="empty-message">No anime found for this Voice Actor filter.</p>'
            : '<p class="empty-message">Your watched list is empty. Add some anime from the Search tab!</p>';
        return;
    }

    paginatedList.forEach(anime => {
        const li = document.createElement('li');
        
        // Determine if it's the user's list for action buttons
        const isUserList = currentViewedUserId === userId;

        // Render VAs for the watched list (clickable only if it's the user's own list)
        const vaHtml = renderWatchedListVoiceActors(anime.voiceActors, isUserList);

        li.innerHTML = `
            <span class="anime-score">${anime.score || 'N/A'}%</span>
            <div class="anime-cover-container">
                <img src="${anime.coverImage || PLACEHOLDER_IMAGE}" alt="${anime.title}" class="anime-cover">
            </div>
            <div class="anime-title">${anime.title}</div>
            <p class="anime-description-text">${anime.description || 'No description available.'}</p>
            ${vaHtml}
            ${isUserList ? `
                <div class="list-actions">
                    <button class="notes-btn" data-anime-id="${anime.animeId}" data-anime-title="${anime.title}" data-notes="${anime.notes || ''}">📝 Notes</button>
                    <button class="remove-btn" data-anime-id="${anime.animeId}" data-anime-title="${anime.title}">❌ Remove</button>
                </div>
            ` : ''}
        `;
        container.appendChild(li);

        // Attach listeners for user's list actions
        if (isUserList) {
            li.querySelector('.notes-btn').addEventListener('click', showNotesModal);
            li.querySelector('.remove-btn').addEventListener('click', handleRemoveFromWatched);
            
            // Attach VA filter listener
            li.querySelectorAll('.va-highlight').forEach(vaEl => {
                vaEl.addEventListener('click', handleVAFilterClick);
            });
        }
    });
    
    // Re-apply list search filter after rendering
    filterWatchedList();
}

// Function to handle pagination
function paginateList(newPage) {
    currentPage = newPage;
    renderWatchedList(currentViewedList);
}

// Function to handle client-side search filtering
function filterWatchedList() {
    const searchTerm = document.getElementById('list-search').value.toLowerCase();
    const listItems = document.getElementById('watched-list').querySelectorAll('li');

    // Only filter if we are viewing the current user's list (to keep it simple)
    if (currentViewedUserId === userId) {
        listItems.forEach(li => {
            const title = li.querySelector('.anime-title')?.textContent.toLowerCase() || '';
            
            if (title.includes(searchTerm)) {
                li.style.display = 'flex'; // Show the item
            } else {
                li.style.display = 'none'; // Hide the item
            }
        });
    } else {
        // If viewing a friend's list, search is disabled/unnecessary
        listItems.forEach(li => li.style.display = 'flex');
    }
}

// Helper function to format voice actors for watched list display
function renderWatchedListVoiceActors(vas, isUserList) {
    if (!vas || vas.length === 0) return '';
    
    let html = '<h4>Voice Actors:</h4><ul class="anime-va-list">';
    
    vas.forEach(vaName => {
        // Highlighting logic: Count in user's list must be >= 3 AND we must be viewing the user's list
        const isHighlight = isUserList && vaCounts[vaName] >= 3;
        const vaClass = isHighlight ? 'va-highlight' : '';

        html += `<li><span class="${vaClass}">${vaName}</span> (${vaCounts[vaName] || 0})</li>`;
    });
    
    html += '</ul>';
    return html;
}

// Function to handle VA filter click
function handleVAFilterClick(event) {
    const vaName = event.target.textContent.split('(')[0].trim(); // Get the name without the count
    
    if (activeVAFilter === vaName) {
        // Clear filter
        activeVAFilter = null;
        document.getElementById('va-filter-display').style.display = 'none';
        document.getElementById('va-filter-display').textContent = '';
    } else {
        // Apply new filter
        activeVAFilter = vaName;
        document.getElementById('va-filter-display').style.display = 'inline-block';
        document.getElementById('va-filter-display').textContent = `VA Filter: ${vaName}`;
    }
    // Always reset to page 1 and re-render
    currentPage = 1;
    renderWatchedList(currentViewedList);
}

async function handleRemoveFromWatched(event) {
    const button = event.target;
    const animeId = button.dataset.animeId;
    const animeTitle = button.dataset.animeTitle;
    const token = localStorage.getItem('token');

    if (!confirm(`Are you sure you want to remove "${animeTitle}" from your list?`)) return;

    try {
        const response = await fetch('/api/watched/remove', {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ animeId })
        });

        const data = await response.json();

        if (response.ok) {
            alert(`"${animeTitle}" removed.`);
            // Refresh the list and stats
            fetchWatchedAnime(userId); 
            fetchUserStats();
        } else {
            alert('Failed to remove anime: ' + (data.message || 'Server error.'));
        }
    } catch (error) {
        console.error('Remove from watched error:', error);
        alert('An error occurred while removing the anime.');
    }
}

// =================================================================================
// 5. NOTES MODAL
// =================================================================================

var currentNoteAnimeId = null;

function showNotesModal(event) {
    const button = event.target;
    currentNoteAnimeId = button.dataset.animeId;
    const animeTitle = button.dataset.animeTitle;
    // Notes are retrieved from the button's data-notes attribute when opened
    const notes = button.dataset.notes || ''; 

    document.getElementById('modal-anime-title').textContent = animeTitle;
    document.getElementById('notes-textarea').value = notes;
    document.getElementById('notes-modal').style.display = 'block';
}

function hideNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
    currentNoteAnimeId = null;
    document.getElementById('notes-textarea').value = ''; // Clear textarea on close
}

async function saveNotes() {
    if (!currentNoteAnimeId) return;

    const token = localStorage.getItem('token');
    const notes = document.getElementById('notes-textarea').value.trim();

    try {
        const response = await fetch('/api/watched/notes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ animeId: currentNoteAnimeId, notes: notes })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Notes saved successfully!');
            hideNotesModal();
            // Refresh the watched list to update the notes button data-attribute
            fetchWatchedAnime(userId); 
        } else {
            alert('Failed to save notes: ' + (data.message || 'Server error.'));
        }
    } catch (error) {
        console.error('Save notes error:', error);
        alert('An error occurred while saving notes.');
    }
}

// =================================================================================
// 6. FRIENDS & STATS
// =================================================================================

async function fetchUserStats() {
    const token = localStorage.getItem('token');
    const statsContainer = document.getElementById('stats-content');
    statsContainer.innerHTML = '<p class="stats-message">Loading statistics...</p>';

    try {
        const response = await fetch('/api/stats', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const stats = await response.json();
            renderUserStats(stats);
        } else {
            statsContainer.innerHTML = '<p class="stats-message">Could not load stats.</p>';
        }
    } catch (error) {
        console.error('Fetch stats error:', error);
        statsContainer.innerHTML = '<p class="stats-message">An error occurred.</p>';
    }
}

function renderUserStats(stats) {
    const container = document.getElementById('stats-content');
    container.innerHTML = `
        <p><strong>Total Anime Watched:</strong> ${stats.totalAnime}</p>
        <p><strong>Total Unique VAs:</strong> ${stats.totalVAs}</p>
        <p><strong>Average Score:</strong> ${stats.averageScore.toFixed(1)}%</p>
        
        <h4>Top 3 Voice Actors:</h4>
        <ul style="list-style: none; padding: 0;">
            ${stats.topVAs.map(va => 
                `<li style="margin-bottom: 5px;">${va.name} (${va.count} anime)</li>`
            ).join('')}
        </ul>

        <h4>Last 3 Added:</h4>
        <ul style="list-style: none; padding: 0;">
            ${stats.lastAdded.map(anime => 
                `<li style="margin-bottom: 5px; color: var(--color-accent-primary); font-style: italic;">${anime.title}</li>`
            ).join('')}
        </ul>
    `;
}

// Friend Request Functions

async function sendFriendRequest() {
    const friendUsername = document.getElementById('add-friend-username').value.trim();
    const messageEl = document.getElementById('add-friend-message');
    const token = localStorage.getItem('token');

    messageEl.textContent = ''; // Clear previous message
    
    if (!friendUsername) {
        messageEl.textContent = 'Please enter a username.';
        return;
    }
    
    if (friendUsername === username) {
        messageEl.textContent = 'You cannot send a request to yourself.';
        return;
    }

    try {
        const response = await fetch('/api/friends/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ friendUsername })
        });
        
        const data = await response.json();

        if (response.ok) {
            messageEl.textContent = `Request sent to ${friendUsername}!`;
            document.getElementById('add-friend-username').value = '';
        } else {
            messageEl.textContent = 'Failed: ' + (data.message || 'Server error.');
        }
    } catch (error) {
        console.error('Send request error:', error);
        messageEl.textContent = 'An error occurred while sending the request.';
    }
}

async function fetchFriendRequests() {
    const token = localStorage.getItem('token');
    const listContainer = document.getElementById('pending-requests-list');
    listContainer.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Loading...</li>';

    try {
        const response = await fetch('/api/friends/pending', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            friendRequests = await response.json();
            renderFriendRequests(friendRequests);
            
            // Show notification if there are pending requests
            document.querySelector('.notification-icon').style.display = friendRequests.length > 0 ? 'inline' : 'none';
        } else {
            friendRequests = [];
            renderFriendRequests([]);
        }
    } catch (error) {
        console.error('Fetch requests error:', error);
        renderFriendRequests([]);
    }
}

function renderFriendRequests(requests) {
    const listContainer = document.getElementById('pending-requests-list');
    listContainer.innerHTML = '';
    
    if (!requests || requests.length === 0) {
        listContainer.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">No pending friend requests.</li>';
        return;
    }

    requests.forEach(req => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${req.username}</span>
            <div class="friend-actions">
                <button class="status-btn status-accept" data-request-id="${req.request_id}" data-action="accept">Accept</button>
                <button class="status-btn status-reject" data-request-id="${req.request_id}" data-action="reject">Reject</button>
            </div>
        `;
        listContainer.appendChild(li);
        
        li.querySelector('.status-accept').addEventListener('click', handleRequestAction);
        li.querySelector('.status-reject').addEventListener('click', handleRequestAction);
    });
}

async function handleRequestAction(event) {
    const button = event.target;
    const requestId = button.dataset.requestId;
    const action = button.dataset.action;
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`/api/friends/response`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ requestId, action })
        });

        if (response.ok) {
            // Refresh both lists
            fetchFriendRequests();
            fetchFriendsList();
        } else {
            alert('Failed to process request.');
        }
    } catch (error) {
        console.error('Request action error:', error);
        alert('An error occurred.');
    }
}

async function fetchFriendsList() {
    const token = localStorage.getItem('token');
    const listContainer = document.getElementById('confirmed-friends-list');
    listContainer.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">Loading...</li>';

    try {
        const response = await fetch('/api/friends/list', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            friendsList = await response.json();
            renderFriendsList(friendsList);
        } else {
            friendsList = [];
            renderFriendsList([]);
        }
    } catch (error) {
        console.error('Fetch friends list error:', error);
        renderFriendsList([]);
    }
}

function renderFriendsList(list) {
    const listContainer = document.getElementById('confirmed-friends-list');
    listContainer.innerHTML = '';

    if (!list || list.length === 0) {
        listContainer.innerHTML = '<li style="grid-column: 1; text-align: center; border: none; background: none; color: #a0a0a0;">You have no confirmed friends.</li>';
        return;
    }

    list.forEach(friend => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${friend.username}</span>
            <div class="friend-actions">
                <button class="status-btn status-accept" data-friend-id="${friend.friend_id}" data-friend-username="${friend.username}">View List</button>
            </div>
        `;
        listContainer.appendChild(li);
        
        li.querySelector('.status-accept').addEventListener('click', (e) => {
            const friendId = e.target.dataset.friendId;
            const friendUsername = e.target.dataset.friendUsername;
            viewFriendWatchedList(friendId, friendUsername);
        });
    });
}

function viewFriendWatchedList(friendId, friendUsername) {
    // 1. Switch to the 'watched' section
    showSubView('page-watched');
    // 2. Update the list title
    document.getElementById('watched-list-title').textContent = friendUsername + "'s Watched List";
    // 3. Load the friend's list (this will update currentViewedList and currentViewedUserId)
    fetchWatchedAnime(friendId);
    // 4. Add a "Back to My List" button
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
        // Navigating back to the watched page triggers the original functionality
        document.getElementById('nav-watched-btn').click();
    });
}
