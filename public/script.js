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
// RENDER WATCHED LIST (OLD highlightSharedVAs, now renamed and modified for pagination)
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
        // Rebuild the HTML structure for each anime
        const li = document.createElement('li');
        let html = '';

        // Image Display: Robust check for the image URL when reading from DB.
        const imageUrl = anime.coverImage || anime.CoverImage || anime.coverimage;

        if(imageUrl && imageUrl.length > 10) { 
          html += `<img src="${imageUrl}" alt="${anime.anime_title}" class="anime-cover">`;
        }
        
        html += `<div class="anime-info">`;
        html += `<b>${anime.anime_title}</b> - ${anime.rating.toFixed(2)}<br>${anime.description}<br><i>VAs:</i> `;

        // VA Display: Ensure the language property exists before trying to split
        const vaString = anime.voice_actors_parsed[vaLang] || "";
        const vaList = vaString.split('|').filter(Boolean);
        
        vaList.forEach(va=>{
            // va is "Character1, Character2: VA Name"
            const parts = va.split(': ');
            
            // parts[0] is the character list, parts[1] is the VA name
            const vaName = parts[1]?.trim() || '';
            
            if(vaName){
                // The full string is used as the display HTML
                let vaHtml = va;
                
                // Check if the VA name is shared
                if(vaCount[vaName]>1) {
                    // Find the VA name within the full string and wrap it in a highlight span
                    vaHtml = va.replace(vaName, `<span class="highlight">${vaName}</span>`);
                }
                
                html += `<span class="va">${vaHtml}</span> `;
            }
        });

        html += `<br><button class="remove-btn" onclick="removeAnime(${anime.anime_id})">Remove</button>`;
        html += `</div>`;

        li.innerHTML = html;
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
