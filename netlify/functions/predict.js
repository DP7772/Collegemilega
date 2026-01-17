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
