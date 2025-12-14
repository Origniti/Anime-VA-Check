/* ------------------- */
/* Globals and Initial Setup */
/* ------------------- */
let currentPage = 1;
const itemsPerPage = 6;
let currentAnimeList = [];
let totalPages = 0;
let currentSort = 'title';
let currentLang = 'japanese'; // Default language for VA display

document.addEventListener('DOMContentLoaded', () => {
    // Get all necessary elements for initial state setup
    const userId = localStorage.getItem('userId');
    const mainApp = document.getElementById('main-app'); 
    const authContainer = document.getElementById('auth'); 
    const profileContainer = document.getElementById('profile-container');
    const mainTitle = document.querySelector('.app-main-title');

    // CRITICAL FIX: Ensure all elements exist before trying to access .style
    if (authContainer && mainApp && profileContainer && mainTitle) {
        if (userId) {
            authContainer.style.display = 'none';
            mainApp.style.display = 'block';
            mainTitle.style.display = 'block';
            profileContainer.style.display = 'block';
            loadWatchedAnime(userId, currentPage);
            
            // Set username in profile button
            const username = localStorage.getItem('username');
            if (username) {
                document.getElementById('profile-username').textContent = username;
            }

        } else {
            authContainer.style.display = 'block';
            mainApp.style.display = 'none';
            mainTitle.style.display = 'none';
            profileContainer.style.display = 'none';
        }
    } else {
        console.warn("One or more main HTML containers are missing (auth, main-app, profile-container, or .app-main-title). Check your index.html IDs.");
    }


    // Attach event listeners (using form IDs and button IDs)
    document.getElementById('register-form')?.addEventListener('submit', handleRegister);
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    
    document.getElementById('dropdown-logout-button')?.addEventListener('click', handleLogout);
    
    // Main App Listeners
    document.getElementById('anime-search')?.addEventListener('input', handleSearchInput);
    document.getElementById('va-language-select')?.addEventListener('change', handleLanguageChange);
    document.getElementById('sort-by-select')?.addEventListener('change', handleSortChange);
    document.getElementById('search-results')?.addEventListener('click', handleSearchResultSelection);
    
    // Pagination Listeners
    document.getElementById('prev-page')?.addEventListener('click', () => changePage(currentPage - 1));
    document.getElementById('next-page')?.addEventListener('click', () => changePage(currentPage + 1));
    
    // Modal Listeners (Uses the correct ID: more-info-modal)
    document.querySelector('#more-info-modal .close-button')?.addEventListener('click', closeModal);
    window.addEventListener('click', (event) => {
        if (event.target === document.getElementById('more-info-modal')) {
            closeModal();
        }
    });
    document.getElementById('notes-save-btn')?.addEventListener('click', saveMoreInfo);
    
    // Profile Dropdown
    document.querySelector('.profile-button')?.addEventListener('click', toggleProfileDropdown);

    // Initial check for available VA languages
    updateVAPrompt();
});

/* ------------------- */
/* 2. Authentication */
/* ------------------- */

async function handleRegister(event) {
    event.preventDefault();
    const username = event.target.elements.username.value;
    const password = event.target.elements.password.value;

    const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (data.success) {
        alert('Registration successful! Please log in.');
        event.target.reset();
        document.getElementById('login-username').value = username; // Pre-fill login
    } else {
        alert(`Registration failed: ${data.error}`);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const username = event.target.elements.username.value;
    const password = event.target.elements.password.value;

    const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (data.success) {
        // Line 115 starts here
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('username', username);
        
        // FIX: Using optional chaining (?) for safer DOM manipulation
const auth = document.getElementById('auth');
const mainApp = document.getElementById('main-app');
const mainTitle = document.querySelector('.app-main-title');
const profile = document.getElementById('profile-container');

if (auth) auth.style.display = 'none';
if (mainApp) mainApp.style.display = 'block';
if (mainTitle) mainTitle.style.display = 'block';
if (profile) profile.style.display = 'block';

        
        // Set username in profile button
        const profileUsername = document.getElementById('profile-username');
        if (profileUsername) {
            profileUsername.textContent = username; 
        }
        
        loadWatchedAnime(data.userId, 1);
        
    } else {
        alert(`Login failed: ${data.error}`);
    }
}

function handleLogout() {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');

    // FIX: Using optional chaining (?) for safer DOM manipulation
const auth = document.getElementById('auth');
const mainApp = document.getElementById('main-app');
const mainTitle = document.querySelector('.app-main-title');
const profile = document.getElementById('profile-container');
const dropdown = document.getElementById('profile-dropdown');
const watchedList = document.getElementById('watched-list');

if (auth) auth.style.display = 'block';
if (mainApp) mainApp.style.display = 'none';
if (mainTitle) mainTitle.style.display = 'none';
if (profile) profile.style.display = 'none';
if (dropdown) dropdown.style.display = 'none';
if (watchedList) watchedList.innerHTML = '';

}

function toggleProfileDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) {
        if (dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        } else {
            dropdown.style.display = 'block';
        }
    }
}


/* ------------------- */
/* 3. Anime Search and Add */
/* ------------------- */

let searchTimeout; 

function handleSearchInput(event) {
    clearTimeout(searchTimeout);
    const query = event.target.value.trim();
    const resultsContainer = document.getElementById('search-results');
    
    if (query.length < 3) {
        if (resultsContainer) {
             resultsContainer.innerHTML = '';
        }
        return;
    }

    searchTimeout = setTimeout(() => {
        searchAnime(query);
    }, 300);
}

async function searchAnime(query) {
    const res = await fetch(`/search-anime?q=${encodeURIComponent(query)}`);
    const results = await res.json();
    displaySearchResults(results);
}

function displaySearchResults(results) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    resultsContainer.innerHTML = '';

    if (!results || results.length === 0) {
        resultsContainer.innerHTML = '<li>No results found.</li>';
        return;
    }

    results.forEach(anime => {
        const li = document.createElement('li');
        const title = anime.title.english || anime.title.romaji || 'Untitled';
        
        // Store all necessary data on the element
        li.dataset.animeId = anime.id;
        li.dataset.title = title;
        li.dataset.rating = anime.averageScore;
        li.dataset.description = anime.description || '';
        li.dataset.coverImage = anime.coverImage?.large || '';
        li.dataset.characters = JSON.stringify(anime.characters?.edges || []);
        
        li.innerHTML = `<strong>${title}</strong> (${anime.averageScore || 'N/A'})`;
        resultsContainer.appendChild(li);
    });
}

function handleSearchResultSelection(event) {
    const li = event.target.closest('li');
    if (!li || li.textContent === 'No results found.') return;

    const animeData = {
        animeId: li.dataset.animeId,
        animeTitle: li.dataset.title,
        rating: li.dataset.rating ? parseFloat(li.dataset.rating) : null,
        description: li.dataset.description,
        coverImage: li.dataset.coverImage,
        characters: JSON.parse(li.dataset.characters) 
    };
    
    addAnimeToWatchedList(animeData);

    // Clear search bar and results
    document.getElementById('anime-search').value = '';
    document.getElementById('search-results').innerHTML = '';
}

async function addAnimeToWatchedList(animeData) {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        alert("Please log in to add anime.");
        return;
    }
    
    // Sanitize description before sending
    let description = animeData.description.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').trim();

    const res = await fetch('/add-anime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: parseInt(userId),
            animeId: parseInt(animeData.animeId),
            animeTitle: animeData.animeTitle,
            rating: animeData.rating,
            description: description,
            coverImage: animeData.coverImage,
            characters: animeData.characters 
        })
    });
    const data = await res.json();
    
    if (data.success) {
        alert(`"${animeData.animeTitle}" added to your list!`);
        // Refresh list
        loadWatchedAnime(userId, currentPage); 
    } else {
        alert(`Failed to add anime: ${data.error}`);
    }
}


/* ------------------- */
/* 4. Display Watched List */
/* ------------------- */

async function loadWatchedAnime(userId, page) {
    if (!userId) return;
    
    // Fetch all watched anime
    const res = await fetch(`/watched/${userId}`);
    const data = await res.json();
    
    const listContainer = document.getElementById('watched-list');
    
    if (data.success) {
        currentAnimeList = data.data;
        sortAndPaginate(currentAnimeList, page);
    } else {
        console.error("Failed to load watched anime:", data.error);
        if (listContainer) {
            listContainer.innerHTML = '<p style="text-align:center;">Failed to load your list.</p>';
        }
    }
}

function sortAndPaginate(list, page) {
    // 1. Apply Sorting
    const sortedList = [...list].sort((a, b) => {
        const titleA = a.anime_title.toUpperCase();
        const titleB = b.anime_title.toUpperCase();
        
        switch(currentSort) {
            case 'title':
                return titleA.localeCompare(titleB);
            case 'rating-desc':
                const ratingA = a.rating || 0;
                const ratingB = b.rating || 0;
                return ratingB - ratingA; 
            case 'rating-asc':
                const ratingA_asc = a.rating || 0;
                const ratingB_asc = b.rating || 0;
                return ratingA_asc - ratingB_asc; 
            default:
                return 0;
        }
    });

    // 2. Apply Pagination
    totalPages = Math.ceil(sortedList.length / itemsPerPage);
    currentPage = Math.max(1, Math.min(page, totalPages || 1)); 
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedList = sortedList.slice(startIndex, endIndex);

    // 3. Render
    renderWatchedList(paginatedList);
    renderPaginationControls(sortedList.length);
    highlightSharedVAs(paginatedList);
}


function renderWatchedList(animeList) {
    const listContainer = document.getElementById('watched-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    if (animeList.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center;">Your watched list is empty. Use the search bar to add anime!</p>';
        return;
    }

    animeList.forEach(anime => {
        const li = document.createElement('li');
        li.dataset.animeId = anime.anime_id;
        li.id = `anime-card-${anime.anime_id}`; 

        let vaData;
        try {
            vaData = JSON.parse(anime.voice_actors);
        } catch (e) {
            vaData = { japanese: '', english: '' };
        }
        
        const vaString = vaData[currentLang] || vaData.japanese || '';
        const vaTags = vaString.split('|').filter(tag => tag.trim() !== '');

        const ratingScore = anime.rating || 'N/A';
        let ratingClass = '';
        if (anime.rating) {
            ratingClass = anime.rating >= 80 ? 'high-rating' : 'low-rating';
        }
        
        li.innerHTML = `
            <div class="anime-cover-container">
                <img src="${anime.coverimage}" alt="${anime.anime_title} cover" class="anime-cover" onerror="this.onerror=null;this.src='https://via.placeholder.com/150x225/1e1e1e/a0a0a0?text=NO+IMAGE';" loading="lazy">
            </div>
            
            <div class="anime-info">
                <div style="width: 100%;">
                    <b>${anime.anime_title}</b>
                    <p>Score: <span class="${ratingClass}">${ratingScore}%</span></p>
                </div>
                
                <div class="description-wrapper">
                    <span class="anime-description-text">${anime.description || 'No description available.'}</span>
                    <button type="button" class="read-more-btn" onclick="toggleDescription(this)">Read More</button>
                </div>
                
                <div class="va-tags-container">
                    ${vaTags.map(tag => `<span class="va">${tag}</span>`).join('')}
                    ${vaTags.length === 0 ? '<span class="va-tags-container" style="color:var(--color-text-subtle); font-size: 0.9em;">No VA data available for current language.</span>' : ''}
                </div>
                
                <div class="action-buttons">
                    <button type="button" class="notes-btn" onclick="showMoreInfoModal(${anime.anime_id})">More Info</button>
                    <button type="button" class="remove-btn" onclick="removeAnime(${anime.user_id}, ${anime.anime_id}, '${anime.anime_title}')">Remove</button>
                </div>
            </div>
        `;
        listContainer.appendChild(li);
        
        // Initial check for description clipping
        checkDescriptionClipping(li.querySelector('.anime-description-text'), li.querySelector('.read-more-btn'));
    });
}

function toggleDescription(button) {
    const wrapper = button.parentElement;
    wrapper.classList.toggle('expanded');
    
    if (wrapper.classList.contains('expanded')) {
        button.textContent = 'Read Less';
    } else {
        button.textContent = 'Read More';
    }
}

function checkDescriptionClipping(textElement, buttonElement) {
    const originalMaxHeight = textElement.style.maxHeight;
    textElement.style.maxHeight = 'none';
    const isClipped = textElement.scrollHeight > textElement.clientHeight;
    
    textElement.style.maxHeight = originalMaxHeight;

    if (isClipped) {
        buttonElement.style.display = 'block';
    } else {
        buttonElement.style.display = 'none';
    }
}

/* ------------------- */
/* 5. Filtering, Sorting, Pagination */
/* ------------------- */

function handleLanguageChange(event) {
    currentLang = event.target.value;
    updateVAPrompt();
    sortAndPaginate(currentAnimeList, currentPage); 
}

function handleSortChange(event) {
    currentSort = event.target.value;
    sortAndPaginate(currentAnimeList, 1); 
}

function updateVAPrompt() {
    const langSelect = document.getElementById('va-language-select');
    if (langSelect) {
        langSelect.title = `Currently displaying: ${langSelect.options[langSelect.selectedIndex].text}`;
    }
}

function renderPaginationControls(totalItems) {
    const controls = document.getElementById('pagination-controls');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    if (!controls) return;

    if (totalItems === 0) {
        controls.style.display = 'none';
        return;
    }
    controls.style.display = 'flex';
    
    if(prevButton) prevButton.disabled = currentPage === 1;
    if(nextButton) nextButton.disabled = currentPage === totalPages;
    if(pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

function changePage(newPage) {
    if (newPage >= 1 && newPage <= totalPages) {
        sortAndPaginate(currentAnimeList, newPage);
    }
}

/* ------------------- */
/* 6. Voice Actor Highlight Logic */
/* ------------------- */

function highlightSharedVAs(animeList) {
    const vaCount = {}; 

    // 1. Count VA occurrences
    animeList.forEach(anime => {
        let vaData;
        try {
            vaData = JSON.parse(anime.voice_actors);
        } catch (e) {
            vaData = { japanese: '', english: '' };
        }
        
        const vaString = vaData[currentLang] || '';
        const vaTags = vaString.split('|').filter(tag => tag.trim() !== '');
        
        vaTags.forEach(tag => {
            const vaName = tag.split(':').pop().trim();
            if (vaName) {
                vaCount[vaName] = (vaCount[vaName] || 0) + 1;
            }
        });
    });

    // 2. Apply highlight class
    animeList.forEach(anime => {
        const card = document.getElementById(`anime-card-${anime.anime_id}`);
        if (!card) return;

        card.querySelectorAll('.va').forEach(vaElement => {
            const fullTagContent = vaElement.textContent;
            const vaName = fullTagContent.split(':').pop().trim();
            
            if (vaCount[vaName] > 1) {
                vaElement.classList.add('highlight');
            } else {
                vaElement.classList.remove('highlight');
            }
        });
    });
}

/* ------------------- */
/* 7. Remove Anime */
/* ------------------- */

async function removeAnime(userId, animeId, animeTitle) {
    if (!confirm(`Are you sure you want to remove "${animeTitle}" from your watched list?`)) {
        return;
    }

    const res = await fetch(`/remove-anime/${userId}/${animeId}`, {
        method: 'DELETE'
    });
    const data = await res.json();

    if (data.success) {
        alert(`"${animeTitle}" removed.`);
        loadWatchedAnime(userId, currentPage); 
    } else {
        alert(`Removal failed: ${data.error}`);
    }
}


/* ------------------- */
/* 8. More Info Modal (Notes, Rating, Dates) */
/* ------------------- */

function showMoreInfoModal(animeId) {
    const modal = document.getElementById('more-info-modal');
    
    const anime = currentAnimeList.find(a => a.anime_id === animeId);

    if (!anime || !modal) {
        alert("Anime data or modal not found.");
        return;
    }

    // Set data attributes and content
    modal.dataset.animeId = animeId;
    document.getElementById('modal-anime-title').textContent = anime.anime_title;
    
    // Set notes and rating
    document.getElementById('notes-textarea').value = anime.notes || '';
    document.getElementById('modal-rating').value = anime.rating || '';
    
    // Set date fields: Use substring(0, 10) to get YYYY-MM-DD format for HTML date input
    document.getElementById('modal-start-date').value = anime.start_date ? anime.start_date.substring(0, 10) : ''; 
    document.getElementById('modal-end-date').value = anime.end_date ? anime.end_date.substring(0, 10) : ''; 

    modal.style.display = 'block';
}
function closeModal() {
    const modal = document.getElementById('more-info-modal');
    if (modal) modal.style.display = 'none';
}

function saveMoreInfo() {
    const modal = document.getElementById('more-info-modal');
    if (!modal) return;
    
    const animeId = parseInt(modal.dataset.animeId);
    const userId = parseInt(localStorage.getItem('userId'));

    if (isNaN(userId)) {
        console.error("User not logged in.");
        return;
    }

    const notes = document.getElementById('notes-textarea').value;
    const ratingInput = document.getElementById('modal-rating').value;
    
    // Sanitize rating: Convert to float, ensure it's within range 0-100, or null
    let rating = ratingInput ? parseFloat(ratingInput) : null;
    rating = (rating !== null && rating >= 0 && rating <= 100) ? rating : null;

    // FIX: Check for empty date strings and convert them to null for PostgreSQL
    const startDateRaw = document.getElementById('modal-start-date').value;
    const endDateRaw = document.getElementById('modal-end-date').value;

    const startDate = startDateRaw.trim() === '' ? null : startDateRaw.trim();
    const endDate = endDateRaw.trim() === '' ? null : endDateRaw.trim();

    updateMoreInfo(animeId, rating, notes, startDate, endDate);
}

async function updateMoreInfo(animeId, rating, notes, startDate, endDate) {
    const userId = parseInt(localStorage.getItem('userId'));

    if (isNaN(userId)) {
        console.error("User ID is missing for update.");
        return;
    }

    try {
        const res = await fetch('/update-info', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                animeId,
                rating,
                notes,
                start_date: startDate, 
                end_date: endDate      
            })
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: 'Unknown server error' }));
            throw new Error(`HTTP error! Status: ${res.status}. Response: ${errorData.error}`);
        }

        const data = await res.json();

        if (data.success) {
            alert("Tracking info updated successfully!");
           const modal = document.getElementById('more-info-modal');
if (modal) modal.style.display = 'none';
            loadWatchedAnime(userId, currentPage); 
        } else {
            alert(`Update failed: ${data.error}`);
        }

    } catch (err) {
        console.error("Update info API failed:", err);
        alert(`An error occurred while saving your data: ${err.message}`);
    }
}
