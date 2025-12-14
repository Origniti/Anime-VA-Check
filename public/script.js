// --- ANILIST API CONFIG ---
const ANILIST_API_URL = 'https://graphql.anilist.co';

// --- AUTH STATE & USER DATA ---
let isLoggedIn = false;
let userList = {
    watched: [],
    watchlist: []
};
let currentView = 'watched'; // 'watched', 'watchlist', or 'search'
let currentPage = 1;
const ITEMS_PER_PAGE = 9;

// --- DOM Elements ---
// Ensure all these IDs are present in your index.html
const appDiv = document.getElementById('app'); // The outermost wrapper
const authDiv = document.getElementById('auth'); // The authentication block
const mainDiv = document.getElementById('main'); // The logged-in content block // ADDED
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn'); 
const registerBtn = document.getElementById('register-btn');
const switchAuthBtn = document.getElementById('switch-auth');
const authForm = document.getElementById('auth-form');

const authTitle = document.getElementById('auth-title');

const authUsernameInput = document.getElementById('username');
const authPasswordInput = document.getElementById('password');
const animeSearchInput = document.getElementById('anime-search');
const searchResultsList = document.getElementById('search-results');
const watchedListContainer = document.getElementById('watched-list');
const watchlistContainer = document.getElementById('watchlist');
const profileContentDiv = document.getElementById('profile-content');
const paginationControls = document.getElementById('pagination-controls');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfoSpan = document.getElementById('page-info');

// View Toggle Buttons (must be linked)
const viewToggleButtons = {
    watched: document.getElementById('view-watched'),
    watchlist: document.getElementById('view-watchlist'),
    profile: document.getElementById('view-profile')
};

// Modal Elements
const detailModal = document.getElementById('detail-modal');
const saveDetailBtn = document.getElementById('save-detail-btn');
const detailCloseBtn = document.getElementById('detail-close-btn');
const notesTextarea = document.getElementById('notes-textarea');
const detailAnimeTitle = document.getElementById('detail-anime-title');
const detailRatingInput = document.getElementById('detail-rating');
const detailDateInput = document.getElementById('detail-date');
const detailStatusSelect = document.getElementById('detail-status');

let currentAnimeId = null; // Stores the ID of the anime being edited

// --- UTILITIES ---

/**
 * Shows a temporary notification popup.
 * @param {string} message 
 * @param {string} type 
 */
function showNotification(message, type = 'success') {
    let popup = document.querySelector('.notification-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.className = 'notification-popup';
        document.body.appendChild(popup);
    }

    popup.textContent = message;
    popup.style.backgroundColor = type === 'error' ? '#D32F2F' : '#4CAF50';
    popup.style.display = 'block';

    setTimeout(() => {
        popup.style.opacity = '0';
        setTimeout(() => {
            popup.style.display = 'none';
            popup.style.opacity = '1';
        }, 500);
    }, 3000);
}


// --- API FUNCTIONS ---

/**
 * Queries Anilist for anime based on a search string.
 * @param {string} query 
 * @param {string} language 
 * @returns {Promise<Array>}
 */
async function searchAnime(query, language) {
    if (!query) return [];

    const graphqlQuery = `
        query ($search: String, $language: String) {
            Page(page: 1, perPage: 10) {
                media(search: $search, type: ANIME, format_in: [TV, TV_SHORT, MOVIE, ONA, OVA], sort: POPULARITY_DESC) {
                    id
                    title {
                        romaji
                        english
                    }
                    coverImage {
                        large
                    }
                    meanScore
                    description(asHtml: true)
                    genres
                    episodes
                    startDate { year month day }
                    endDate { year month day }
                    characters(role: MAIN, page: 1, perPage: 5) {
                        nodes {
                            name {
                                full
                            }
                            image {
                                medium
                            }
                            media(perPage: 1) {
                                edges {
                                    node {
                                        title {
                                            english
                                        }
                                    }
                                    voiceActors(language: $language, sort: RELEVANCE) {
                                        id
                                        name {
                                            full
                                        }
                                        language
                                        image {
                                            medium
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    `;

    try {
        const response = await fetch(ANILIST_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query: graphqlQuery,
                variables: {
                    search: query,
                    language: language
                }
            })
        });

        const data = await response.json();
        return data.data.Page.media;

    } catch (error) {
        console.error('Anilist Search Error:', error);
        showNotification('Failed to search Anilist.', 'error');
        return [];
    }
}


// --- USER DATA & LIST MANAGEMENT ---

/**
 * Loads user data from local storage.
 * @returns {object|null}
 */
function loadUserData() {
    const userData = localStorage.getItem('animeTrackerUser');
    if (userData) {
        try {
            return JSON.parse(userData);
        } catch (e) {
            console.error("Could not parse user data from localStorage", e);
            return null;
        }
    }
    return null;
}

/**
 * Saves the current user list and state to local storage.
 */
function saveUserData() {
    const userData = loadUserData();
    if (userData) {
        userData.list = userList;
        // Get the current username stored in the session
        const username = userData.username; 
        if (username) {
            localStorage.setItem(username, JSON.stringify(userData));
        }
        localStorage.setItem('animeTrackerUser', JSON.stringify(userData));
    }
}

/**
 * Initializes the app state based on local storage.
 */
function initializeApp() {
    const userData = loadUserData();
    if (userData) {
        isLoggedIn = true;
        userList = userData.list || { watched: [], watchlist: [] };
        
        // Ensure list items have necessary detail fields
        ['watched', 'watchlist'].forEach(listKey => {
            userList[listKey] = userList[listKey].map(item => ({
                ...item,
                userRating: item.userRating || 0,
                watchDate: item.watchDate || '',
                userStatus: item.userStatus || 'Completed',
                notes: item.notes || ''
            }));
        });
        
        showApp();
        renderList();
    } else {
        showAuth();
    }
}

/**
 * Adds an anime result to the user's list.
 * @param {object} anime The anime object from Anilist.
 */
function addAnimeToList(anime) {
    // Check if anime is already in either list
    const exists = userList.watched.some(a => a.id === anime.id) ||
                   userList.watchlist.some(a => a.id === anime.id);

    if (exists) {
        showNotification(`${anime.title.english || anime.title.romaji} is already in a list.`, 'error');
        return;
    }

    const listStatus = document.getElementById('add-to-list-status').value;

    const newAnime = {
        id: anime.id,
        title: anime.title,
        coverImage: anime.coverImage,
        meanScore: anime.meanScore,
        description: anime.description,
        episodes: anime.episodes,
        startDate: anime.startDate,
        endDate: anime.endDate,
        characters: anime.characters,
        
        // Add default user-specific data
        userRating: 0,
        watchDate: '',
        userStatus: listStatus === 'watched' ? 'Completed' : 'Planning', // Default status based on list
        notes: ''
    };

    if (listStatus === 'watched') {
        userList.watched.unshift(newAnime);
        currentView = 'watched';
    } else {
        userList.watchlist.unshift(newAnime);
        currentView = 'watchlist';
    }
    
    saveUserData();
    renderList();
    showNotification(`${newAnime.title.english || newAnime.title.romaji} added to your ${listStatus}.`);
    // Clear search results after adding
    if (searchResultsList) searchResultsList.innerHTML = '';
}

/**
 * Removes an anime from the list.
 * @param {number} animeId 
 */
function removeAnime(animeId) {
    const targetList = userList[currentView];
    const initialLength = targetList.length;
    userList[currentView] = targetList.filter(a => a.id !== animeId);

    if (userList[currentView].length < initialLength) {
        saveUserData();
        showNotification('Anime removed from list.');
        
        // Recalculate pagination after removal
        currentPage = Math.min(currentPage, Math.ceil(userList[currentView].length / ITEMS_PER_PAGE) || 1);
        renderList();
    }
}

/**
 * Saves the user details (rating, date, notes) for an anime.
 * @param {number} animeId 
 */
function saveAnimeDetails() {
    if (currentAnimeId === null) return;

    const list = userList.watched.concat(userList.watchlist);
    const anime = list.find(a => a.id === currentAnimeId);

    if (anime) {
        const initialStatus = anime.userStatus;
        
        anime.userRating = parseInt(detailRatingInput.value, 10) || 0;
        anime.watchDate = detailDateInput.value;
        anime.userStatus = detailStatusSelect.value;
        anime.notes = notesTextarea.value;
        
        // Logic to move the item if the userStatus dictates a change
        const isCurrentlyWatched = initialStatus === 'Completed' || ['Watching', 'Dropped'].includes(initialStatus);

        if (anime.userStatus === 'Completed' || ['Watching', 'Dropped'].includes(anime.userStatus)) {
            // Move from Watchlist to Watched List if status is now a "watched" status
            if (!isCurrentlyWatched) {
                userList.watchlist = userList.watchlist.filter(a => a.id !== currentAnimeId);
                userList.watched.unshift(anime);
            }
        } else if (anime.userStatus === 'Planning') {
            // Move from Watched List to Watchlist if status is now 'Planning'
            if (isCurrentlyWatched) {
                userList.watched = userList.watched.filter(a => a.id !== currentAnimeId);
                userList.watchlist.unshift(anime);
            }
        }
        
        saveUserData();
        if (detailModal) detailModal.style.display = 'none';
        
        // Update the view based on the change
        if (isCurrentlyWatched && anime.userStatus === 'Planning') {
            currentView = 'watchlist';
        } else if (!isCurrentlyWatched && (anime.userStatus === 'Completed' || ['Watching', 'Dropped'].includes(anime.userStatus))) {
            currentView = 'watched';
        }

        renderList();
        showNotification(`Details for ${anime.title.english || anime.title.romaji} saved.`);
    }
}


// --- RENDERING & UI ---

/**
 * Hides authentication and shows the main app content.
 */
function showApp() {
    if (authDiv) authDiv.style.display = 'none';
    if (mainDiv) mainDiv.style.display = 'block'; // CRITICAL CHANGE: Use mainDiv
    
    // Ensure Watched is the default active view
    document.querySelectorAll('.navbar button').forEach(btn => btn.classList.remove('active'));
    if (viewToggleButtons[currentView]) viewToggleButtons[currentView].classList.add('active');
    
    renderList();
}

/**
 * Hides app content and shows the authentication form.
 */
function showAuth() {
    if (mainDiv) mainDiv.style.display = 'none'; // CRITICAL CHANGE: Use mainDiv
    if (authDiv) authDiv.style.display = 'block';
    
    // Check if authTitle exists before setting its textContent
    if (authTitle) {
        authTitle.textContent = 'Login';
    }
    
    if (loginBtn) loginBtn.style.display = 'block';
    if (registerBtn) registerBtn.style.display = 'none';
    if (switchAuthBtn) switchAuthBtn.textContent = 'Need an account? Register';
    
    if (authForm) authForm.reset();
}

/**
 * Updates the visibility and active state of the main list containers.
 */
function updateViewDisplay() {
    // Hide all view pages
    const pages = ['page-watched', 'page-watchlist', 'page-search', 'page-profile'];
    pages.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    if (paginationControls) paginationControls.style.display = 'none';
    
    document.querySelectorAll('.navbar button').forEach(btn => btn.classList.remove('active'));
    
    // Show the current view page
    const currentPageElement = document.getElementById(`page-${currentView}`);
    if (currentPageElement) {
        currentPageElement.style.display = 'block';
    }

    if (currentView === 'watched' || currentView === 'watchlist') {
        if (paginationControls) paginationControls.style.display = 'flex';
    }
    
    // Set active button
    if (viewToggleButtons[currentView]) {
        viewToggleButtons[currentView].classList.add('active');
    }

    if (currentView === 'profile') {
        renderProfileStats();
    }
}


/**
 * Renders the user's list (watched or watchlist) with pagination.
 */
function renderList() {
    updateViewDisplay();

    if (currentView === 'profile' || currentView === 'search') return;

    const list = userList[currentView];
    const container = currentView === 'watched' ? watchedListContainer : watchlistContainer;
    if (!container) return; // Prevent errors if container is null
    
    container.innerHTML = '';
    
    const totalItems = list.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    
    // Boundary check for current page
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const paginatedList = list.slice(start, end);

    if (totalItems === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--color-text-subtle); margin-top: 50px;">Your ${currentView} is empty. Use the search bar to add anime!</p>`;
    } else {
        paginatedList.forEach(anime => {
            container.appendChild(createAnimeCard(anime));
        });
    }

    renderPagination(totalItems, totalPages);
}

/**
 * Renders the pagination controls.
 * @param {number} totalItems 
 * @param {number} totalPages 
 */
function renderPagination(totalItems, totalPages) {
    if (totalItems <= ITEMS_PER_PAGE || !paginationControls) {
        if (paginationControls) paginationControls.style.display = 'none';
        return;
    }
    
    paginationControls.style.display = 'flex';
    if (pageInfoSpan) pageInfoSpan.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;
}


/**
 * Creates the HTML element for an anime card.
 * @param {object} anime 
 * @returns {HTMLElement}
 */
function createAnimeCard(anime) {
    const li = document.createElement('li');
    li.dataset.id = anime.id;

    const title = anime.title.english || anime.title.romaji;
    const episodes = anime.episodes ? `${anime.episodes} Episodes` : 'Unknown Episodes';
    const rating = anime.meanScore ? `Anilist: ${anime.meanScore}%` : 'Anilist: N/A';
    
    // User data
    const userRatingText = anime.userRating > 0 ? `Rating: ${anime.userRating}/10` : '';
    const watchDateText = anime.watchDate ? `Date: ${anime.watchDate}` : '';
    const userStatusText = `Status: ${anime.userStatus}`;

    // Voice Actor rendering logic (simplified for card display)
    const vaTagsHtml = anime.characters && anime.characters.nodes ? anime.characters.nodes.map(node => {
        const va = node.media.edges[0]?.voiceActors[0];
        if (va) {
            // Check if VA is shared with other items in the watched list
            const isHighlighted = userList.watched.some(watchedAnime => 
                watchedAnime.id !== anime.id && 
                watchedAnime.characters && 
                watchedAnime.characters.nodes.some(wNode => 
                    wNode.media.edges[0]?.voiceActors[0]?.id === va.id
                )
            );
            const vaName = va.name.full;
            const className = isHighlighted ? 'highlight' : '';
            return `<span class="va" title="${vaName} (${va.language})"><span class="${className}">${vaName.split(' ')[0]}</span></span>`;
        }
        return '';
    }).join('') : '';


    // --- Description Toggle Setup ---
    const descriptionHtml = anime.description || 'No description available.';
    
    // Card structure
    li.innerHTML = `
        <div class="anime-cover-container">
            <img class="anime-cover" src="${anime.coverImage.large}" alt="${title} cover" onerror="this.onerror=null;this.src='https://via.placeholder.com/67x100?text=No+Image';">
        </div>
        <div class="anime-info">
            <div style="flex-shrink: 0; width: 100%;">
                <b>${title}</b>
                <p>${rating} | ${episodes}</p>
                <div class="date-info-container">
                    ${userStatusText}
                    ${userRatingText ? ` | ${userRatingText}` : ''}
                    ${watchDateText ? ` | <b>${watchDateText}</b>` : ''}
                </div>
            </div>

            <div class="description-wrapper">
                <p class="anime-description-text">${descriptionHtml}</p>
                <button class="read-more-btn" data-id="${anime.id}">Read More</button>
            </div>
            
            <div class="va-tags-container">${vaTagsHtml}</div>

            <div class="action-buttons">
                <button class="notes-btn" data-id="${anime.id}">Details</button>
                <button class="remove-btn" data-id="${anime.id}">Remove</button>
            </div>
        </div>
    `;
    
    // Add event listener for the Read More button
    const readMoreBtn = li.querySelector('.read-more-btn');
    const descriptionWrapper = li.querySelector('.description-wrapper');
    const descriptionText = li.querySelector('.anime-description-text');
    
    if (descriptionText && readMoreBtn && descriptionWrapper) {
        // Check if description is too short to warrant a 'Read More' button
        // Note: ClientHeight/ScrollHeight check can be tricky, relying on a simple check here.
        if (descriptionText.scrollHeight <= descriptionText.clientHeight + 5) { 
             readMoreBtn.style.display = 'none';
        } else {
            readMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = descriptionWrapper.classList.toggle('expanded');
                readMoreBtn.textContent = isExpanded ? 'Read Less' : 'Read More';
            });
        }
    }

    return li;
}

/**
 * Renders the profile statistics.
 */
function renderProfileStats() {
    if (!profileContentDiv) return;

    const totalWatched = userList.watched.length;
    const totalWatchlist = userList.watchlist.length;
    
    // Calculate total episodes watched
    const totalEpisodes = userList.watched.reduce((sum, anime) => sum + (anime.episodes || 0), 0);
    const userData = loadUserData();

    // REMOVED: Average Score calculation and display line
    
    profileContentDiv.innerHTML = `
        <div class="section-title">My Profile</div>
        <p>User: <strong>${userData ? userData.username : 'N/A'}</strong></p>
        <p>Total Anime Watched: <strong>${totalWatched}</strong></p>
        <p>Anime in Watchlist: <strong>${totalWatchlist}</strong></p>
        <p>Total Episodes Watched: <strong>${totalEpisodes}</strong></p>
        <button id="logout-btn-profile">Logout</button>
        <p style="color: #c62828; margin-top: 20px;">Warning: There is no 'Delete Account' functionality, but your data is stored securely locally.</p>
    `;

    // Attach logout listener to the profile button
    const profileLogoutBtn = document.getElementById('logout-btn-profile');
    if (profileLogoutBtn) {
        profileLogoutBtn.addEventListener('click', logout);
    }
}


// --- EVENT HANDLERS ---

/**
 * Toggles between Login and Register views.
 */
function toggleAuthMode(e) {
    e.preventDefault();
    
    if (!authTitle || !loginBtn || !registerBtn || !switchAuthBtn || !authForm) return;

    const isLogin = authTitle.textContent === 'Login';
    authTitle.textContent = isLogin ? 'Register' : 'Login';
    loginBtn.style.display = isLogin ? 'none' : 'block';
    registerBtn.style.display = isLogin ? 'block' : 'none';
    switchAuthBtn.textContent = isLogin ? 'Already have an account? Login' : 'Need an account? Register';
    authForm.reset();
}

/**
 * Handles the login or registration attempt.
 */
function handleAuth(e) {
    e.preventDefault();
    if (!authUsernameInput || !authPasswordInput || !registerBtn) return;

    const username = authUsernameInput.value.trim();
    const password = authPasswordInput.value.trim();
    const isRegister = registerBtn.style.display === 'block';

    if (!username || !password) {
        showNotification('Please enter both username and password.', 'error');
        return;
    }
    
    if (isRegister) {
        // Register logic
        if (localStorage.getItem(username)) {
            showNotification('Username already exists.', 'error');
            return;
        }
        
        const userData = {
            username: username,
            password: password,
            list: { watched: [], watchlist: [] }
        };
        localStorage.setItem(username, JSON.stringify(userData));
        localStorage.setItem('animeTrackerUser', JSON.stringify(userData));
        initializeApp();
        showNotification('Registration successful! Logged in.');

    } else {
        // Login logic
        const storedData = localStorage.getItem(username);
        if (storedData) {
            const userData = JSON.parse(storedData);
            if (userData.password === password) {
                localStorage.setItem('animeTrackerUser', storedData);
                initializeApp();
                showNotification('Login successful!');
            } else {
                showNotification('Incorrect password.', 'error');
            }
        } else {
            showNotification('User not found. Please register.', 'error');
        }
    }
}

/**
 * Handles the user search input.
 */
let searchTimeout;
function handleSearchInput() {
    clearTimeout(searchTimeout);
    if (!animeSearchInput || !searchResultsList) return;
    
    // Clear search results and reset view when input is empty
    if (!animeSearchInput.value.trim()) {
        searchResultsList.innerHTML = '';
        if (currentView === 'search') {
             currentView = 'watched'; // Default back to watched list
             renderList();
        }
        return;
    }
    
    searchTimeout = setTimeout(async () => {
        const query = animeSearchInput.value.trim();
        const lang = document.getElementById('search-lang').value;
        const results = await searchAnime(query, lang);
        
        currentView = 'search';
        updateViewDisplay();
        renderSearchResults(results);
    }, 500);
}

/**
 * Renders the search results from Anilist.
 * @param {Array} results 
 */
function renderSearchResults(results) {
    if (!searchResultsList) return;
    searchResultsList.innerHTML = '';
    
    if (results.length === 0) {
        searchResultsList.innerHTML = `<li style="text-align: center; color: var(--color-text-subtle);">No results found.</li>`;
        return;
    }

    const allAnimeIds = new Set([...userList.watched.map(a => a.id), ...userList.watchlist.map(a => a.id)]);

    results.forEach(anime => {
        const li = document.createElement('li');
        const title = anime.title.english || anime.title.romaji;
        li.textContent = title;
        li.dataset.id = anime.id;
        li.dataset.title = title;
        
        const isAdded = allAnimeIds.has(anime.id);
        
        if (isAdded) {
            li.classList.add('highlight');
            li.title = 'Already in your list';
        } else {
            li.addEventListener('click', () => {
                addAnimeToList(anime);
                if (animeSearchInput) animeSearchInput.value = ''; // Clear search input
                searchResultsList.innerHTML = ''; // Clear results
            });
        }
        searchResultsList.appendChild(li);
    });
}

/**
 * Logs out the user.
 */
function logout() {
    // Clear the session indicator (current user)
    localStorage.removeItem('animeTrackerUser');
    isLoggedIn = false;
    userList = { watched: [], watchlist: [] };
    currentView = 'watched';
    
    showNotification('Logged out successfully.', 'success');
    // FORCE PAGE REFRESH TO CLEAR ALL SCRIPT STATE
    location.reload(); 
}


// --- INITIALIZATION & LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    // Check if the critical authentication elements are present before proceeding
    if (!authTitle || !loginBtn || !registerBtn || !switchAuthBtn || !mainDiv) {
        console.error("CRITICAL ERROR: One or more critical elements are missing from index.html. Initialization may fail.");
    }
    
    initializeApp();

    // Authentication Listeners
    if (switchAuthBtn) switchAuthBtn.addEventListener('click', toggleAuthMode);
    if (authForm) authForm.addEventListener('submit', handleAuth);
    
    // Main App Navigation Listeners
    if (viewToggleButtons.watched) viewToggleButtons.watched.addEventListener('click', () => {
        currentView = 'watched';
        currentPage = 1;
        renderList();
    });
    if (viewToggleButtons.watchlist) viewToggleButtons.watchlist.addEventListener('click', () => {
        currentView = 'watchlist';
        currentPage = 1;
        renderList();
    });
    if (viewToggleButtons.profile) viewToggleButtons.profile.addEventListener('click', () => {
        currentView = 'profile';
        updateViewDisplay();
    });
    
    // Search Listener
    if (animeSearchInput) animeSearchInput.addEventListener('input', handleSearchInput);
    
    // List Action Listeners (Delegation)
    [watchedListContainer, watchlistContainer].forEach(container => {
        if (container) {
            container.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (button) {
                    const animeId = parseInt(button.dataset.id, 10);
                    if (button.classList.contains('remove-btn')) {
                        if (confirm('Are you sure you want to remove this anime from your list?')) {
                            removeAnime(animeId);
                        }
                    } else if (button.classList.contains('notes-btn')) {
                        openDetailModal(animeId);
                    }
                }
            });
        }
    });

    // Pagination Listeners
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderList();
        }
    });

    if (nextPageBtn) nextPageBtn.addEventListener('click', () => {
        const list = userList[currentView];
        const totalPages = Math.ceil(list.length / ITEMS_PER_PAGE);
        if (currentPage < totalPages) {
            currentPage++;
            renderList();
        }
    });

    // Modal Listeners
    if (detailCloseBtn) detailCloseBtn.addEventListener('click', () => {
        if (detailModal) detailModal.style.display = 'none';
    });
    if (saveDetailBtn) saveDetailBtn.addEventListener('click', saveAnimeDetails);
    
    // Close modal on outside click
    if (detailModal) {
        window.addEventListener('click', (event) => {
            // Check if the click target is the modal itself (the background)
            if (event.target === detailModal) {
                detailModal.style.display = 'none';
            }
        });
    }
});

/**
 * Opens the detail modal with data pre-filled.
 * @param {number} animeId 
 */
function openDetailModal(animeId) {
    if (!detailModal) return;

    const list = userList.watched.concat(userList.watchlist);
    const anime = list.find(a => a.id === animeId);
    
    if (anime) {
        currentAnimeId = animeId;
        if (detailAnimeTitle) detailAnimeTitle.textContent = anime.title.english || anime.title.romaji;
        
        if (detailRatingInput) detailRatingInput.value = anime.userRating || 0;
        if (detailDateInput) detailDateInput.value = anime.watchDate || '';
        if (detailStatusSelect) detailStatusSelect.value = anime.userStatus || 'Completed';
        if (notesTextarea) notesTextarea.value = anime.notes || '';

        detailModal.style.display = 'block';
    }
}
