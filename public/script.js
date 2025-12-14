let userId = localStorage.getItem('animeTrackerUserId'); // Load userId from storage
const watched = []; // The main array holding all user-tracked anime
let currentController = null; // For search query abortion

// Global Variables for Pagination
const ITEMS_PER_PAGE = 9;
let currentPage = 1;
let totalPages = 1;

// Stores the currently focused anime when the detail modal is open
let currentAnimeIdForDetails = null;

// New function to initialize the app (run on page load)
function init() {
    if (userId) {
        // If userId is found, skip auth screen and go to main app
        document.getElementById('auth').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        loadWatched();
        showPage('watched'); // Set default page view to Watched
    }
    
    // Set up event listeners 
    document.getElementById('va-lang').addEventListener('change', renderWatchedList);
    document.getElementById('sort-by').addEventListener('change', renderWatchedList); 
    
    // Add event listeners for the Detail modal buttons
    document.getElementById('detail-save-btn').addEventListener('click', saveDetailChanges);
    document.getElementById('detail-close-btn').addEventListener('click', closeDetailModal);
    
    // Close modal if user clicks outside of it
    document.getElementById('anime-detail-modal').addEventListener('click', (event) => {
        if (event.target === event.currentTarget) {
            closeDetailModal();
        }
    });

    // Set up pagination buttons
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
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
// Notification System
// -------------------
function showNotification(message) {
    const popup = document.getElementById('notification-pop-up');
    popup.textContent = message;
    popup.style.display = 'block';
    
    // Optional: Add a class for specific styling if needed
    // popup.classList.add('success');
    
    setTimeout(() => {
        popup.style.display = 'none';
    }, 3000); // Hide after 3 seconds
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
        // localStorage.setItem('animeTrackerUsername', username); // Optional: Store username
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
        // localStorage.setItem('animeTrackerUsername', username); // Optional: Store username
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

    // Special handling for pages that need data refresh
    if (pageId === 'watched' || pageId === 'watchlist') {
        renderWatchedList(); 
    } else if (pageId === 'profile') {
        loadProfile(); 
    }
}

// -------------------
// PAGINATION LOGIC
// -------------------
function changePage(delta) {
    const newPage = currentPage + delta;
    // Determine which list is currently active
    const listToUse = document.getElementById('page-watchlist').style.display !== 'none' ? 'watchlist' : 'watched';
    
    // Recalculate totalPages based on the currently filtered/sorted list
    let listData = [...watched];
    if (listToUse === 'watchlist') {
        listData = listData.filter(a => !a.finish_date || a.status === 'Plan to Watch');
    } else {
        listData = listData.filter(a => a.finish_date || a.status === 'Completed');
    }

    totalPages = Math.ceil(listData.length / ITEMS_PER_PAGE);

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
            li.innerText = `${title} (Score: ${anime.averageScore || 'N/A'})`;
            
            // Store all necessary data on the element itself for persistence
            li.dataset.anime = JSON.stringify(anime);
            li.onclick = (e) => { 
                const animeData = JSON.parse(e.currentTarget.dataset.anime);
                addAnime(animeData);
            } 
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
    const rating = (anime.averageScore || 0) / 10;
    
    let description = anime.description || '';
    const characters = anime.characters.edges;
    const coverImage = anime.coverImage?.large || anime.CoverImage?.large || ''; // Handle potential casing issues

    try {
        const res = await fetch('/add-anime',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({userId, animeId:anime.id, animeTitle, rating, description, characters, coverImage})
        });
        const data = await res.json();
        
        if(data.success) {
            loadWatched(); // Refresh the local list
            showNotification(`${animeTitle} added to your list!`);
            
            // CRITICAL: Do NOT clear the search-results or anime-search. 
            // The search results persist, fulfilling the requirement.
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
        if(data.success) {
            loadWatched();
            showNotification("Anime removed from list.");
        }
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
        watched.length=0;
        if(data.success){
            
            data.data.forEach(a=>{
                try {
                    // FIX: Ensure JSON.parse handles null or undefined voice_actors gracefully
                    a.voice_actors_parsed = JSON.parse(a.voice_actors || '{}');
                } catch(e){
                    a.voice_actors_parsed = { japanese: "", english: "" };
                }
                // NOTE: 'notes', 'user_rating', 'start_date', 'finish_date' are assumed to be present from the DB fetch
                watched.push(a);
            });

            // If a list page is currently visible, render it immediately
            if (document.getElementById('page-watched').style.display !== 'none' ||
                document.getElementById('page-watchlist').style.display !== 'none') {
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

    // Force Grid Recalculation (Critical for preserving row alignment)
    const gridContainer = document.getElementById('watched-list') || document.getElementById('watchlist-items');
    if (gridContainer) {
        const scrollY = window.scrollY; 
        
        // Use requestAnimationFrame for smoother DOM manipulation
        requestAnimationFrame(() => {
            gridContainer.style.display = 'none'; 
            void gridContainer.offsetWidth; // Force reflow
            gridContainer.style.display = 'grid'; 
            window.scrollTo(0, scrollY);
        });
    }
}


// -------------------
// Detail Modal Functions (Rating, Dates, Notes)
// -------------------
function openDetailModal(anime) {
    currentAnimeIdForDetails = anime.anime_id;
    const modal = document.getElementById('anime-detail-modal');
    
    // Set data in the modal
    document.getElementById('modal-anime-title').textContent = anime.anime_title;
    document.getElementById('user-rating').value = anime.user_rating || '';
    
    // Format dates to YYYY-MM-DD for input[type=date]
    document.getElementById('start-date').value = anime.start_date ? anime.start_date.split('T')[0] : ''; 
    document.getElementById('finish-date').value = anime.finish_date ? anime.finish_date.split('T')[0] : '';
    
    document.getElementById('notes-textarea').value = anime.notes || '';
    
    modal.style.display = 'block';
}

function closeDetailModal() {
    document.getElementById('anime-detail-modal').style.display = 'none';
    currentAnimeIdForDetails = null;
}

async function saveDetailChanges() {
    if (!currentAnimeIdForDetails) return;

    const userRating = document.getElementById('user-rating').value;
    const startDate = document.getElementById('start-date').value || null;
    const finishDate = document.getElementById('finish-date').value || null;
    const notes = document.getElementById('notes-textarea').value;
    
    // Convert to number or null, basic validation
    const parsedRating = userRating ? parseFloat(userRating) : null;

    if (parsedRating !== null && (parsedRating < 1 || parsedRating > 10)) {
        alert("Rating must be between 1 and 10.");
        return;
    }

    try {
        const res = await fetch('/update-details', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId, 
                animeId: currentAnimeIdForDetails, 
                userRating: parsedRating, 
                startDate, 
                finishDate, 
                notes 
            })
        });
        const data = await res.json();
        
        if (data.success) {
            // Find the item in the local 'watched' array and update its notes
            const item = watched.find(a => String(a.anime_id) === String(currentAnimeIdForDetails));
            if (item) {
                item.user_rating = parsedRating;
                item.start_date = startDate;
                item.finish_date = finishDate;
                item.notes = notes;
                // Optional: Update global rating if you want to allow user to modify it, but sticking to user_rating.
            }
            showNotification(`Details for ${item.anime_title} saved successfully!`);
            renderWatchedList(); 
        } else {
            alert(`Failed to save details: ${data.error}`);
        }
    } catch (err) {
        console.error("Update details API failed:", err);
    }
    closeDetailModal();
}

// -------------------
// Sort Logic
// -------------------
function sortWatchedList(list) {
    const sortBy = document.getElementById('sort-by').value;

    list.sort((a, b) => {
        switch (sortBy) {
            case 'title':
                return a.anime_title.localeCompare(b.anime_title);
            case 'date_added_desc':
                // Assuming you'd fetch the date_added from the DB if available, otherwise just use id as a proxy
                return (b.id || 0) - (a.id || 0);
            case 'user_rating_desc':
                // Treat null/0 ratings as lowest priority
                return (b.user_rating || 0) - (a.user_rating || 0);
            case 'user_rating_asc':
                return (a.user_rating || 0) - (b.user_rating || 0);
            case 'finish_date_desc':
                // Treat null/empty dates as lowest priority
                return new Date(b.finish_date || 0) - new Date(a.finish_date || 0);
            default:
                return 0;
        }
    });
    return list;
}

// -------------------
// PROFILE and FRIEND SYSTEM Placeholders
// -------------------
function loadProfile() {
    // Calculate and display simple stats
    const totalWatched = watched.length;
    const ratedAnime = watched.filter(a => a.user_rating && a.user_rating > 0);
    const avgRating = ratedAnime.length > 0 
        ? (ratedAnime.reduce((sum, a) => sum + a.user_rating, 0) / ratedAnime.length).toFixed(2) 
        : 'N/A';
        
    document.getElementById('profile-username').textContent = localStorage.getItem('animeTrackerUsername') || 'User'; // You might need to set username on login
    document.getElementById('stats-watched-count').textContent = totalWatched;
    document.getElementById('stats-avg-rating').textContent = avgRating;
    
    // searchUsers and friend management functions would be added here
}

function searchUsers() {
    const query = document.getElementById('friend-search-input').value;
    if (query.length < 3) {
        document.getElementById('user-search-results').innerHTML = '<li>Enter at least 3 characters.</li>';
        return;
    }
    // API call to /search-users?q=query&currentUserId=userId
    // renderUserSearchResults(data);
}

// -------------------
// RENDER WATCHED LIST 
// -------------------
function renderWatchedList() {
    let listToRender = [...watched]; 
    const isWatchlistPage = document.getElementById('page-watchlist').style.display !== 'none';
    
    // 1. Filtering for Watchlist vs. Watched
    if (isWatchlistPage) {
        // Filter for items without a finish date (Plan to Watch/Currently Watching)
        listToRender = listToRender.filter(a => !a.finish_date);
    } else {
        // Filter for items with a finish date (Completed)
        listToRender = listToRender.filter(a => a.finish_date);
    }
    
    // 2. Sorting
    listToRender = sortWatchedList(listToRender);
    
    // 3. Pagination Range
    const targetListElement = document.getElementById(isWatchlistPage ? 'watchlist-items' : 'watched-list');

    totalPages = Math.ceil(listToRender.length / ITEMS_PER_PAGE);
    // Adjust current page if necessary (e.g., if filtering caused the current page to disappear)
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }

    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;

    const animeToRender = listToRender.slice(start, end);
    
    // 4. VA Count (Count across ALL filtered items for highlighting accuracy)
    const vaLang = document.getElementById('va-lang').value;
    const vaCount = {};
    listToRender.forEach(a => {
        const vaString = a.voice_actors_parsed[vaLang] || "";
        vaString.split('|').filter(Boolean).forEach(va => {
            const vaName = va.split(': ')[1]?.trim();
            if (vaName) {
                vaCount[vaName] = (vaCount[vaName] || 0) + 1;
            }
        });
    });

    // 5. Render List
    targetListElement.innerHTML = ''; 

    animeToRender.forEach(anime => {
        const li = document.createElement('li');

        // --- IMAGE DISPLAY ---
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
        // --- END IMAGE DISPLAY ---

        const animeInfo = document.createElement('div');
        animeInfo.className = 'anime-info';

        // Title and Rating Display
        const title = document.createElement('b');
        const userRatingDisplay = anime.user_rating ? `⭐ ${anime.user_rating.toFixed(1)}` : 'Unrated';
        title.innerHTML = `${anime.anime_title} - ${userRatingDisplay}`;
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
        // --- End Description Wrapper ---

        // VA Tags Container
        const vaTagsContainer = document.createElement('div');
        vaTagsContainer.className = 'va-tags-container';
        
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|').filter(Boolean);
        
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
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeAnime(anime.anime_id));
        
        const detailsBtn = document.createElement('button');
        detailsBtn.className = 'notes-btn'; // Reusing notes-btn style
        detailsBtn.textContent = anime.notes && anime.notes.length > 0 ? 'Edit Details (📝)' : 'Add Details';
        detailsBtn.addEventListener('click', () => {
            openDetailModal(anime);
        });

        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        actionButtons.appendChild(detailsBtn);
        actionButtons.appendChild(removeBtn);

        animeInfo.appendChild(actionButtons); 

        li.appendChild(animeInfo);
        targetListElement.appendChild(li);
    });

    // 6. Update Pagination Controls
    document.getElementById('page-info').textContent = `Page ${totalPages > 0 ? currentPage : 0} of ${totalPages}`;
    document.getElementById('prev-page').disabled = currentPage === 1 || totalPages === 0;
    document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;
}


// -------------------
// Expose functions globally and start initialization
// -------------------
window.register = register;
window.login = login;
window.showPage = showPage;
window.changePage = changePage; 
window.searchUsers = searchUsers; // Expose friend search
window.onload = init;
