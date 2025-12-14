let userId = localStorage.getItem('animeTrackerUserId'); // Load userId from storage
const watched = [];
let currentController = null;

// New Global Variables for Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;


// -------------------
// NEW PROFILE LOGIC (Moved to the top for clarity)
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
        // Note: The actual username is not stored globally, so setting it from the login
        // function is the correct approach. Keeping 'originiti' as fallback here.
        document.getElementById('profile-username').textContent = 'originiti'; 
        
        loadWatched();
        // Set default page view to Watched or Search
        showPage('watched'); 
    }
    
    // Set up general event listeners 
    document.getElementById('va-lang').addEventListener('change', renderWatchedList);
    
    // NEW: Add event listeners for the Notes modal buttons
    document.getElementById('notes-save-btn').addEventListener('click', saveNotes);
    document.getElementById('notes-close-btn').addEventListener('click', closeNotesModal);
    
    // Close modal if user clicks outside of it
    document.getElementById('notes-modal').addEventListener('click', (event) => {
        if (event.target === event.currentTarget) {
            closeNotesModal();
        }
    });

    // --- CRITICAL PROFILE/NOTIFICATION EVENT LISTENERS (Moved from window.onload) ---
    const notificationButton = document.getElementById('notification-trigger');
    const profileButton = document.getElementById('profile-button-trigger');

    // Attach the notification handler with stopPropagation
    if (notificationButton) {
        notificationButton.addEventListener('click', handleNotificationClick);
    }
    
    // Attach the profile handler to the container
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
    // ---------------------------------------------------------------------------------
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
// NOTE: Assuming your HTML still has the inline oninput="searchAnime()"
// I recommend replacing that with this:
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
                // NOTE: 'notes' column is now automatically included in the DB fetch
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
// Read More/Less Toggle Function (Final version with scroll fix)
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
        // --- FIX: Store Scroll Position to prevent screen jumping ---
        const scrollY = window.scrollY; 
        
        // Temporarily hide, force browser reflow, then restore display
        gridContainer.style.display = 'none'; 
        void gridContainer.offsetWidth; // Force browser reflow/recalculation
        gridContainer.style.display = 'grid'; 
        
        // --- FIX: Restore Scroll Position ---
        window.scrollTo(0, scrollY);
    }
}

// -------------------
// Notes Modal Functions
// -------------------
let currentAnimeIdForNotes = null;

function openNotesModal(animeId, currentNotes) {
    currentAnimeIdForNotes = animeId;
    const modal = document.getElementById('notes-modal');
    const textarea = document.getElementById('notes-textarea');
    
    // Set current notes content
    textarea.value = currentNotes || '';
    modal.style.display = 'block';
}

function closeNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
    currentAnimeIdForNotes = null;
}

function saveNotes() {
    if (currentAnimeIdForNotes) {
        const notes = document.getElementById('notes-textarea').value;
        // Call the new API function
        updateNotes(currentAnimeIdForNotes, notes); 
        closeNotesModal();
    }
}

async function updateNotes(animeId, notes) {
    if (!userId) {
        alert("You must be logged in to save notes.");
        return;
    }
    
    try {
        const res = await fetch('/update-notes', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, animeId, notes })
        });
        const data = await res.json();
        
        if (data.success) {
            // Find the item in the local 'watched' array and update its notes
            const item = watched.find(a => String(a.anime_id) === String(animeId));
            if (item) {
                item.notes = notes;
            }
            // Re-render the list to reflect the change (button text update)
            renderWatchedList(); 
        } else {
            alert(`Failed to save notes: ${data.error}`);
        }
    } catch (err) {
        console.error("Update notes API failed:", err);
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

        // --- IMAGE DISPLAY FIX ---
        const imageUrl = anime.coverImage || anime.CoverImage || anime.coverimage;
        if(imageUrl && imageUrl.length > 10) { 
            // 1. Create the container
            const imageContainer = document.createElement('div');
            imageContainer.className = 'anime-cover-container';
            
            // 2. Create the image
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = anime.anime_title;
            img.className = 'anime-cover';
            
            // 3. Append image to container, container to list item
            imageContainer.appendChild(img);
            li.appendChild(imageContainer);
        }
        // --- END IMAGE DISPLAY FIX ---

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

        // Description Text (Clips based on CSS max-height)
        const descriptionText = document.createElement('i');
        descriptionText.className = 'anime-description-text';
        descriptionText.textContent = anime.description || 'No description available.';
        descriptionWrapper.appendChild(descriptionText);

        // Read More Button
        // Check if description is long enough
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
        
        // --- NEW LOGIC: RENDER VAs AND COUNT THEM ---
        let actualVACount = 0;
        
        vaList.forEach(va=>{
            // va is "Character1, Character2: VA Name"
            const parts = va.split(': ');
            const vaName = parts[1]?.trim() || '';
            
            if(vaName){
                let vaHtml = va;
                
                // Check if the VA name is shared
                if(vaCount[vaName]>1) {
                    vaHtml = va.replace(vaName, `<span class="highlight">${vaName}</span>`);
                }
                
                const vaSpan = document.createElement('span');
                vaSpan.className = 'va';
                vaSpan.innerHTML = vaHtml;
                vaTagsContainer.appendChild(vaSpan);
                actualVACount++; // Count the successfully rendered VA tag
            }
        });
        animeInfo.appendChild(vaTagsContainer);

        // --- DYNAMIC HEIGHT ADJUSTMENT ---
        // If there are 2 or fewer VA tags, increase the description's visible height 
        // to fill the empty space left by fewer VA tags.
        if (actualVACount <= 2) {
            // Overrides the default CSS max-height of 7em with 10em (about 3 more lines)
            descriptionText.style.maxHeight = '10em'; 
        }

        // --- End Dynamic Height Adjustment ---

        // --- Action Buttons Container ---
        
        // 1. Remove Button (Created here, but appended to actionButtons)
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeAnime(anime.anime_id));
        
        // 2. Notes Button
        const notesBtn = document.createElement('button');
        notesBtn.className = 'notes-btn';
        notesBtn.textContent = anime.notes && anime.notes.length > 0 ? 'Edit Notes' : 'Add Note';
        notesBtn.addEventListener('click', () => {
            openNotesModal(anime.anime_id, anime.notes);
        });

        // 3. Group buttons
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        actionButtons.appendChild(notesBtn);
        actionButtons.appendChild(removeBtn);

        animeInfo.appendChild(actionButtons); // Append the group to the info container

        // --- End Action Buttons Container ---

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
window.searchAnime = actualSearchAnime; // Exposing the actual search function
window.removeAnime = removeAnime;
window.showPage = showPage;
window.changePage = changePage; 
// Removed window.toggleProfileDropdown/window.logout since they are exposed via the DOMContentLoaded setup
window.toggleProfileDropdown = toggleProfileDropdown; // Re-expose for clarity if needed, though event listener handles it
window.logout = logout; 

// Change entry point from window.onload to DOMContentLoaded for defer compatibility and better practice
document.addEventListener('DOMContentLoaded', init);
