// At the top of script.js, update the userId variable
let userId = localStorage.getItem('animeTrackerUserId'); // Load userId from storage
const watched = [];
let currentController = null;

// New Global Variables for Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;


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

    console.log("--- addAnime started ---");
    console.log("Sending data:", {userId, animeId:anime.id, animeTitle, rating, description, characters: characters ? characters.length : 'N/A', coverImage}); 
    console.log("Raw Anime Object:", anime);

    try {
        const res = await fetch('/add-anime',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({userId, animeId:anime.id, animeTitle, rating, description, characters, coverImage})
        });
        const data = await res.json();
        
        console.log("Server Response:", data);
        
        if(data.success) {
            loadWatched();
            document.getElementById('search-results').innerHTML = ''; // Clear search results on success
            document.getElementById('anime-search').value = '';
        }
        else alert(`Failed to add anime: ${data.error}`);
    } catch(err){
        console.error("Add anime failed:", err);
    }
    console.log("--- addAnime finished ---");
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
// Load watched anime (MODIFIED - no longer renders directly)
// -------------------
async function loadWatched(){
    if (!userId) return; 
    try {
        const res = await fetch(`/watched/${userId}`);
        const data = await res.json();
        watched.length=0;
        if(data.success){
            
            data.data.forEach(a=>{
                // FIX: Ensure JSON.parse handles null or undefined voice_actors gracefully
                try {
                    a.voice_actors_parsed = JSON.parse(a.voice_actors);
                } catch(e){
                    // Fallback for old/malformed/empty data
                    a.voice_actors_parsed = { japanese: "", english: "" };
                }
                watched.push(a);
            });

            // If the watched page is currently visible, render it immediately
            if (document.getElementById('page-watched').style.display !== 'none') {
                renderWatchedList(); 
            }
        }
    } catch(err){
        console.error("Load watched failed:", err);
    }
}


// -------------------
// Read More/Less Toggle Function (New Helper Function)
// -------------------
function toggleReadMore(event) {
    const readMoreButton = event.target;
    // Get the parent wrapper (.description-wrapper)
    const descriptionWrapper = readMoreButton.closest('.description-wrapper'); 

    if (!descriptionWrapper) return;

    // 1. Toggle the 'expanded' class
    descriptionWrapper.classList.toggle('expanded');

    // 2. Change the button text
    if (descriptionWrapper.classList.contains('expanded')) {
        readMoreButton.textContent = 'Read Less';
    } else {
        readMoreButton.textContent = 'Read More';
    }

    // 3. Force Grid Recalculation (Essential for preserving row alignment)
    const gridContainer = document.getElementById('watched-list');
    if (gridContainer) {
        // Temporarily hide, force browser reflow, then restore display
        gridContainer.style.display = 'none'; 
        void gridContainer.offsetWidth; // Force browser reflow/recalculation
        gridContainer.style.display = 'grid'; 
    }
}


// -------------------
// RENDER WATCHED LIST (MODIFIED to use DOM methods for Read More feature)
// -------------------
function renderWatchedList() {
    // 1. Calculate Pagination Range
    totalPages = Math.ceil(watched.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;

    // Slice the watched array to get only the items for the current page
    const animeToRender = watched.slice(start, end);
    
    // 2. VA Count (Count across ALL watched items for highlighting accuracy)
    const vaLang = document.getElementById('va-lang').value;
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

    // 3. Render List
    const list = document.getElementById('watched-list');
    list.innerHTML = ''; 

    animeToRender.forEach(anime => {
        // Rebuild the HTML structure for each anime using DOM methods
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


        // --- Description Wrapper (NEW) ---
        const descriptionWrapper = document.createElement('div');
        descriptionWrapper.className = 'description-wrapper';

        // Description Text (Clips based on CSS max-height)
        const descriptionText = document.createElement('i');
        descriptionText.className = 'anime-description-text';
        descriptionText.textContent = anime.description || 'No description available.';
        descriptionWrapper.appendChild(descriptionText);

        // Read More Button
        // Check if description is long enough (using the same threshold as the CSS clip)
        // Note: Using character count is a proxy for visual height (CSS max-height: 7em)
        if ((anime.description?.length || 0) > 250) { 
            const readMoreButton = document.createElement('button');
            readMoreButton.className = 'read-more-btn';
            readMoreButton.textContent = 'Read More';
            // Attach the new toggle function
            readMoreButton.addEventListener('click', toggleReadMore); 
            descriptionWrapper.appendChild(readMoreButton);
        }
        
        animeInfo.appendChild(descriptionWrapper);
        // --- End Description Wrapper ---

        // VA Tags Container
        const vaTagsContainer = document.createElement('div');
        vaTagsContainer.className = 'va-tags-container';
        
        // VA Display
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|').filter(Boolean);
        
        vaList.forEach(va=>{
            // va is "Character1, Character2: VA Name"
            const parts = va.split(': ');
            const vaName = parts[1]?.trim() || '';
            
            if(vaName){
                let vaHtml = va;
                
                // Check if the VA name is shared
                if(vaCount[vaName]>1) {
                    // Wrap the VA name in a highlight span
                    vaHtml = va.replace(vaName, `<span class="highlight">${vaName}</span>`);
                }
                
                const vaSpan = document.createElement('span');
                vaSpan.className = 'va';
                vaSpan.innerHTML = vaHtml;
                vaTagsContainer.appendChild(vaSpan);
            }
        });
        animeInfo.appendChild(vaTagsContainer);


        // Remove Button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        // Use a click listener for the remove function
        removeBtn.addEventListener('click', () => removeAnime(anime.anime_id));
        animeInfo.appendChild(removeBtn);

        li.appendChild(animeInfo);
        list.appendChild(li);
    });

    // 4. Update Pagination Controls
    document.getElementById('page-info').textContent = `Page ${totalPages > 0 ? currentPage : 0} of ${totalPages}`;
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
window.showPage = showPage; // New export
window.changePage = changePage; // New export
window.onload = init; // This is now the entry point
