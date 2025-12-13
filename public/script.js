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
  
  // Client-side cleanup for description
  let description = anime.description || '';

  const characters = anime.characters.edges;
  const coverImage = anime.coverImage?.large || '';

  // --- DEBUGGING STEP 1: Check data before sending ---
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
    
    // --- DEBUGGING STEP 2: Check server response ---
    console.log("Server Response:", data);
    
    if(data.success) {
        loadWatched();
        document.getElementById('search-results').innerHTML = '';
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
          a.voice_actors_parsed = { japanese: a.voice_actors || "", english: "" };
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
// Highlight shared VAs (STRICT FIX: Counts VAs across DIFFERENT anime)
// -------------------
function highlightSharedVAs(){
  const vaLang = document.getElementById('va-lang').value;
  
  // 1. Build a map of {VA Name: Set of Anime IDs they appeared in}
  const vaAnimeMap = {};
  watched.forEach(anime => {
    const animeId = anime.anime_id;
    
    // Extract unique VA names for the selected language
    const vaNamesInAnime = new Set();
    anime.voice_actors_parsed[vaLang].split('|').filter(Boolean).forEach(va=>{
        // Extract VA Name only
        const nameOnly = va.split(': ')[1]?.trim(); 
        if(nameOnly) vaNamesInAnime.add(nameOnly);
    });
    
    // Populate the map
    vaNamesInAnime.forEach(vaName => {
      vaAnimeMap[vaName] = vaAnimeMap[vaName] || new Set();
      vaAnimeMap[vaName].add(animeId);
    });
  });

  // 2. Determine which VAs are "shared" (i.e., appear in more than one anime)
  const sharedVAs = new Set();
  for (const [vaName, animeIdSet] of Object.entries(vaAnimeMap)) {
    if (animeIdSet.size > 1) {
      sharedVAs.add(vaName);
    }
  }


  const list = document.getElementById('watched-list');
  list.innerHTML = '';

  watched.forEach(anime => {
    const li = document.createElement('li');
    let html = '';

    if(anime.coverImage) {
      html += `<img src="${anime.coverImage}" alt="${anime.anime_title}" class="anime-cover">`;
    }
    html += `<div class="anime-info">`;
    html += `<b>${anime.anime_title}</b> - ${anime.rating.toFixed(2)}<br>${anime.description}<br><i>VAs:</i> `;

    const vaList = anime.voice_actors_parsed[vaLang].split('|').filter(Boolean);
    const displayedCharacters = new Set();
    
    vaList.forEach(va=>{
        const parts = va.split(': ');
        const charName = parts[0]?.trim();
        const vaName = parts[1]?.trim() || '';
        
        // 1. Only display the character once (fixes Bakugou/Midoriya duplication)
        if (displayedCharacters.has(charName)) {
            return;
        }
        displayedCharacters.add(charName);
        
        if(vaName){
            let vaHtml = `${charName}: ${vaName}`;
          
            // 2. Check if the VA is shared across different anime (fixes Brina Palencia highlight leak)
            if(sharedVAs.has(vaName)) {
                vaHtml = `${charName}: <span class="highlight">${vaName}</span>`;
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