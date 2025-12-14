// At the top of script.js, update the userId variable
let userId = localStorage.getItem('animeTrackerUserId'); 
const watched = [];
let currentController = null;

// New Global Variables for Filtering and Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;
let currentVAFilter = null; 
let currentNotesAnimeId = null; 

// NEW: Global variable to store the ID of the anime whose date is currently open
let currentDateAnimeId = null; 

// New function to initialize the app (run on page load)
function init() {
    if (userId) {
        document.getElementById('auth').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        loadWatched();
        showPage('watched'); 
    }
    
    document.getElementById('va-lang').addEventListener('change', renderWatchedList);
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
        userId = data.userId;
        localStorage.setItem('animeTrackerUserId', userId);
        document.getElementById('auth').style.display='none';
        document.getElementById('main').style.display='block';
        loadWatched();
        showPage('watched'); 
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
        userId = data.userId;
        localStorage.setItem('animeTrackerUserId', userId);
        document.getElementById('auth').style.display='none';
        document.getElementById('main').style.display='block';
        loadWatched();
        showPage('watched'); 
    } else alert(data.error);
}

// -------------------
// NAVIGATION LOGIC
// -------------------
function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    document.querySelectorAll('.navbar button').forEach(button => {
        button.classList.remove('active');
    });

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.style.display = 'block';
        document.getElementById(`nav-${pageId}`).classList.add('active');
    }

    if (pageId === 'watched') {
        renderWatchedList(); 
    }
}


// -------------------
// PAGINATION LOGIC
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
    if (currentVAFilter === vaName) {
        currentVAFilter = null;
    } else {
        currentVAFilter = vaName;
    }
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
    
    let description = anime.description || '';

    const characters = anime.characters.edges;
    
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
            document.getElementById('search-results').innerHTML = ''; 
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
// Load watched anime
// -------------------
async function loadWatched(){
    if (!userId) return; 
    try {
        const res = await fetch(`/watched/${userId}`);
        const data = await res.json();
        
        if(data.success){
            watched.length = 0; 
            
            data.data.forEach(a=>{
                try {
                    // Postgres returns coverImage as 'coverimage' (lowercase)
                    a.coverImage = a.coverimage || a.coverImage; 
                    a.voice_actors_parsed = JSON.parse(a.voice_actors);
                } catch(e){
                    a.voice_actors_parsed = { japanese: "", english: "" };
                }
                watched.push(a);
            });

            if (document.getElementById('page-watched').style.display !== 'none') {
                renderWatchedList(); 
            }
        }
    } catch(err){
        console.error("Load watched failed:", err);
    }
}


// -------------------
// Notes Modal Logic (EXISTING)
// -------------------

async function openNotesModal(animeId, animeTitle) {
    if (!userId) {
        alert("Please log in to manage notes.");
        return;
    }
    
    currentNotesAnimeId = animeId;
    document.getElementById('notes-modal-title').textContent = `Notes for ${animeTitle}`;
    document.getElementById('notes-input').value = 'Loading notes...';
    document.getElementById('notes-status').textContent = '';
    
    try {
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

    document.getElementById('notes-modal').style.display = 'flex';
}

function closeNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
    currentNotesAnimeId = null;
    document.getElementById('notes-status').textContent = '';
}

async function saveNotes() {
    if (!currentNotesAnimeId || !userId) return;

    const notes = document.getElementById('notes-input').value;
    const statusElement = document.getElementById('notes-status');
    statusElement.textContent = 'Saving...';

    try {
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
            loadWatched();
        } else {
            statusElement.textContent = `Failed to save notes: ${data.error}`;
        }
    } catch (error) {
        console.error("Error saving notes:", error);
        statusElement.textContent = 'Network error while saving notes.';
    }
    
    setTimeout(() => {
        statusElement.textContent = '';
    }, 3000);
}


// -------------------
// Finished Date Modal Logic (NEW)
// -------------------

function openDateModal(animeId, animeTitle, existingDate) {
    if (!userId) {
        alert("Please log in to set the finished date.");
        return;
    }
    
    currentDateAnimeId = animeId;
    
    document.getElementById('date-modal-title').textContent = `Set Finished Date for ${animeTitle}`;
    document.getElementById('finished-date-input').value = existingDate ? existingDate.substring(0, 10) : '';
    document.getElementById('date-status').textContent = '';

    document.getElementById('date-modal').style.display = 'flex';
}

function closeDateModal() {
    document.getElementById('date-modal').style.display = 'none';
    currentDateAnimeId = null;
    document.getElementById('date-status').textContent = '';
}

async function saveFinishedDate(dateToSave = null) {
    if (!currentDateAnimeId || !userId) return;

    // If dateToSave is null, get it from the input field
    if (dateToSave === null) {
        dateToSave = document.getElementById('finished-date-input').value;
    }
    
    // Convert empty string to null for DB consistency (Postgres DATE type)
    const date = dateToSave.trim() === '' ? null : dateToSave;

    const statusElement = document.getElementById('date-status');
    statusElement.textContent = date ? 'Saving date...' : 'Clearing date...';

    try {
        const res = await fetch('/api/finished-date', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                animeId: currentDateAnimeId,
                date: date
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            statusElement.textContent = date ? 'Date saved successfully!' : 'Date cleared successfully!';
            loadWatched(); // Refresh list to display the new date
        } else {
            statusElement.textContent = `Failed to save date: ${data.error}`;
        }
    } catch (error) {
        console.error("Error saving date:", error);
        statusElement.textContent = 'Network error while saving date.';
    }
    
    setTimeout(() => {
        statusElement.textContent = '';
        closeDateModal();
    }, 1500); // Close quicker than notes
}

function clearFinishedDate() {
    // Pass null to saveFinishedDate to clear the date in the database
    saveFinishedDate(null); 
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


    totalPages = Math.ceil(filteredAnime.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;

    const animeToRender = filteredAnime.slice(start, end);
    
    
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

        // === NEW: Finished Date Display at the top of the card ===
        if (anime.finished_date) {
            const dateDisplay = document.createElement('div');
            dateDisplay.className = 'finished-date-display';
            // Format the date to a more readable string (e.g., '2024-12-14' -> 'Finished: 12/14/2024')
            const dateObj = new Date(anime.finished_date);
            const formattedDate = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });
            dateDisplay.innerHTML = `Finished: <b>${formattedDate}</b>`;
            li.appendChild(dateDisplay);
        }
        // =========================================================

        // Image Display
        const imageUrl = anime.coverImage || anime.coverimage;
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

        // --- Buttons Group ---
        const buttonsGroup = document.createElement('div');
        buttonsGroup.className = 'card-buttons-group';
        
        // Date Button (NEW)
        const dateBtn = document.createElement('button');
        dateBtn.className = 'date-btn';
        dateBtn.textContent = anime.finished_date ? 'Edit Date' : 'Set Date';
        // Pass existing date to modal function
        dateBtn.addEventListener('click', () => openDateModal(anime.anime_id, anime.anime_title, anime.finished_date));
        buttonsGroup.appendChild(dateBtn);

        // Notes Button
        const notesBtn = document.createElement('button');
        notesBtn.className = 'notes-btn';
        notesBtn.textContent = 'Notes'; 
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
window.openNotesModal = openNotesModal;
window.closeNotesModal = closeNotesModal;
window.saveNotes = saveNotes;
window.openDateModal = openDateModal; // NEW
window.closeDateModal = closeDateModal; // NEW
window.saveFinishedDate = saveFinishedDate; // NEW
window.clearFinishedDate = clearFinishedDate; // NEW
window.onload = init;
