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
    const filterContainer = document.querySelector('.filter-container'); // To hide filters

    // Logic Variables
    let currentPage = 0;
    const itemsPerPage = 15;
    let liveData = []; // Backend data yahan aayega

    // --- 2. SOUND HANDLER ---
    const playSound = (file) => {
        const audio = new Audio(file);
        audio.play().catch(e => {}); // Silent catch
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
        if(!launchBtn.classList.contains('active')) return;

        playSound('Swoosh.wav');
        hud.style.opacity = '0'; mainText.style.opacity = '0'; magma.style.opacity = '0';
        
        // Hide Filters initially (Confirmed only mode)
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
                liveData = data.data; // Store Backend Data
                currentPage = 0;
                renderSpaceGrid(); 
                spaceView.classList.add('visible');
                
                // Agar koi college nahi mila
                if(liveData.length === 0) {
                    alert("No Confirmed Colleges found for this Rank. Try editing inputs.");
                    backBtn.click();
                }
            } else {
                alert("System Error: " + (data.error || "Unknown"));
                backBtn.click();
            }
        })
        .catch(err => {
            console.error("Fetch Error:", err);
            alert("Connection Failed. Check Internet.");
            backBtn.click();
        });
    });

    // --- 7. RENDER RESULTS (UPDATED FOR FULL DATA) ---
    function renderSpaceGrid() {
        honeycomb.innerHTML = "";
        
        const start = currentPage * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = liveData.slice(start, end);

        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = end >= liveData.length;

        pageItems.forEach((col, index) => {
            const hex = document.createElement('div');
            hex.className = `hex safe`; 
            hex.innerText = col.name;
            hex.style.animationDelay = `${index * 0.1}s`; 
            
            setTimeout(() => { hex.classList.add('show'); }, 50);
            
            // --- CLICK EVENT: SHOW FULL KUNDLI ---
            hex.addEventListener('click', () => {
                const panel = document.getElementById('college-details-panel');
                
                // HTML Create karo dynamic data ke sath
                panel.innerHTML = `
                    <h2>${col.name}</h2>
                    
                    <div class="detail-row">
                        <span class="detail-label">INSTITUTE TYPE</span>
                        <span class="detail-value">${col.type}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">PREDICTION</span>
                        <span class="detail-value" style="color:cyan">100% CONFIRMED</span>
                    </div>

                    <div class="year-grid">
                        <div class="year-box">
                            <span class="year-title">2024 CUTOFF</span>
                            <div class="rank-data">Open: ${col.details.y24.open}</div>
                            <div class="rank-data">Close: ${col.details.y24.close}</div>
                        </div>
                        <div class="year-box">
                            <span class="year-title">2025 CUTOFF</span>
                            <div class="rank-data">Open: ${col.details.y25.open}</div>
                            <div class="rank-data">Close: ${col.details.y25.close}</div>
                        </div>
                    </div>

                    <button id="close-panel-btn" onclick="closePanel()">CLOSE SYSTEM</button>
                `;
                
                panel.style.display = 'block';
                playSound('ui_click.mp3');
            });
            honeycomb.appendChild(hex);
        });
    }

    // Window function for closing
    window.closePanel = () => { 
        document.getElementById('college-details-panel').style.display = 'none'; 
    };

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

    // --- 9. NAVBAR & MISSION LOG ---
    const aboutBtn = document.getElementById('open-about');
    const closeAboutBtn = document.getElementById('close-about');
    const aboutModal = document.getElementById('about-modal');
    const typingArea = document.getElementById('typing-area');
    
    const aboutText = `> SYSTEM: COLLEGEMILEGA PROTOCOL\n> DATA: 2024-25 MERIT LIST\n> MISSION: Showing CONFIRMED admissions based on historical data.\n\n> HOW TO USE:\n1. Enter Rank.\n2. Select Details.\n3. Choose Course.\n4. Click CHECK FUTURE.\n\n> NOTE: Only colleges with high probability are displayed.\n\n> STATUS: ONLINE_`;

    let i = 0; let typingInterval;
    function typeWriter() {
        if (i < aboutText.length) {
            if(aboutText.charAt(i) === '\n') typingArea.innerHTML += '<br>';
            else typingArea.innerHTML += aboutText.charAt(i);
            i++;
        } else clearInterval(typingInterval);
    }

    aboutBtn.addEventListener('click', (e) => {
        e.preventDefault(); aboutModal.classList.add('active'); playSound('ui_click.mp3');
        typingArea.innerHTML = ''; i = 0; clearInterval(typingInterval);
        typingInterval = setInterval(typeWriter, 30);
    });

    closeAboutBtn.addEventListener('click', () => { aboutModal.classList.remove('active'); clearInterval(typingInterval); });
    aboutModal.addEventListener('click', (e) => { if (e.target === aboutModal) { aboutModal.classList.remove('active'); clearInterval(typingInterval); }});
});
