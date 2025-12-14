const API_BASE_URL = 'http://localhost:3000';
let currentUsername = null;
let currentPage = 1;
const itemsPerPage = 6;
let currentSort = 'dateAdded';
let currentVALangFilter = 'all';

// --- Authentication Functions ---

async function register() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const messageElement = document.getElementById('auth-message');

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        messageElement.textContent = data.message;
        messageElement.style.color = response.ok ? 'green' : 'red';
    } catch (error) {
        messageElement.textContent = 'Error: Could not connect to server.';
        messageElement.style.color = 'red';
    }
}

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const messageElement = document.getElementById('auth-message');

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUsername = username;
            document.getElementById('auth').style.display = 'none';
            document.getElementById('main-content').style.display = 'block';
            showPage('list');
            loadWatchedList();
        } else {
            messageElement.textContent = data.message;
            messageElement.style.color = 'red';
        }
    } catch (error) {
        messageElement.textContent = 'Error: Could not connect to server.';
        messageElement.style.color = 'red';
    }
}

function logout() {
    localStorage.removeItem('token');
    currentUsername = null;
    document.getElementById('auth').style.display = 'block';
    document.getElementById('main-content').style.display = 'none';
    document.getElementById('auth-message').textContent = 'Logged out successfully.';
    document.getElementById('auth-message').style.color = 'green';
    // Clear search results and list
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('watched-list').innerHTML = '';
}

// --- Navigation and State Management ---

function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        // A simple check could involve decoding the token or hitting a protected route
        // For this simple example, we assume if a token exists, the user is logged in
        // In a real app, you'd validate the token's expiry on the client or server.
        // Since we don't store username in the token in this simple example, we can't reliably restore it here.
        // We'll rely on the user logging in to set currentUsername properly for now.
        // For a true rollback, we must hide main-content until a successful login, so we'll hide it.
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('auth').style.display = 'block';
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = 'none';
    });
    document.getElementById(`${pageId}-page`).style.display = 'block';
    
    // If navigating to list, refresh it
    if (pageId === 'list') {
        loadWatchedList();
    }
}

// --- Anime Search ---

let searchTimeout;
function searchAnime() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch(document.getElementById('anime-search').value);
    }, 300); // Debounce
}

async function performSearch(query) {
    const resultsElement = document.getElementById('search-results');
    resultsElement.innerHTML = '';
    
    if (query.length < 3) {
        return;
    }

    try {
        // Use a proxy for AniList or similar API search
        const response = await fetch(`${API_BASE_URL}/search-anime?query=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.results && data.results.length) {
            data.results.forEach(anime => {
                const li = document.createElement('li');
                li.textContent = anime.title.romaji || anime.title.english || 'No Title';
                li.onclick = () => addAnimeToWatchedList(anime);
                resultsElement.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'No results found.';
            resultsElement.appendChild(li);
        }
    } catch (error) {
        console.error('Search error:', error);
        const li = document.createElement('li');
        li.textContent = 'Error connecting to search API.';
        resultsElement.appendChild(li);
    }
}

async function addAnimeToWatchedList(anime) {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please log in first.');
        return;
    }

    // Clear search results
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('anime-search').value = '';

    // Prepare VA data, defaulting to Japanese if not present or language is unknown
    const vaInfo = anime.characters.nodes.map(node => {
        const va = node.voiceActors.find(va => va.language === 'JAPANESE' || va.language === 'ENGLISH') || node.voiceActors[0];
        return {
            name: node.name.full,
            vaName: va ? va.name.full : 'Unknown VA',
            vaLanguage: va ? va.language : 'UNKNOWN'
        };
    });

    try {
        const response = await fetch(`${API_BASE_URL}/watched`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                animeId: anime.id,
                title: anime.title.romaji || anime.title.english,
                coverImage: anime.coverImage.large,
                description: anime.description,
                vaInfo: vaInfo
            })
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            showPage('list');
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Add anime error:', error);
        alert('An error occurred while adding the anime.');
    }
}

// --- Watched List Management ---

// Global variable to hold the full, unfiltered list
let fullWatchedList = [];
let activeVALanguageFilter = null; // Track the VA name we are actively filtering by

// Populates the VA Language Filter dropdown
function populateVALangFilter(list) {
    const select = document.getElementById('va-lang-filter');
    // Save the current selection
    const currentSelection = select.value;
    select.innerHTML = '<option value="all">All</option>';

    const languages = new Set();
    list.forEach(anime => {
        if (anime.vaInfo) {
            anime.vaInfo.forEach(va => {
                languages.add(va.vaLanguage);
            });
        }
    });

    Array.from(languages).sort().forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        select.appendChild(option);
    });

    // Restore the current selection
    if (currentSelection && Array.from(languages).includes(currentSelection)) {
         select.value = currentSelection;
    }
}

async function loadWatchedList() {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Update sort setting
    currentSort = document.getElementById('sort-select').value;
    currentVALangFilter = document.getElementById('va-lang-filter').value;

    try {
        const response = await fetch(`${API_BASE_URL}/watched`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            fullWatchedList = await response.json();
            
            // 1. Populate the Language filter (only needs to be done once, or when data changes)
            populateVALangFilter(fullWatchedList);
            
            // 2. Filter the list
            let filteredList = applyFilters(fullWatchedList);
            
            // 3. Sort the filtered list
            sortList(filteredList);

            // 4. Render the current page
            renderWatchedList(filteredList);
            
        } else {
            document.getElementById('watched-list').innerHTML = `<li>Error loading list.</li>`;
        }
    } catch (error) {
        console.error('List load error:', error);
        document.getElementById('watched-list').innerHTML = `<li>Could not connect to server.</li>`;
    }
}

function applyFilters(list) {
    let filtered = [...list];

    // Filter by VA Language dropdown
    if (currentVALangFilter !== 'all') {
        filtered = filtered.filter(anime => 
            anime.vaInfo && anime.vaInfo.some(va => va.vaLanguage === currentVALangFilter)
        );
    }
    
    // Filter by Active VA Name (if a VA tag was clicked)
    if (activeVALanguageFilter) {
        filtered = filtered.filter(anime => 
            anime.vaInfo && anime.vaInfo.some(va => va.vaName === activeVALanguageFilter)
        );
        document.getElementById('watched-list-title').textContent = `Filtered by VA: ${activeVALanguageFilter}`;
    } else if (currentVALangFilter !== 'all') {
         document.getElementById('watched-list-title').textContent = `Watched List (${currentVALangFilter} VAs)`;
    } else {
        document.getElementById('watched-list-title').textContent = `Your Watched List`;
    }

    return filtered;
}

function sortList(list) {
    list.sort((a, b) => {
        if (currentSort === 'dateAdded') {
            return new Date(b.dateAdded) - new Date(a.dateAdded);
        } else if (currentSort === 'nameAsc') {
            return a.title.localeCompare(b.title);
        } else if (currentSort === 'nameDesc') {
            return b.title.localeCompare(a.title);
        }
        return 0;
    });
}

function renderWatchedList(list) {
    const listElement = document.getElementById('watched-list');
    listElement.innerHTML = '';
    
    // Calculate pagination boundaries
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedList = list.slice(startIndex, endIndex);
    const totalPages = Math.ceil(list.length / itemsPerPage);

    // Update pagination controls
    document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages || 1}`;
    document.getElementById('prev-page-btn').disabled = currentPage === 1;
    document.getElementById('next-page-btn').disabled = currentPage >= totalPages;


    paginatedList.forEach(anime => {
        const listItem = document.createElement('li');
        
        // Use a Set to find unique VA names across the entire list (for highlighting)
        const allVA_Names = new Set(fullWatchedList.flatMap(a => a.vaInfo.map(va => va.vaName)));
        
        // Build VA tags
        let vaTagsHTML = (anime.vaInfo || [])
            .map(va => {
                let tagClass = 'va';
                // Check if this VA name is shared (appears more than once in the full list)
                const isShared = Array.from(allVA_Names).filter(name => name === va.vaName).length > 1;

                if (isShared) {
                    tagClass += ' highlight';
                    if (va.vaName === activeVALanguageFilter) {
                        tagClass += ' active-filter';
                    }
                }
                
                // Add the language in parentheses if not JAPANESE
                const vaDisplay = va.vaLanguage && va.vaLanguage !== 'JAPANESE' ? 
                                    `${va.vaName} (${va.vaLanguage})` : 
                                    va.vaName;

                return `<span class="${tagClass}" onclick="toggleVALanguageFilter('${va.vaName}')">${vaDisplay}</span>`;
            }).join('');

        listItem.innerHTML = `
            <img src="${anime.coverImage}" alt="${anime.title} cover" class="anime-cover">
            <div class="anime-info">
                <b>${anime.title}</b>
                <div class="description-wrapper">
                    <i class="anime-description-text">${anime.description || 'No description available.'}</i>
                    <button class="read-more-btn" onclick="toggleDescription(this)">Read More</button>
                </div>
                <div class="va-tags-container">
                    ${vaTagsHTML}
                </div>
                
                <div class="card-buttons-group">
                    <button class="notes-btn" onclick="openNotesModal('${anime._id}', '${anime.title}', '${anime.notes || ''}')">Notes</button>
                    <button class="remove-btn" onclick="removeAnime('${anime._id}')">Remove</button>
                </div>
            </div>
        `;
        listElement.appendChild(listItem);
    });
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        loadWatchedList();
    }
}

function nextPage() {
    // We only check if there is a next page based on the length of the *filtered* list.
    const filteredList = applyFilters(fullWatchedList);
    const totalPages = Math.ceil(filteredList.length / itemsPerPage);
    
    if (currentPage < totalPages) {
        currentPage++;
        loadWatchedList();
    }
}

function toggleDescription(button) {
    const wrapper = button.parentElement;
    const textElement = wrapper.querySelector('.anime-description-text');
    
    if (wrapper.classList.contains('expanded')) {
        wrapper.classList.remove('expanded');
        button.textContent = 'Read More';
    } else {
        wrapper.classList.add('expanded');
        button.textContent = 'Read Less';
    }
}

function toggleVALanguageFilter(vaName) {
    // If the clicked VA is already the active filter, clear the filter.
    if (activeVALanguageFilter === vaName) {
        activeVALanguageFilter = null;
    } else {
        activeVALanguageFilter = vaName;
    }
    // Always go back to page 1 when applying a new filter
    currentPage = 1;
    loadWatchedList();
}

async function removeAnime(animeId) {
    const token = localStorage.getItem('token');
    if (!token || !confirm('Are you sure you want to remove this anime?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/watched/${animeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            // Reload the list after removal
            loadWatchedList();
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Remove anime error:', error);
        alert('An error occurred while removing the anime.');
    }
}

// --- Notes Modal Logic ---

let currentAnimeId = null; 

function openNotesModal(animeId, title, currentNotes) {
    currentAnimeId = animeId;
    document.getElementById('notes-modal-title').textContent = `Notes for ${title}`;
    document.getElementById('notes-input').value = currentNotes;
    document.getElementById('notes-status').textContent = '';
    document.getElementById('notes-modal').style.display = 'flex';
}

function closeNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
    currentAnimeId = null;
}

async function saveNotes() {
    const token = localStorage.getItem('token');
    const notes = document.getElementById('notes-input').value;
    const statusElement = document.getElementById('notes-status');
    
    if (!token || !currentAnimeId) {
        statusElement.textContent = 'Error: Not logged in or no anime selected.';
        statusElement.style.color = 'red';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/watched/${currentAnimeId}/notes`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ notes })
        });

        const data = await response.json();
        if (response.ok) {
            statusElement.textContent = 'Notes saved successfully!';
            statusElement.style.color = 'green';
            // Reload the list to update the card's notes button/status
            loadWatchedList(); 
        } else {
            statusElement.textContent = `Error saving notes: ${data.message}`;
            statusElement.style.color = 'red';
        }
    } catch (error) {
        statusElement.textContent = 'Error: Could not connect to server.';
        statusElement.style.color = 'red';
    }
}

// Initial check when the page loads
document.addEventListener('DOMContentLoaded', checkAuth);
