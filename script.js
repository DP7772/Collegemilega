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
    
    // New Buttons
    const nextBtn = document.getElementById('next-btn');
    const prevBtn = document.getElementById('prev-btn');
    const backBtn = document.getElementById('back-btn');

    // Logic Variables
    let currentPage = 0;
    const itemsPerPage = 15;
    // 60 Dummy Colleges for Pagination
    const allColleges = Array.from({ length: 60 }, (_, i) => `Universe College ${i + 1} - System X`);

    // --- 2. SOUND HANDLER ---
    const playSound = (file) => {
        const audio = new Audio(file);
        audio.play().catch(e => console.log("Audio Blocked/Missing:", file));
    };

    // --- 3. STARFIELD BACKGROUND ---
    const setSize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    setSize();
    window.addEventListener('resize', setSize);

    const stars = Array.from({ length: 300 }).map(() => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 3 + 0.5
    }));

    function animateStars() {
        ctx.fillStyle = 'black'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        stars.forEach(star => {
            ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill();
            star.y -= star.speed;
            if(star.y < 0) { star.y = canvas.height; star.x = Math.random() * canvas.width; }
        });
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
            playSound('Cinematic Boom.wav'); // SOUND 1: DHADAAM
            
            mainText.classList.add('visible');
            setTimeout(() => { hud.classList.add('visible'); }, 1000);
            setTimeout(() => { document.body.classList.remove('shake'); }, 500);
        }, 1500);
    });

    // --- 5. INPUT & MAGMA LOGIC ---
    const inputs = [
        document.getElementById('input-rank'),
        document.getElementById('input-caste'),
        document.getElementById('input-course'),
        document.getElementById('input-quota')
    ];

    function checkInputs() {
        let filledCount = 0;
        inputs.forEach(input => {
            if(input.value !== "") {
                filledCount++;
                input.parentElement.classList.add('filled');
            } else {
                input.parentElement.classList.remove('filled');
            }
        });

        // Reset Sword
        sword.classList.remove('level-1', 'level-2', 'level-3', 'level-4');

        if(filledCount >= 1) sword.classList.add('level-1');
        if(filledCount >= 2) sword.classList.add('level-2');
        if(filledCount >= 3) sword.classList.add('level-3');
        if(filledCount === 4) {
            sword.classList.add('level-4');
            magma.classList.add('active'); // LAVA ON
            launchBtn.classList.add('active'); // BUTTON ON
        } else {
            magma.classList.remove('active');
            launchBtn.classList.remove('active');
        }
    }
    inputs.forEach(inp => { inp.addEventListener('input', checkInputs); inp.addEventListener('change', checkInputs); });

    // --- 6. LAUNCH SEQUENCE ---
    launchBtn.addEventListener('click', () => {
        if(!launchBtn.classList.contains('active')) return;

        playSound('Swoosh.wav'); // SOUND 2: SWOOSH

        hud.style.opacity = '0';
        mainText.style.opacity = '0';
        magma.style.opacity = '0';

        sword.classList.add('launching');

        setTimeout(() => {
            const flash = document.createElement('div');
            flash.classList.add('white-flash');
            document.body.appendChild(flash);
            
            setTimeout(() => { sword.style.display = 'none'; }, 500);
            setTimeout(() => { flash.remove(); }, 1000);
        }, 600);

        setTimeout(() => {
            showSpacePage(0); // Load Results
            spaceView.classList.add('visible');
        }, 1500);
    });

    // --- 7. SPACE NAVIGATION & PAGINATION ---
    function showSpacePage(pageIndex) {
        currentPage = pageIndex;
        honeycomb.innerHTML = "";
        
        const start = pageIndex * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = allColleges.slice(start, end);

        prevBtn.disabled = currentPage === 0;
        nextBtn.disabled = end >= allColleges.length;

        pageItems.forEach((col, index) => {
            const hex = document.createElement('div');
            hex.classList.add('hex');
            hex.innerText = col;
            hex.style.animationDelay = `${index * 0.1}s`; 
            
            setTimeout(() => { hex.classList.add('show'); }, 50);
            
            hex.addEventListener('click', () => {
                document.getElementById('col-name').innerText = col;
                document.getElementById('college-details-panel').style.display = 'block';
                playSound('ui_click.mp3');
            });
            honeycomb.appendChild(hex);
        });
    }

    nextBtn.addEventListener('click', () => { showSpacePage(currentPage + 1); });
    prevBtn.addEventListener('click', () => { showSpacePage(currentPage - 1); });

    // --- 8. RETURN TO EARTH (BACK BUTTON) ---
    backBtn.addEventListener('click', () => {
        playSound('Swoosh.wav');
        spaceView.classList.remove('visible');
        document.getElementById('college-details-panel').style.display = 'none';

        setTimeout(() => {
            sword.style.display = 'block';
            sword.classList.remove('launching');
            sword.classList.remove('animate-drop');
            void sword.offsetWidth; // Reset Animation
            
            hud.style.opacity = '1';
            mainText.style.opacity = '1';
            magma.style.opacity = '1';
        }, 800);
    });

    // Close Details Panel
    window.closePanel = () => {
        document.getElementById('college-details-panel').style.display = 'none';
    };

    // --- 9. NAVBAR & ABOUT LOGIC ---
    const aboutBtn = document.getElementById('open-about');
    const closeAboutBtn = document.getElementById('close-about');
    const aboutModal = document.getElementById('about-modal');
    const typingArea = document.getElementById('typing-area');
    
    // *** UPDATED MISSION LOG TEXT ***
    const aboutText = `> SYSTEM: COLLEGEMILEGA PROTOCOL\n> DATA: 2024-25 MERIT LIST\n> MISSION: Decrypting academic futures based on historical merit data.\n\n> HOW TO USE:\n1. Enter Rank.\n2. Select Details.\n3. Choose Course.\n4. Click CHECK FUTURE.\n\n> RESULTS GUIDE:\n[GREEN] = SAFE ZONE (High Probability)\n[ORANGE] = BORDERLINE (50-50 Chance)\n\n> STATUS: ONLINE_`;

    let i = 0;
    let typingInterval;

    function typeWriter() {
        if (i < aboutText.length) {
            // New line handling
            if(aboutText.charAt(i) === '\n') {
                typingArea.innerHTML += '<br>';
            } else {
                typingArea.innerHTML += aboutText.charAt(i);
            }
            i++;
        } else {
            clearInterval(typingInterval);
        }
    }

    aboutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        aboutModal.classList.add('active');
        playSound('ui_click.mp3'); // Optional sound
        
        // Reset and Start Typing
        typingArea.innerHTML = '';
        i = 0;
        clearInterval(typingInterval);
        typingInterval = setInterval(typeWriter, 30); // Speed of typing
    });

    closeAboutBtn.addEventListener('click', () => {
        aboutModal.classList.remove('active');
        clearInterval(typingInterval);
    });

    // Close on outside click
    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) {
            aboutModal.classList.remove('active');
            clearInterval(typingInterval);
        }
    });
});
