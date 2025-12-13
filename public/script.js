let userId = null;
const watched = [];
let currentController = null;

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
  alert(data.success ? "Registered!" : data.error);
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
    document.getElementById('auth').style.display='none';
    document.getElementById('main').style.display='block';
    loadWatched();
  } else alert(data.error);
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
  
  // Client-side cleanup for description (though server-side cleanup is now the main defense)
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
// Load watched anime
// -------------------
async function loadWatched(){
  if (!userId) return; // Prevent fetching if not logged in
  try {
    const res = await fetch(`/watched/${userId}`);
    const data = await res.json();
    watched.length=0;
    if(data.success){
      
      data.data.forEach(a=>{
        // 🟢 FIX: Ensure JSON.parse handles null or undefined voice_actors gracefully
        try {
          a.voice_actors_parsed = JSON.parse(a.voice_actors);
        } catch(e){
          // Fallback for old/malformed/empty data
          a.voice_actors_parsed = { japanese: "", english: "" };
        }
        watched.push(a);
      });

      highlightSharedVAs();
    }
  } catch(err){
    console.error("Load watched failed:", err);
  }
}

// -------------------
// Highlight shared VAs
// -------------------
function highlightSharedVAs(){
  const vaLang = document.getElementById('va-lang').value;
  const vaCount = {};
  watched.forEach(a=>{
    // Ensure the language property exists before trying to split it
    const vaString = a.voice_actors_parsed[vaLang] || ""; 
    vaString.split('|').filter(Boolean).forEach(va=>{
      if(va){
        // The string is "Char1, Char2: VA Name". Get the VA name only.
        const vaName = va.split(': ')[1]?.trim(); 
        if(vaName){
          vaCount[vaName] = (vaCount[vaName]||0)+1;
        }
      }
    });
  });

  const list = document.getElementById('watched-list');
  list.innerHTML = ''; // Clear list to rebuild with highlights

  watched.forEach(anime => {
    // Rebuild the HTML structure for each anime
    const li = document.createElement('li');
    let html = '';

    // Image Display: Robust check for the image URL when reading from DB.
    const imageUrl = anime.coverImage || anime.CoverImage || anime.coverimage;

    // CRITICAL FIX: Ensure the string exists and has content before creating the tag
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
            // This ensures the aggregated list of characters stays outside the highlight.
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
}

// -------------------
// VA language toggle
// -------------------
document.getElementById('va-lang').addEventListener('change', loadWatched);

// -------------------
// Expose functions globally
// -------------------
window.register = register;
window.login = login;
window.searchAnime = actualSearchAnime;
window.removeAnime = removeAnime;
