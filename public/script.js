let userId = localStorage.getItem('animeTrackerUserId'); 
let userName = localStorage.getItem('animeTrackerUsername'); 
const watched = []; 
let currentController = null; 

// Global Variables for Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;

let currentAnimeIdForDetails = null; // Used by the modal to track which anime is being edited

// -------------------
// Initialization & Utility
// -------------------
window.onload = function() {
    init();
    // Re-expose global functions needed by HTML attributes
    window.register = register;
    window.login = login;
    window.logout = logout;
    window.showPage = showPage;
    window.changePage = changePage;
    window.toggleReadMore = toggleReadMore;
    window.openDetailModal = openDetailModal;
    window.closeDetailModal = closeDetailModal;
    window.saveAnimeDetails = saveAnimeDetails;
    window.removeAnime = removeAnime;
    window.addAnime = addAnime;
};

function init() {
    if (userId && userName) {
        document.getElementById('profile-username').textContent = userName;
        document.getElementById('auth').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        loadWatched().then(() => showPage('watched'));
    } else {
        document.getElementById('auth').style.display = 'block';
        document.getElementById('main').style.display = 'none';
    }
    
    // Setup event listeners for filtering/sorting
    document.getElementById('sort-by').addEventListener('change', () => {
        currentPage = 1;
        renderWatchedList();
    });
    document.getElementById('va-lang').addEventListener('change', () => {
        currentPage = 1;
        renderWatchedList();
    });
    document.getElementById('anime-search').addEventListener('input', debounce(searchAnime, 300));
}

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

function showNotification(message, isError = false) {
    const popup = document.getElementById('notification-pop-up');
    popup.textContent = message;
    popup.style.backgroundColor = isError ? '#c62828' : '#4CAF50';
    popup.style.display = 'block';

    setTimeout(() => {
        popup.style.display = 'none';
    }, 3000);
}

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    document.querySelectorAll('.navbar button').forEach(button => {
        button.classList.remove('active');
    });

    document.getElementById(`page-${pageId}`).style.display = 'block';
    document.getElementById(`nav-${pageId}`).classList.add('active');

    // Reset pagination and re-render only for list views
    if (pageId === 'watched' || pageId === 'watchlist') {
        currentPage = 1;
        renderWatchedList();
    }
}

// -------------------
// Authentication
// -------------------
async function register() {
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    try {
        const res = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            showNotification("Registration successful! Please log in.");
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-password').value = '';
        } else {
            showNotification(`Registration failed: ${data.error}`, true);
        }
    } catch (err) {
        showNotification("Registration failed due to server error.", true);
        console.error("Register failed:", err);
    }
}

async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
        const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            userId = data.userId;
            userName = username;
            localStorage.setItem('animeTrackerUserId', userId);
            localStorage.setItem('animeTrackerUsername', userName);
            init(); // Re-initialize to show main app
        } else {
            showNotification(`Login failed: ${data.error}`, true);
        }
    } catch (err) {
        showNotification("Login failed due to server error.", true);
        console.error("Login failed:", err);
    }
}

function logout() {
    localStorage.removeItem('animeTrackerUserId');
    localStorage.removeItem('animeTrackerUsername');
    userId = null;
    userName = null;
    watched.length = 0; // Clear the list
    showPage('auth'); // Switch to the auth view
    document.getElementById('auth').style.display = 'block';
    document.getElementById('main').style.display = 'none';
    showNotification("Logged out successfully.");
}

// -------------------
// Pagination
// -------------------
function changePage(delta) {
    const newPage = currentPage + delta;
    
    const isWatchlistPage = document.getElementById('page-watchlist').style.display !== 'none';
    const filterStatus = isWatchlistPage ? 'Watchlist' : 'Watched';

    // Filter the full list based on the active page's status
    const listData = watched.filter(a => a.status === filterStatus);

    totalPages = Math.ceil(listData.length / ITEMS_PER_PAGE);

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderWatchedList();
    }
}

// -------------------
// Search
// -------------------
function searchAnime() {
    const search = document.getElementById('anime-search').value;
    const lang = document.getElementById('search-lang').value;
    
    if (search.length < 3) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    
    // Abort previous requests
    if (currentController) {
        currentController.abort();
    }
    currentController = new AbortController();
    
    actualSearchAnime(search, lang, currentController.signal);
}

async function actualSearchAnime(search, lang, signal) {
    try {
        const res = await fetch(`/search-anime?q=${encodeURIComponent(search)}&lang=${lang}`, { signal });
        const results = await res.json();
        
        const resultsList = document.getElementById('search-results');
        resultsList.innerHTML = '';
        
        if (results && results.length) {
            results.forEach(anime => {
                const title = lang === 'english' && anime.title.english ? anime.title.english : anime.title.romaji;
                
                // Check if anime is already in the user's list
                const isAdded = watched.some(a => a.anime_id === anime.id);

                const li = document.createElement('li');
                li.textContent = `${title} (${anime.averageScore ? anime.averageScore/10 : 'N/A'})`;
                
                if (isAdded) {
                    li.textContent += ' (Added)';
                    li.classList.add('highlight');
                    li.style.cursor = 'default';
                } else {
                    li.onclick = () => addAnime(anime);
                }
                
                resultsList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'No results found.';
            resultsList.appendChild(li);
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Search aborted.');
        } else {
            console.error("Anime search failed:", err);
            showNotification("Anime search failed.", true);
        }
    } finally {
        currentController = null;
    }
}

// -------------------
// CRUD Operations
// -------------------
async function addAnime(anime){
    if (!userId) {
        alert("You must be logged in to add anime.");
        return;
    }
    
    // Get the selected list status from the new control
    const listStatus = document.getElementById('add-to-list-status').value; 

    const titleLang = document.getElementById('search-lang').value;
    const animeTitle = titleLang === 'english' && anime.title.english ? anime.title.english : anime.title.romaji;
    const rating = (anime.averageScore || 0) / 10;
    
    let description = anime.description || '';
    const characters = anime.characters.edges;
    // NOTE: coverImage might be lowercase 'coverimage' from DB, but Anilist sends it PascalCase
    const coverImage = anime.coverImage?.large || anime.CoverImage?.large || ''; 

    try {
        const res = await fetch('/add-anime',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            // Pass the new status field in the request body
            body:JSON.stringify({userId, animeId:anime.id, animeTitle, rating, description, characters, coverImage, status: listStatus})
        });
        const data = await res.json();
        
        if(data.success) {
            await loadWatched(); // Refresh the local list and re-render the active page
            showNotification(`${animeTitle} added to your ${listStatus} list!`);
            // Re-run search to update "Added" status
            searchAnime(); 
        }
        else showNotification(`Failed to add anime: ${data.error}`, true);
    } catch(err){
        console.error("Add anime failed:", err);
        showNotification("Add anime failed due to server error.", true);
    }
}

async function removeAnime(animeId) {
    if (!confirm("Are you sure you want to remove this anime from your list?")) {
        return;
    }

    try {
        const res = await fetch(`/remove-anime/${userId}/${animeId}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        
        if (data.success) {
            await loadWatched();
            showNotification("Anime removed successfully.");
            // Re-render the current page (Watchlist or Watched)
            renderWatchedList();
        } else {
            showNotification(`Failed to remove anime: ${data.error}`, true);
        }
    } catch (err) {
        console.error("Remove anime failed:", err);
        showNotification("Remove anime failed due to server error.", true);
    }
}

async function loadWatched() {
    if (!userId) return;

    try {
        const res = await fetch(`/watched/${userId}`);
        const data = await res.json();
        
        if (data.success) {
            // Clear and repopulate the global list
            watched.length = 0;
            data.data.forEach(anime => watched.push(anime));
            
            // Render the currently active list page
            const activePage = document.querySelector('.page-content:not([style*="display: none"])');
            if (activePage) {
                 // Ensures the list is re-rendered correctly after loading new data
                renderWatchedList(); 
            }
            // Update profile stats
            updateProfileStats();
        } else {
            showNotification(`Failed to load list: ${data.error}`, true);
        }
    } catch (err) {
        console.error("Load watched list failed:", err);
        showNotification("Failed to load list due to server error.", true);
    }
}


// -------------------
// Detail Modal Logic
// -------------------
function openDetailModal(animeId) {
    currentAnimeIdForDetails = animeId;
    const anime = watched.find(a => a.anime_id === animeId);

    if (!anime) {
        showNotification("Anime details not found.", true);
        return;
    }

    // Populate modal fields
    document.getElementById('modal-anime-title').textContent = anime.anime_title;
    document.getElementById('notes-textarea').value = anime.notes || '';
    
    // Populate new fields
    document.getElementById('modal-status-select').value = anime.status || 'Watched';
    document.getElementById('modal-user-rating').value = anime.user_rating || '';
    
    // Format dates (DB stores 'YYYY-MM-DDTHH:MM:SS.000Z', needs 'YYYY-MM-DD' for input type="date")
    document.getElementById('modal-start-date').value = anime.start_date ? anime.start_date.split('T')[0] : '';
    document.getElementById('modal-finish-date').value = anime.finish_date ? anime.finish_date.split('T')[0] : '';
    
    document.getElementById('anime-detail-modal').style.display = 'block';
}

function closeDetailModal() {
    document.getElementById('anime-detail-modal').style.display = 'none';
    currentAnimeIdForDetails = null;
}

async function saveAnimeDetails() {
    if (!userId || !currentAnimeIdForDetails) return;

    const notes = document.getElementById('notes-textarea').value;
    const userRating = document.getElementById('modal-user-rating').value;
    const startDate = document.getElementById('modal-start-date').value;
    const finishDate = document.getElementById('modal-finish-date').value;
    const status = document.getElementById('modal-status-select').value;
    
    try {
        const res = await fetch('/update-details', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                animeId: currentAnimeIdForDetails,
                notes,
                userRating: userRating || null, // Send null if empty string
                startDate: startDate || null,   // Send null if empty string
                finishDate: finishDate || null, // Send null if empty string
                status: status
            })
        });
        const data = await res.json();

        if (data.success) {
            // Update local list and re-render
            await loadWatched(); 
            closeDetailModal();
            showNotification("Anime details updated successfully!");
        } else {
            showNotification(`Failed to save details: ${data.error}`, true);
        }
    } catch (err) {
        console.error("Save details failed:", err);
        showNotification("Save details failed due to server error.", true);
    }
}


// -------------------
// List Rendering Logic
// -------------------
function toggleReadMore(buttonElement) {
    const wrapper = buttonElement.closest('.description-wrapper');
    const descriptionText = wrapper.querySelector('.anime-description-text');
    
    if (wrapper.classList.contains('expanded')) {
        wrapper.classList.remove('expanded');
        buttonElement.textContent = 'Read More...';
    } else {
        wrapper.classList.add('expanded');
        buttonElement.textContent = 'Read Less';
    }
}

function sortWatchedList(list) {
    const sortBy = document.getElementById('sort-by').value;
    
    return list.sort((a, b) => {
        switch (sortBy) {
            case 'date_added_desc': // Default sort: by DB ID (creation order)
                return b.id - a.id;
            case 'user_rating_desc':
                // Handles nulls: null (N/A) comes last
                if (a.user_rating === null) return 1;
                if (b.user_rating === null) return -1;
                return b.user_rating - a.user_rating;
            case 'user_rating_asc':
                if (a.user_rating === null) return 1;
                if (b.user_rating === null) return -1;
                return a.user_rating - b.user_rating;
            case 'finish_date_desc':
                // Handles nulls: null (N/A) comes last
                if (a.finish_date === null) return 1;
                if (b.finish_date === null) return -1;
                return new Date(b.finish_date) - new Date(a.finish_date);
            case 'title':
                return a.anime_title.localeCompare(b.anime_title);
            default:
                return 0;
        }
    });
}

function renderWatchedList() {
    let listToRender = [...watched]; 
    const isWatchlistPage = document.getElementById('page-watchlist').style.display !== 'none';
    
    // 1. Filtering by Status (CORRECTED LOGIC)
    if (isWatchlistPage) {
        // Only show items explicitly marked as 'Watchlist'
        listToRender = listToRender.filter(a => a.status === 'Watchlist');
    } else {
        // Only show items explicitly marked as 'Watched'
        listToRender = listToRender.filter(a => a.status === 'Watched');
    }
    
    // 2. Sorting
    listToRender = sortWatchedList(listToRender);
    
    // 3. Pagination Range (Recalculate based on the filtered list)
    const targetListElement = document.getElementById(isWatchlistPage ? 'watchlist-items' : 'watched-list');
    targetListElement.innerHTML = '';

    totalPages = Math.ceil(listToRender.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;

    const animeToRender = listToRender.slice(start, end);
    
    // 4. Render Anime Cards
    const vaLang = document.getElementById('va-lang').value;
    
    animeToRender.forEach(anime => {
        const li = document.createElement('li');
        
        // Parse the voice actor JSON string
        let vaData;
        try {
            vaData = JSON.parse(anime.voice_actors);
        } catch (e) {
            vaData = { japanese: '', english: '' };
        }

        const vaList = vaData[vaLang] || '';
        const vaTagsHTML = vaList.split('|').map(entry => {
            if (!entry) return '';
            const parts = entry.split(':');
            const charNames = parts[0].trim();
            const vaName = parts[1] ? parts[1].trim() : 'N/A';
            return `<span class="va" title="${charNames}">${vaName}</span>`;
        }).join('');

        // Display user rating if available
        const userRatingDisplay = anime.user_rating ? `<p>My Rating: <b>${anime.user_rating}/10</b></p>` : '';
        
        // Display Dates if available
        const startDateDisplay = anime.start_date ? `<p class="date-info">Started: ${new Date(anime.start_date).toLocaleDateString()}</p>` : '';
        const finishDateDisplay = anime.finish_date ? `<p class="date-info">Finished: ${new Date(anime.finish_date).toLocaleDateString()}</p>` : '';

        // Determine if Read More button is necessary (if description is long)
        const descriptionText = anime.description || 'No description available.';
        const needsReadMore = descriptionText.length > 200; // Heuristic based on CSS max-height

        li.innerHTML = `
            <div class="anime-cover-container">
                <img src="${anime.coverimage || anime.coverImage || 'placeholder.jpg'}" alt="${anime.anime_title} Cover" class="anime-cover">
            </div>
            <div class="anime-info">
                <b>${anime.anime_title}</b>
                ${userRatingDisplay}
                <p class="anilist-rating">AniList Score: <b>${(anime.rating * 10).toFixed(0)}%</b></p>
                
                <div class="description-wrapper">
                    <p class="anime-description-text">${descriptionText}</p>
                    ${needsReadMore ? `<button class="read-more-btn" onclick="toggleReadMore(this)">Read More...</button>` : ''}
                </div>

                <div class="date-info-container">
                    ${startDateDisplay}
                    ${finishDateDisplay}
                </div>
                
                <div class="va-tags-container">
                    ${vaTagsHTML}
                </div>
                
                <div class="action-buttons">
                    <button class="notes-btn" onclick="openDetailModal(${anime.anime_id})">Details</button>
                    <button class="remove-btn" onclick="removeAnime(${anime.anime_id})">Remove</button>
                </div>
            </div>
        `;
        targetListElement.appendChild(li);
    });
    
    // 5. Update Pagination Controls
    document.getElementById('page-info').textContent = `Page ${totalPages > 0 ? currentPage : 0} of ${totalPages}`;
    document.getElementById('prev-page').disabled = currentPage === 1 || totalPages === 0;
    document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;
}


// -------------------
// Profile Stats Logic
// -------------------
function updateProfileStats() {
    document.getElementById('profile-username').textContent = userName;

    const watchedList = watched.filter(a => a.status === 'Watched');
    document.getElementById('stat-watched-count').textContent = watchedList.length;

    // Calculate Average Rating
    const ratedAnime = watchedList.filter(a => a.user_rating !== null && a.user_rating !== undefined);
    if (ratedAnime.length > 0) {
        const totalRating = ratedAnime.reduce((sum, a) => sum + a.user_rating, 0);
        const avgRating = totalRating / ratedAnime.length;
        document.getElementById('stat-avg-rating').textContent = avgRating.toFixed(2);
    } else {
        document.getElementById('stat-avg-rating').textContent = 'N/A';
    }
    
    // Calculate Top VA (complex logic for demonstration)
    const vaCount = {};
    watchedList.forEach(anime => {
        let vaData;
        try {
            vaData = JSON.parse(anime.voice_actors);
        } catch (e) {
            return;
        }
        
        // Count Japanese VAs for simplicity
        const vaList = vaData.japanese || '';
        vaList.split('|').forEach(entry => {
            const parts = entry.split(':');
            if (parts.length > 1) {
                const vaName = parts[1].trim();
                vaCount[vaName] = (vaCount[vaName] || 0) + 1;
            }
        });
    });

    let topVA = 'N/A';
    let maxCount = 0;
    for (const va in vaCount) {
        if (vaCount[va] > maxCount) {
            maxCount = vaCount[va];
            topVA = `${va} (${maxCount} titles)`;
        }
    }
    document.getElementById('stat-top-va').textContent = topVA;
}
