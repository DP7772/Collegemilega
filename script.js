document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. SETUP & VARIABLES ---
    const canvas = document.getElementById('space');
    const ctx = canvas.getContext('2d');
    
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const sword = document.getElementById('sword');
    const mainText = document.getElementById('main-text');
    const hud = document.getElementById('hud');
    const magma = document.getElementById('magma');
    const launchBtn = document.getElementById('launch-btn');
    const spaceView = document.getElementById('space-view');
    const honeycomb = document.getElementById('honeycomb');
    
    // Controls
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    const backBtn = document.getElementById('back-btn');
    const filterContainer = document.querySelector('.filter-container'); 

    // Custom Toast Elements
    const toast = document.getElementById('system-toast');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');

    // Logic Variables
    let currentPage = 0;
    const itemsPerPage = 15;
    let liveData = []; 

    // --- 2. SOUND HANDLER ---
    const playSound = (file) => {
        const audio = new Audio(file);
        audio.play().catch(e => {}); 
    };

    // --- 🔥 NEW: CUSTOM TOAST FUNCTION (With Alertbeep.wav) ---
    const showToast = (message, isError = false) => {
        // 1. Text Set Karo
        toastMsg.innerText = message;
        
        // 2. Style Set Karo (Error vs Info)
        if (isError) {
            toast.classList.add('error');
            toastIcon.innerText = "⚠️";
            // 🔥 Yahan tera sound bajega
            playSound('Alertbeep.wav'); 
        } else {
            toast.classList.remove('error');
            toastIcon.innerText = "ℹ️";
            playSound('ui_click.mp3'); 
        }

        // 3. Show (Slide Up)
        toast.classList.add('active');

        // 4. Auto Hide after 3 seconds
        setTimeout(() => {
            toast.classList.remove('active');
        }, 3000);
    };

    // --- 3. STARFIELD BACKGROUND ---
    const setSize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    setSize(); window.addEventListener('resize', setSize);
    const stars = Array.from({ length: 300 }).map(() => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, size: Math.random() * 2, speed: Math.random() * 3 + 0.5 }));
    function animateStars() {
        ctx.fillStyle = 'black'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        stars.forEach(star => { ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill(); star.y -= star.speed; if(star.y < 0) { star.y = canvas.height; star.x = Math.random() * canvas.width; } });
        requestAnimationFrame(animateStars);
    }
    animateStars();

    // --- 4. START SEQUENCE ---
    startBtn.addEventListener('click', () => {
        startScreen.style.opacity = '0';
        setTimeout(() => { startScreen.style.display = 'none'; }, 500);
        sword.classList.add('animate-drop');
        setTimeout(() => {
            document.body.classList.add('shake');
            playSound('Cinematic Boom.wav');
            mainText.classList.add('visible');
            setTimeout(() => { hud.classList.add('visible'); }, 1000);
            setTimeout(() => { document.body.classList.remove('shake'); }, 500);
        }, 1500);
    });

    // --- 5. INPUT CHECK ---
    const inputs = document.querySelectorAll('input, select');
    function checkInputs() {
        let filledCount = 0;
        inputs.forEach(input => {
            if(input.value !== "") { filledCount++; input.parentElement.classList.add('filled'); }
            else { input.parentElement.classList.remove('filled'); }
        });
        sword.classList.remove('level-1', 'level-2', 'level-3', 'level-4');
        if(filledCount >= 1) sword.classList.add('level-1');
        if(filledCount >= 2) sword.classList.add('level-2');
        if(filledCount >= 3) sword.classList.add('level-3');
        if(filledCount === 4) {
            sword.classList.add('level-4'); magma.classList.add('active'); launchBtn.classList.add('active');
        } else {
            magma.classList.remove('active'); launchBtn.classList.remove('active');
        }
    }
    inputs.forEach(inp => { inp.addEventListener('input', checkInputs); inp.addEventListener('change', checkInputs); });

    // --- 6. LAUNCH & FETCH DATA ---
    launchBtn.addEventListener('click', () => {
        if(!launchBtn.classList.contains('active')) {
            // 🔥 Error Alert (Plays Alertbeep.wav)
            showToast("FILL ALL FIELDS TO INITIALIZE WARP!", true); 
            return;
        }

        playSound('Swoosh.wav');
        hud.style.opacity = '0'; mainText.style.opacity = '0'; magma.style.opacity = '0';
        
        if(filterContainer) filterContainer.style.display = 'none';

        sword.classList.add('launching');

        setTimeout(() => {
            const f = document.createElement('div'); f.className = 'white-flash'; document.body.appendChild(f);
            setTimeout(() => { sword.style.display = 'none'; }, 500);
            setTimeout(() => { f.remove(); }, 1000);
        }, 600);

        // --- FETCH START ---
        const requestData = {
            rank: document.getElementById('input-rank').value,
            caste: document.getElementById('input-caste').value,
            course: document.getElementById('input-course').value,
            quota: document.getElementById('input-quota').value
        };

        fetch('/.netlify/functions/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        })
        .then(response => response.json())
        .then(data => {
            if(data.success) {
                liveData = data.data; 
                currentPage = 0;
                renderSpaceGrid(); 
                spaceView.classList.add('visible');
                
                if(liveData.length === 0) {
                    showToast("NO CONFIRMED COLLEGES FOUND.", true); // 🔥 Error Sound
                    setTimeout(() => backBtn.click(), 2000);
                } else {
                    showToast(`ACCESS GRANTED: ${liveData.length} COLLEGES FOUND`, false); // Success Sound
                }
            } else {
                showToast("SYSTEM ERROR: " + (data.error || "Unknown"), true); // 🔥 Error Sound
                backBtn.click();
            }
        })
        .catch(err => {
            console.error("Fetch Error:", err);
            showToast("CONNECTION FAILED. CHECK INTERNET.", true); // 🔥 Error Sound
            backBtn.click();
        });
    });

    // --- 7. RENDER RESULTS ---
    function renderSpaceGrid() {
        honeycomb.innerHTML = "";
        
        const start = currentPage * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = liveData.slice(start, end);

        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = end >= liveData.length;

        pageItems.forEach((col, index) => {
            const hex = document.createElement('div');
            const isSafe = col.status.includes('Confirmed');
            hex.className = isSafe ? 'hex safe' : 'hex risky'; 
            hex.style.borderColor = isSafe ? '#00ff00' : '#ffae00';
            hex.style.boxShadow = `0 0 10px ${isSafe ? '#00ff00' : '#ffae00'}`;

            hex.innerText = col.name;
            hex.style.animationDelay = `${index * 0.1}s`; 
            
            setTimeout(() => { hex.classList.add('show'); }, 50);
            
            hex.addEventListener('click', () => {
                const panel = document.getElementById('college-details-panel');
                
                panel.innerHTML = `
                    <h2 style="color: cyan; border-bottom: 2px solid cyan; padding-bottom: 10px; font-size: 1.5rem; text-align: center;">${col.name}</h2>
                    
                    <div style="background: rgba(0,20,40,0.6); padding: 15px; border-radius: 8px; margin: 15px 0; text-align: left; border: 1px solid cyan;">
                        <p style="margin: 5px 0; font-size: 1.1rem; color: #fff;">
                            <span style="color: cyan; font-weight: bold;">COURSE:</span> ${col.course}
                        </p>
                        <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                            <p style="margin: 0; color: #ccc;">
                                <span style="color: cyan; font-weight: bold;">CAT:</span> ${col.category}
                            </p>
                            <p style="margin: 0; color: #ccc;">
                                <span style="color: cyan; font-weight: bold;">QUOTA:</span> ${col.quota}
                            </p>
                        </div>
                        <p style="margin: 10px 0 0 0; color: #ccc;">
                            <span style="color: cyan; font-weight: bold;">TYPE:</span> ${col.type}
                        </p>
                    </div>

                    <div class="detail-row" style="text-align: center; margin: 15px 0;">
                        <span class="detail-value" style="color:${isSafe ? '#00ff00' : '#ffae00'}; font-size: 1.2rem; border: 1px dashed ${isSafe ? '#00ff00' : '#ffae00'}; padding: 8px 15px; border-radius: 5px; display: block;">
                            ${col.status}
                        </span>
                    </div>

                    <div class="year-grid" style="display: flex; gap: 10px; justify-content: center;">
                        <div class="year-box" style="flex: 1; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 5px; text-align: center;">
                            <span class="year-title" style="color: cyan; display: block; margin-bottom: 5px; font-weight: bold;">2024 CUTOFF</span>
                            <div class="rank-data" style="color: white;">Open: ${col.details.y24.open}</div>
                            <div class="rank-data" style="color: white;">Close: ${col.details.y24.close}</div>
                        </div>
                        <div class="year-box" style="flex: 1; background: rgba(0,0,0,0.5); padding: 10px; border-radius: 5px; text-align: center;">
                            <span class="year-title" style="color: cyan; display: block; margin-bottom: 5px; font-weight: bold;">2025 CUTOFF</span>
                            <div class="rank-data" style="color: white;">Open: ${col.details.y25.open}</div>
                            <div class="rank-data" style="color: white;">Close: ${col.details.y25.close}</div>
                        </div>
                    </div>

                    <button id="close-panel-btn" onclick="closePanel()" style="background: linear-gradient(45deg, #ff0000, #990000); color: white; width: 100%; padding: 12px; border: none; margin-top: 20px; cursor: pointer; font-weight: bold; border-radius: 5px; box-shadow: 0 0 10px red;">CLOSE SYSTEM</button>
                `;
                
                panel.style.display = 'block';
                playSound('ui_click.mp3');
            });
            honeycomb.appendChild(hex);
        });
    }

    window.closePanel = () => { document.getElementById('college-details-panel').style.display = 'none'; };

    nextBtn.addEventListener('click', () => { playSound('Sci-Fi.wav'); currentPage++; renderSpaceGrid(); });
    prevBtn.addEventListener('click', () => { playSound('Sci-Fi.wav'); currentPage--; renderSpaceGrid(); });

    // --- 8. RETURN ---
    backBtn.addEventListener('click', () => {
        playSound('Swoosh.wav');
        spaceView.classList.remove('visible');
        document.getElementById('college-details-panel').style.display = 'none';

        setTimeout(() => {
            sword.style.display = 'block';
            sword.classList.remove('launching');
            sword.classList.remove('animate-drop');
            void sword.offsetWidth; 
            
            hud.style.opacity = '1';
            mainText.style.opacity = '1';
            magma.style.opacity = '1';
        }, 800);
    });

    window.closePanel = () => { document.getElementById('college-details-panel').style.display = 'none'; };

   // --- 9. MISSION LOG & CAREER GUIDANCE (UPDATED) ---
    const aboutBtn = document.getElementById('open-about');
    const closeAboutBtn = document.getElementById('close-about');
    const aboutModal = document.getElementById('about-modal');
    const typingArea = document.getElementById('typing-area');
    
    // 🔥 UPDATED TEXT: Positions tool as AI Career Guidance
    const aboutText = `
> SYSTEM: COLLEGEMILEGA_V2.0
> MODULE: AI_CAREER_GUIDANCE
> DATA SOURCE: 2024-25 MERIT DATABASE

--------------------------------------------------
[ 1 ] MISSION OBJECTIVE
--------------------------------------------------
To empower engineering aspirants with data-driven career 
guidance. We eliminate the guesswork from admissions by 
analyzing multi-year cutoff trends.

--------------------------------------------------
[ 2 ] HOW TO READ THE DATA
--------------------------------------------------
> 🟢 GREEN HEXAGON (SAFE ZONE):
  High Probability. Your rank qualifies in BOTH 
  2024 & 2025. Recommended for choice filling.

> 🟠 ORANGE HEXAGON (RISKY ZONE):
  Borderline Probability. Your rank qualifies in 
  only ONE year. Keep as backup options.

--------------------------------------------------
[ 3 ] GUIDANCE INSTRUCTIONS
--------------------------------------------------
1. ENTER DETAILS: Input Rank, Category & Course.
2. ANALYZE: The system filters thousands of records.
3. DECIDE: Click any college to view specific Cutoffs.
4. PLAN: Use 'Safe' colleges as your primary targets.

> SYSTEM STATUS: READY FOR QUERY_
`;

    let i = 0; 
    let typingInterval;

    // Typewriter Function (Improved)
    function typeWriter() {
        if (i < aboutText.length) {
            const char = aboutText.charAt(i);
            
            // Handle Line Breaks for HTML
            if (char === '\n') {
                typingArea.innerHTML += '<br>'; 
            } else {
                typingArea.innerHTML += char;
            }
            
            // Auto-scroll to bottom as it types
            typingArea.scrollTop = typingArea.scrollHeight;
            i++;
        } else {
            clearInterval(typingInterval); // Stop when done
        }
    }

    // Open Modal Logic (Resets every time)
    aboutBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        
        // Show Modal
        aboutModal.classList.add('active'); 
        playSound('ui_click.mp3'); 
        
        // --- RESET LOGIC (Shuru se shuru) ---
        typingArea.innerHTML = ''; // Clear old text
        i = 0; // Reset counter
        clearInterval(typingInterval); // Stop any running timer
        
        // Start Typing (Speed: 15ms)
        typingInterval = setInterval(typeWriter, 15); 
    });

    // Close Button Logic
    closeAboutBtn.addEventListener('click', () => { 
        aboutModal.classList.remove('active'); 
        clearInterval(typingInterval); // Stop typing immediately
    });

    // Outside Click Close Logic
    aboutModal.addEventListener('click', (e) => { 
        if (e.target === aboutModal) { 
            aboutModal.classList.remove('active'); 
            clearInterval(typingInterval); 
        }
    });
