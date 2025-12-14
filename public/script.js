// At the top of script.js, update the userId variable
let userId = localStorage.getItem('animeTrackerUserId'); // Load userId from storage
const watched = [];
let currentController = null;

// New Global Variables for Filtering and Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;
let currentVAFilter = null; 
// NEW: Global variable to store the ID of the anime whose notes are currently open
let currentNotesAnimeId = null; 

// New function to initialize the app (run on page load)
function init() {
    if (userId) {
        // If userId is found, skip auth screen and go to main app
        document.getElementById('auth').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        loadWatched();
        // Set default page view to Watched or Search
        showPage('watched'); 
    }
    
    // Set up event listeners 
    document.getElementById('va-lang').addEventListener('change', renderWatchedList);
    // NOTE: Navigation button listeners are handled directly in index.html (onclick="showPage(...)")
}

// -------------------
// Debounce function
// -------------------
function debounce(func, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    }
}

// -------------------
// User auth functions
// -------------------
async function register(){
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const res = await fetch('/register',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username,password})
    });
    const data = await res.json();
    if(data.success){
        // Save the ID and start the app
        userId = data.userId;
        localStorage.setItem('animeTrackerUserId', userId);
        document.getElementById('auth').style.display='none';
        document.getElementById('main').style.display='block';
        loadWatched();
        showPage('watched'); // Show watched list after fresh login
    } else alert(data.error);
}

async function login(){
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const res = await fetch('/login',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username,password})
    });
    const data = await res.json();
    if(data.success){
        // Save the ID and start the app
        userId = data.userId;
        localStorage.setItem('animeTrackerUserId', userId);
        document.getElementById('auth').style.display='none';
        document.getElementById('main').style.display='block';
        loadWatched();
        showPage('watched'); // Show watched list after successful login
    } else alert(data.error);
}

// -------------------
// NEW NAVIGATION LOGIC
// -------------------
function showPage(pageId) {
    // Hide all page containers
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    // Remove active class from all nav buttons
    document.querySelectorAll('.navbar button').forEach(button => {
        button.classList.remove('active');
    });

    // Show the selected page
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.style.display = 'block';
        document.getElementById(`nav-${pageId}`).classList.add('active');
    }

    // Special handling for the watched list
    if (pageId === 'watched') {
        renderWatchedList(); 
    }
}


// -------------------
// NEW PAGINATION LOGIC
// -------------------
function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderWatchedList();
    }
}


// -------------------
// VOICE ACTOR FILTER LOGIC
// -------------------
function filterByVA(vaName) {
    // If the same filter is clicked, clear the filter
    if (currentVAFilter === vaName) {
        currentVAFilter = null;
    } else {
        currentVAFilter = vaName;
    }
    // Reset to the first page and re-render the list
    currentPage = 1;
    renderWatchedList();
}


// -------------------
// Debounced search input
// -------------------
const debouncedSearch = debounce(actualSearchAnime, 300);
document.getElementById('anime-search').addEventListener('input', debouncedSearch);

// -------------------
// Actual search function
// -------------------
async function actualSearchAnime() {
    const q = document.getElementById('anime-search').value.trim();
    const list = document.getElementById('search-results');

    if(q === ""){
        list.innerHTML = '';
        return;
    }

    if(currentController) currentController.abort();
    currentController = new AbortController();
    const signal = currentController.signal;

    const titleLang = document.getElementById('search-lang').value;
    try {
        const res = await fetch(`/search-anime?q=${encodeURIComponent(q)}&lang=${titleLang}`, { signal });
        const data = await res.json();
        list.innerHTML = '';
        data.forEach(anime => {
            const title = titleLang === 'english' && anime.title.english ? anime.title.english : anime.title.romaji;
            const li = document.createElement('li');
            li.innerText = `${title} (${anime.averageScore})`;
            li.onclick = () => addAnime(anime);
            list.appendChild(li);
        });
    } catch(err){
        if(err.name !== 'AbortError') console.error("Search failed:", err);
    }
}

// -------------------
// Add anime to DB 
// -------------------
async function addAnime(anime){
    if (!userId) {
        alert("You must be logged in to add anime.");
        return;
    }
    
    const titleLang = document.getElementById('search-lang').value;
    const animeTitle = titleLang==='english' && anime.title.english ? anime.title.english : anime.title.romaji;
    const rating = anime.averageScore/10;
    
    // Client-side cleanup for description
    let description = anime.description || '';

    const characters = anime.characters.edges; // Data structure from AniList API
    
    // Image Saving: Robust Check for both lowercase and capitalized properties
    const coverImage = anime.coverImage?.large || anime.CoverImage?.large || '';

    try {
        const res = await fetch('/add-anime',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({userId, animeId:anime.id, animeTitle, rating, description, characters, coverImage})
        });
        const data = await res.json();
        
        if(data.success) {
            loadWatched(); 
            document.getElementById('search-results').innerHTML = ''; // Clear search results on success
            document.getElementById('anime-search').value = '';
        }
        else alert(`Failed to add anime: ${data.error}`);
    } catch(err){
        console.error("Add anime failed:", err);
    }
}

// -------------------
// Remove anime
// -------------------
async function removeAnime(animeId){
    const confirmed = confirm("Are you sure you want to remove this anime?");
    if(!confirmed) return;

    try {
        const res = await fetch(`/remove-anime/${userId}/${animeId}`, { method:'DELETE' });
        const data = await res.json();
        if(data.success) loadWatched();
        else alert(data.error);
    } catch(err){
        console.error("Remove anime failed:", err);
    }
}

// -------------------
// Load watched anime (CRITICAL FIXES APPLIED HERE)
// -------------------
async function loadWatched(){
    if (!userId) return; 
    try {
        const res = await fetch(`/watched/${userId}`);
        const data = await res.json();
        
        if(data.success){
            // 1. Clear the old array content
            watched.length = 0; 
            
            // 2. Repopulate the array with new/updated data
            data.data.forEach(a=>{
                // Ensure JSON.parse handles null or undefined voice_actors gracefully
                try {
                    a.voice_actors_parsed = JSON.parse(a.voice_actors);
                } catch(e){
                    a.voice_actors_parsed = { japanese: "", english: "" };
                }
                watched.push(a);
            });

            // 3. Render the list only if the watched page is currently active
            if (document.getElementById('page-watched').style.display !== 'none') {
                renderWatchedList(); 
            }
        }
    } catch(err){
        console.error("Load watched failed:", err);
    }
}


// -------------------
// Notes Modal Logic (NEW)
// -------------------

// Function to open the modal and load notes
async function openNotesModal(animeId, animeTitle) {
    if (!userId) {
        alert("Please log in to manage notes.");
        return;
    }
    
    // Set the global tracker ID
    currentNotesAnimeId = animeId;
    
    // 1. Update Modal Title
    document.getElementById('notes-modal-title').textContent = `Notes for ${animeTitle}`;
    
    // 2. Clear previous content and status
    document.getElementById('notes-input').value = 'Loading notes...';
    document.getElementById('notes-status').textContent = '';
    
    // 3. Fetch existing notes
    try {
        // NOTE: This assumes you have created this endpoint on your server
        const res = await fetch(`/api/notes/${userId}/${animeId}`);
        const data = await res.json(); 
        
        if (data.success) {
            document.getElementById('notes-input').value = data.notes || '';
        } else {
            document.getElementById('notes-input').value = 'Could not load existing notes.';
        }
    } catch (error) {
        console.error("Error fetching notes:", error);
        document.getElementById('notes-input').value = 'Error fetching notes. Check server connection.';
    }

    // 4. Show the modal
    document.getElementById('notes-modal').style.display = 'flex';
}

// Function to close the modal
function closeNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
    currentNotesAnimeId = null; // Clear the tracker ID
    document.getElementById('notes-status').textContent = ''; // Clear status
}

// Function to save the notes
async function saveNotes() {
    if (!currentNotesAnimeId || !userId) return;

    const notes = document.getElementById('notes-input').value;
    const statusElement = document.getElementById('notes-status');
    statusElement.textContent = 'Saving...';

    try {
        // NOTE: This assumes you have created this endpoint on your server
        const res = await fetch('/api/notes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                animeId: currentNotesAnimeId,
                notes: notes
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            statusElement.textContent = 'Notes saved successfully!';
            // Reload the watched list to potentially update a 'has notes' indicator (optional)
            loadWatched();
        } else {
            statusElement.textContent = `Failed to save notes: ${data.error}`;
        }
    } catch (error) {
        console.error("Error saving notes:", error);
        statusElement.textContent = 'Network error while saving notes.';
    }
    
    // Clear status message after a few seconds
    setTimeout(() => {
        statusElement.textContent = '';
    }, 3000);
}

// -------------------
// Read More/Less Toggle Function
// -------------------
function toggleReadMore(event) {
    const readMoreButton = event.target;
    const descriptionWrapper = readMoreButton.closest('.description-wrapper'); 

    if (!descriptionWrapper) return;

    descriptionWrapper.classList.toggle('expanded');

    if (descriptionWrapper.classList.contains('expanded')) {
        readMoreButton.textContent = 'Read Less';
    } else {
        readMoreButton.textContent = 'Read More';
    }

    const gridContainer = document.getElementById('watched-list');
    if (gridContainer) {
        const scrollY = window.scrollY; 
        
        gridContainer.style.display = 'none'; 
        void gridContainer.offsetWidth;
        gridContainer.style.display = 'grid'; 
        
        window.scrollTo(0, scrollY);
    }
}


// -------------------
// RENDER WATCHED LIST (VA Filtering, Pagination, Highlighting, Notes Button)
// -------------------
function renderWatchedList() {
    
    // 1. Apply VA Filter
    const vaLang = document.getElementById('va-lang').value;
    let filteredAnime = watched;

    if (currentVAFilter) {
        filteredAnime = watched.filter(anime => {
            const vaString = anime.voice_actors_parsed[vaLang] || "";
            return vaString.includes(currentVAFilter); 
        });
        
        document.getElementById('watched-list-title').textContent = 
            `Your Watched List (Filtered by: ${currentVAFilter} - click VA to clear)`;
    } else {
        document.getElementById('watched-list-title').textContent = 'Your Watched List';
    }


    // 2. Calculate Pagination Range
    totalPages = Math.ceil(filteredAnime.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;

    const animeToRender = filteredAnime.slice(start, end);
    
    
    // 3. VA Count (Count across ALL watched items for highlighting accuracy)
    const vaCount = {};
    watched.forEach(a => { 
        const vaString = a.voice_actors_parsed[vaLang] || "";
        vaString.split('|').filter(Boolean).forEach(va => {
            const vaName = va.split(': ')[1]?.trim();
            if (vaName) {
                vaCount[vaName] = (vaCount[vaName] || 0) + 1;
            }
        });
    });

    // 4. Render List
    const list = document.getElementById('watched-list');
    list.innerHTML = ''; 

    if (animeToRender.length === 0) {
        const message = document.createElement('h3');
        message.style.gridColumn = '1 / -1'; 
        message.style.textAlign = 'center';
        message.style.color = 'var(--color-text-subtle)';
        message.textContent = currentVAFilter ? 
            `No anime found featuring ${currentVAFilter} on this page.` : 
            "Your watched list is empty. Time to add some anime!";
        list.appendChild(message);
    }

    animeToRender.forEach(anime => {
        const li = document.createElement('li');

        // Image Display
        const imageUrl = anime.coverImage || anime.CoverImage || anime.coverimage;
        if(imageUrl && imageUrl.length > 10) { 
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = anime.anime_title;
            img.className = 'anime-cover';
            li.appendChild(img);
        }

        // Anime Info Container
        const animeInfo = document.createElement('div');
        animeInfo.className = 'anime-info';

        // Title and Rating
        const title = document.createElement('b');
        title.innerHTML = `${anime.anime_title} - ${anime.rating.toFixed(2)}`;
        animeInfo.appendChild(title);


        // --- Description Wrapper ---
        const descriptionWrapper = document.createElement('div');
        descriptionWrapper.className = 'description-wrapper';

        const descriptionText = document.createElement('i');
        descriptionText.className = 'anime-description-text';
        descriptionText.textContent = anime.description || 'No description available.';
        descriptionWrapper.appendChild(descriptionText);

        if ((anime.description?.length || 0) > 250) { 
            const readMoreButton = document.createElement('button');
            readMoreButton.className = 'read-more-btn';
            readMoreButton.textContent = 'Read More';
            readMoreButton.addEventListener('click', toggleReadMore); 
            descriptionWrapper.appendChild(readMoreButton);
        }
        
        animeInfo.appendChild(descriptionWrapper);


        // VA Tags Container
        const vaTagsContainer = document.createElement('div');
        vaTagsContainer.className = 'va-tags-container';
        
        // VA Display
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|').filter(Boolean);
        
        vaList.forEach(va=>{
            const parts = va.split(': ');
            const vaName = parts[1]?.trim() || '';
            
            if(vaName){
                let vaHtml = va;
                
                const vaSpan = document.createElement('span');
                vaSpan.className = 'va';

                if(vaCount[vaName]>1) {
                    vaHtml = va.replace(vaName, `<span class="highlight">${vaName}</span>`);
                    vaSpan.innerHTML = vaHtml;
                    
                    setTimeout(() => {
                        const highlightSpan = vaSpan.querySelector('.highlight');
                        if (highlightSpan) {
                            if (currentVAFilter === vaName) {
                                highlightSpan.classList.add('active-filter');
                            }
                            highlightSpan.addEventListener('click', (e) => {
                                e.stopPropagation(); 
                                filterByVA(vaName);
                            });
                        }
                    }, 0);
                    
                } else {
                    vaSpan.innerHTML = vaHtml;
                }
                
                vaTagsContainer.appendChild(vaSpan);
            }
        });
        animeInfo.appendChild(vaTagsContainer);

        // --- Buttons Group (NEW CONTAINER) ---
        const buttonsGroup = document.createElement('div');
        buttonsGroup.className = 'card-buttons-group';
        
        // Notes Button (NEW)
        const notesBtn = document.createElement('button');
        notesBtn.className = 'notes-btn';
        notesBtn.textContent = 'Notes'; // You could change this to 'View/Add Notes'
        notesBtn.addEventListener('click', () => openNotesModal(anime.anime_id, anime.anime_title));
        buttonsGroup.appendChild(notesBtn);

        // Remove Button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeAnime(anime.anime_id));
        buttonsGroup.appendChild(removeBtn);

        animeInfo.appendChild(buttonsGroup);

        li.appendChild(animeInfo);
        list.appendChild(li);
    });

    // 5. Update Pagination Controls
    document.getElementById('page-info').textContent = `Page ${totalPages > 0 ? currentPage : 0} of ${totalPages} (${filteredAnime.length} item${filteredAnime.length === 1 ? '' : 's'})`;
    document.getElementById('prev-page').disabled = currentPage === 1 || totalPages === 0;
    document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;
}


// -------------------
// Expose functions globally and start initialization
// -------------------
window.register = register;
window.login = login;
window.searchAnime = actualSearchAnime;
window.removeAnime = removeAnime;
window.showPage = showPage; 
window.changePage = changePage; 
window.filterByVA = filterByVA; 
window.openNotesModal = openNotesModal; // NEW
window.closeNotesModal = closeNotesModal; // NEW
window.saveNotes = saveNotes; // NEW
window.onload = init;
