let userId = localStorage.getItem('animeTrackerUserId'); // Load userId from storage
const watched = [];
let currentController = null;

// New Global Variables for Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;


// -------------------
// NEW PROFILE LOGIC (Safety/Fixes from previous step)
// -------------------

// CRITICAL FIX 1: Function to handle the notification click without triggering the profile dropdown
function handleNotificationClick(event) {
    // *** CRITICAL FIX: Stops the click event from propagating to the parent (.profile-button) ***
    event.stopPropagation();
    
    console.log("Notification button was clicked. Profile dropdown toggle prevented.");
    alert("Checking for new notifications!"); // Placeholder for your notification logic
}

// CRITICAL FIX 2: Standard function to toggle the profile dropdown
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

function logout() {
    // 1. Clear local storage
    localStorage.removeItem('animeTrackerUserId');
    userId = null;

    // 2. Clear global data (optional but good practice)
    watched.length = 0;

    // 3. Reset UI
    document.getElementById('main').style.display = 'none';
    document.getElementById('auth').style.display = 'block';
    document.getElementById('profile-container').style.display = 'none';
    document.getElementById('profile-dropdown').style.display = 'none';

    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';

    alert("Logged out successfully.");
}

// New function to initialize the app (run on page load)
function init() {
    if (userId) {
        // If userId is found, skip auth screen and go to main app
        document.getElementById('auth').style.display = 'none';
        document.getElementById('main').style.display = 'block';

        // NEW: Show profile container and set placeholder username
        document.getElementById('profile-container').style.display = 'block';
        document.getElementById('profile-username').textContent = 'originiti'; 
        
        loadWatched();
        // Set default page view to Watched or Search
        showPage('watched'); 
    }
    
    // Set up general event listeners 
    document.getElementById('va-lang').addEventListener('change', renderWatchedList);
    
    // === NOTES/MORE INFO MODAL LISTENERS ===
    // NOTE: The ID is still 'notes-save-btn' but its function is now broader
    document.getElementById('notes-save-btn').addEventListener('click', saveMoreInfo);
    document.getElementById('notes-close-btn').addEventListener('click', closeNotesModal);
    
    // Close modal if user clicks outside of it
    document.getElementById('notes-modal').addEventListener('click', (event) => {
        if (event.target === event.currentTarget) {
            closeNotesModal();
        }
    });

    // --- CRITICAL PROFILE/NOTIFICATION EVENT LISTENERS ---
    const notificationButton = document.getElementById('notification-trigger');
    const profileButton = document.getElementById('profile-button-trigger');

    if (notificationButton) {
        notificationButton.addEventListener('click', handleNotificationClick);
    }
    
    if (profileButton) {
        profileButton.addEventListener('click', toggleProfileDropdown);
    }

    // Optional: Close dropdown when clicking anywhere else on the page
    document.addEventListener('click', (event) => {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown && dropdown.style.display === 'block' && 
            profileButton && !profileButton.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });
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

        // NEW: Show profile container and set username
        document.getElementById('profile-container').style.display = 'block';
        document.getElementById('profile-username').textContent = username; 

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

        // NEW: Show profile container and set username
        document.getElementById('profile-container').style.display = 'block';
        document.getElementById('profile-username').textContent = username; 
        
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
    
    // NOTE: Initial rating is from the API, we will use the modal to update the user's personal rating.
    const rating = anime.averageScore/10; 
    
    // Client-side cleanup for description
    let description = anime.description || '';

    const characters = anime.characters.edges; // Data structure from AniList API
    
    // Image Saving: Robust Check for both lowercase and capitalized properties
    const coverImage = anime.coverImage?.large || anime.CoverImage?.large || '';

    try {
        // Initial insert only uses API rating and no dates/notes
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
// Load watched anime (MODIFIED - now also loads new fields if available)
// -------------------
async function loadWatched(){
    if (!userId) return; 
    try {
        const res = await fetch(`/watched/${userId}`);
        const data = await res.json();
        watched.length=0;
        if(data.success){
            
            data.data.forEach(a=>{
                try {
                    a.voice_actors_parsed = JSON.parse(a.voice_actors);
                } catch(e){
                    a.voice_actors_parsed = { japanese: "", english: "" };
                }
                // Ensure new fields are loaded (null if not in DB yet)
                a.start_date = a.start_date || null;
                a.end_date = a.end_date || null;
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
        void gridContainer.offsetWidth; // Force browser reflow
        gridContainer.style.display = 'grid'; 
        window.scrollTo(0, scrollY);
    }
}

// -------------------
// More Info Modal Functions (RENAMED AND UPDATED)
// -------------------
let currentAnimeIdForNotes = null;

function openMoreInfoModal(animeId, animeTitle, rating, notes, startDate, endDate) {
    currentAnimeIdForNotes = animeId;
    const modal = document.getElementById('notes-modal');
    
    // Set all fields
    document.getElementById('modal-anime-title').textContent = animeTitle;
    document.getElementById('modal-rating').value = rating ? rating.toFixed(1) : '';
    document.getElementById('modal-start-date').value = startDate || '';
    document.getElementById('modal-end-date').value = endDate || '';
    document.getElementById('notes-textarea').value = notes || '';

    modal.style.display = 'block';
}

function closeNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
    currentAnimeIdForNotes = null;
}

// RENAMED: saveNotes -> saveMoreInfo
function saveMoreInfo() {
    if (currentAnimeIdForNotes) {
        // Collect all new fields
        const newRating = parseFloat(document.getElementById('modal-rating').value) || null;
        const newNotes = document.getElementById('notes-textarea').value;
        const newStartDate = document.getElementById('modal-start-date').value || null;
        const newEndDate = document.getElementById('modal-end-date').value || null;

        // Validation (Rating 1-10)
        if (newRating !== null && (newRating < 1 || newRating > 10)) {
            alert("Rating must be between 1 and 10.");
            return;
        }

        // Call the new API function
        updateMoreInfo(currentAnimeIdForNotes, newRating, newNotes, newStartDate, newEndDate); 
        closeNotesModal();
    }
}

// RENAMED: updateNotes -> updateMoreInfo (Updated to send all data)
async function updateMoreInfo(animeId, rating, notes, startDate, endDate) {
    if (!userId) {
        alert("You must be logged in to save information.");
        return;
    }
    
    try {
        const res = await fetch('/update-info', { // NOTE: Change API endpoint name to reflect broader update
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId, 
                animeId, 
                rating,          // NEW
                notes, 
                start_date: startDate, // NEW
                end_date: endDate      // NEW
            })
        });
        const data = await res.json();
        
        if (data.success) {
            // Find the item in the local 'watched' array and update its new fields
            const item = watched.find(a => String(a.anime_id) === String(animeId));
            if (item) {
                item.rating = rating; 
                item.notes = notes;
                item.start_date = startDate;
                item.end_date = endDate;
            }
            // Re-render the list to reflect the change
            renderWatchedList(); 
        } else {
            alert(`Failed to save info: ${data.error}`);
        }
    } catch (err) {
        console.error("Update info API failed:", err);
        alert("Error connecting to server. Failed to save info.");
    }
}

// -------------------
// RENDER WATCHED LIST 
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
        const li = document.createElement('li');

        // --- IMAGE DISPLAY FIX ---
        const imageUrl = anime.coverImage || anime.CoverImage || anime.coverimage;
        if(imageUrl && imageUrl.length > 10) { 
            const imageContainer = document.createElement('div');
            imageContainer.className = 'anime-cover-container';
            
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = anime.anime_title;
            img.className = 'anime-cover';
            
            imageContainer.appendChild(img);
            li.appendChild(imageContainer);
        }
        // --- END IMAGE DISPLAY FIX ---

        // Anime Info Container
        const animeInfo = document.createElement('div');
        animeInfo.className = 'anime-info';

        // Title and Rating
        const title = document.createElement('b');
        // Display the user's current rating (which is now in the DB)
        const displayRating = anime.rating ? anime.rating.toFixed(1) : 'N/A';
        title.innerHTML = `${anime.anime_title} - ${displayRating}`;
        animeInfo.appendChild(title);


        // --- Description Wrapper ---
        const descriptionWrapper = document.createElement('div');
        descriptionWrapper.className = 'description-wrapper';

        // Description Text (Clips based on CSS max-height)
        const descriptionText = document.createElement('i');
        descriptionText.className = 'anime-description-text';
        descriptionText.textContent = anime.description || 'No description available.';
        descriptionWrapper.appendChild(descriptionText);

        // Read More Button
        if ((anime.description?.length || 0) > 250) { 
            const readMoreButton = document.createElement('button');
            readMoreButton.className = 'read-more-btn';
            readMoreButton.textContent = 'Read More';
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
        
        // --- RENDER VAs AND COUNT THEM ---
        let actualVACount = 0;
        
        vaList.forEach(va=>{
            const parts = va.split(': ');
            const vaName = parts[1]?.trim() || '';
            
            if(vaName){
                let vaHtml = va;
                
                if(vaCount[vaName]>1) {
                    vaHtml = va.replace(vaName, `<span class="highlight">${vaName}</span>`);
                }
                
                const vaSpan = document.createElement('span');
                vaSpan.className = 'va';
                vaSpan.innerHTML = vaHtml;
                vaTagsContainer.appendChild(vaSpan);
                actualVACount++;
            }
        });
        animeInfo.appendChild(vaTagsContainer);

        // --- DYNAMIC HEIGHT ADJUSTMENT ---
        if (actualVACount <= 2) {
            descriptionText.style.maxHeight = '10em'; 
        }

        // --- Action Buttons Container ---
        
        // 1. Remove Button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeAnime(anime.anime_id));
        
        // 2. More Info Button (Replaced Notes button)
        const infoBtn = document.createElement('button');
        infoBtn.className = 'notes-btn'; // Reusing the style
        infoBtn.textContent = 'More Info';
        
        infoBtn.addEventListener('click', () => {
            // Pass all required data to the new modal function
            openMoreInfoModal(
                anime.anime_id, 
                anime.anime_title, 
                anime.rating, 
                anime.notes,
                anime.start_date,
                anime.end_date
            );
        });

        // 3. Group buttons
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        actionButtons.appendChild(infoBtn); // Now the "More Info" button
        actionButtons.appendChild(removeBtn);

        animeInfo.appendChild(actionButtons);

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
window.showPage = showPage;
window.changePage = changePage; 
window.toggleProfileDropdown = toggleProfileDropdown;
window.logout = logout; 
window.saveMoreInfo = saveMoreInfo; // Expose the save function

document.addEventListener('DOMContentLoaded', init);
