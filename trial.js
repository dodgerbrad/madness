// --- CONFIGURATION & GLOBALS ---
const depURL = "https://script.google.com/macros/s/AKfycbyz7fSuE0DdFBWCAQQTNCBn__480wbKxjqCZHKxTiM35zsC63NCER7WgT4_0SQwO3uWnw/exec";
const STORAGE_KEY = "ncaaDraftProgress_2026_global";

let bettors = [];
let totalRounds = 0;
let totalPicks = 0;
let draftOrder = [];
let availableTeams = [];
let currentPickIndex = 0;
let draftHistory = []; // Snapshots for Undo
let recordedPicks = []; // THE ACTUAL PICKS TO SEND AT THE END

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    const restored = loadDraftFromLocal();
    if (restored) {
        console.log("Draft restored from LocalStorage.");
        refreshAllDisplays();
    } else {
        document.getElementById('setup-controls').style.display = 'block';
        document.getElementById('draft-controls').style.display = 'none';
        await fetchTeams();
    }
});

async function fetchTeams() {
    try {
        // Assume your script provides the list of available teams
        const response = await fetch(`${depURL}?action=getCategories`);
        availableTeams = await response.json();
        populateGlobalTeamSelector();
    } catch (e) { console.error("Teams failed to load", e); }
}

async function initializeDraftOrder() {
    const masterValue = document.getElementById("masterName").value.trim();
    const namesInput = document.getElementById('bettorNamesInput').value;
    if (masterValue === "" || !namesInput) return alert("Please fill all fields!");

    // NEW: Check if the name exists in your spreadsheet before starting
    try {
        const checkUrl = `${depURL}?action=checkName&name=${encodeURIComponent(masterValue)}`;
        const response = await fetch(checkUrl);
        const result = await response.json();

        if (result.exists) {
            alert(`The name "${masterValue}" is already taken. Please choose a unique Commissioner name.`);
            return; // Stops the function here so the draft doesn't start
        }
    } catch (e) {
        console.error("Database check failed, but proceeding anyway:", e);
    }

    // --- CONTINUING EXISTING LOGIC ---
    bettors = namesInput.split(',').map(name => name.trim()).filter(Boolean);
    totalRounds = parseInt(document.getElementById("numRows").value, 10);
    totalPicks = bettors.length * totalRounds;
    currentPickIndex = 0;

    // Generate Serpentine Order
    draftOrder = [];
    for (let i = 1; i <= totalPicks; i++) {
        let turn = getSerpentineNumber(i, bettors.length);
        draftOrder.push(bettors[turn - 1]);
    }

    // Build the table
    const tableBody = document.querySelector("#dynamicTable tbody");
    tableBody.innerHTML = '';
    for (let i = 1; i <= totalPicks; i++) {
        let row = document.createElement('tr');
        row.id = `pick-row-${i}`;
        row.innerHTML = `<td>${i}</td><td>${draftOrder[i - 1]}</td><td class="team-picked-cell"></td>`;
        tableBody.appendChild(row);
    }

    document.getElementById('setup-controls').style.display = 'none';
    document.getElementById('draft-controls').style.display = 'block';
    document.getElementById('total-picks-display').textContent = totalPicks;

    populateGlobalTeamSelector();
    refreshAllDisplays();
    saveDraftToLocal();
    updateUndoButtonState();
}


// --- GLOBAL PICKING LOGIC ---

function populateGlobalTeamSelector() {
    const select = document.getElementById("team-selector");
    select.innerHTML = '<option value="">-- Select a Team --</option>';
    availableTeams.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}



function recordCurrentPickGlobal() {
    if (currentPickIndex >= totalPicks) return alert("Draft complete!");

    const teamSelector = document.getElementById("team-selector");
    const pickedValue = teamSelector.value;

    // Save for Undo history
    saveStateToHistory();

    const pickNumber = currentPickIndex + 1;
    const currentBettor = draftOrder[currentPickIndex];
    if (!pickedValue) return alert("Please select a team!");
    
    const lastPickDiv = document.getElementById("last-pick-display");
    lastPickDiv.style.color = "#155724"; // Success Green
    lastPickDiv.style.fontWeight = "bold";
    lastPickDiv.innerHTML = `✅ Confirmed: ${currentBettor} selected ${pickedValue}`;

    // 2. RESTART the animation
    lastPickDiv.classList.remove("animate-flash");
    void lastPickDiv.offsetWidth; // This "magic" line forces the browser to reset the animation
    lastPickDiv.classList.add("animate-flash");

    // 1. Update UI
    // Note: The index in the draftOrder starts at 0, but your row IDs seem to start at 1 based on 'pickNumber'
    const row = document.getElementById(`pick-row-${pickNumber}`); 
    if (row) { // Added a safety check
        row.querySelector('.team-picked-cell').textContent = pickedValue;
        row.style.backgroundColor = "#fde8e8";

        // OPTIONAL: Add your red animation class to the row as well
        row.classList.add("animate-flash");

        // === ADD THE SCROLL FEATURE HERE ===
        row.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' // Centers the selected row in the viewport
        });
        // ===================================
    }
    
    // 2. Add to the batch array
    recordedPicks.push({
        betterName: currentBettor,
        playerPicked: pickedValue,
        draftNo: pickNumber
    });

    // 3. Increment index and filter teams
    availableTeams = availableTeams.filter(team => team !== pickedValue);
    currentPickIndex++;

    // 4. CRITICAL: Save to LocalStorage IMMEDIATELY
    saveDraftToLocal();

    // 5. Refresh UI
    populateGlobalTeamSelector();
    refreshAllDisplays();
    updateUndoButtonState();
    
    // Optional: Focus the selector immediately for the next pick
    teamSelector.focus();
}




// --- UNDO & PERSISTENCE ---

function saveStateToHistory() {
    // We only need to save the index and available teams now, much easier!
    const currentStateSnapshot = {
        availableTeams: [...availableTeams],
        currentPickIndex: currentPickIndex
    };
    draftHistory.push(currentStateSnapshot);
    if (draftHistory.length > 20) draftHistory.shift();
}

function undoLastPick() {
    if (draftHistory.length === 0 || currentPickIndex === 0) return;

    const previousState = draftHistory.pop();

    // 1. Remove the last recorded pick from the BATCH array
    recordedPicks.pop();

    // 2. Clear the UI row
    const rowToClear = document.getElementById(`pick-row-${currentPickIndex}`);
    if (rowToClear) {
        rowToClear.querySelector('.team-picked-cell').textContent = '';
        // Ensure this resets the color
        rowToClear.style.backgroundColor = "";

        // Remove the flash class if you added it
        rowToClear.classList.remove("animate-flash");
    }

    // 3. Restore Local State
    currentPickIndex = previousState.currentPickIndex;
    availableTeams = previousState.availableTeams;

    populateGlobalTeamSelector();
    refreshAllDisplays();
    updateUndoButtonState();
    saveDraftToLocal();
    // --- UPDATE THE DISPLAY ---
    const lastPickDiv = document.getElementById("last-pick-display");


    lastPickDiv.style.color = "#721c24"; // Warning Red
    lastPickDiv.innerHTML = `⚠️ Last pick was undone. Waiting for new selection...`;
    lastPickDiv.classList.remove("animate-flash");
    void lastPickDiv.offsetWidth; // This "magic" line forces the browser to reset the animation
    lastPickDiv.classList.add("animate-flash");


}


function updateUndoButtonState() {
    const btn = document.getElementById('undo-button');
    if (btn) {
        // Only disable if we are at the very start of the draft
        btn.disabled = (currentPickIndex === 0);
        btn.style.display = "inline-block"; // Force visibility
    }
}

function saveDraftToLocal() {
    const state = {
        masterName: document.getElementById("masterName").value,
        bettors, totalRounds, currentPickIndex, draftOrder,
        totalPicks, availableTeams, recordedPicks // Ensure this is here
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}


// --- UPDATED LOAD FUNCTION ---
function loadDraftFromLocal() {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (!savedState) return false;

    const state = JSON.parse(savedState);

    // Restore Data
    bettors = state.bettors;
    totalRounds = state.totalRounds;
    draftOrder = state.draftOrder;
    totalPicks = state.totalPicks;
    availableTeams = state.availableTeams;

    // IMPORTANT: Restore the batch array so we don't lose history or double-post
    recordedPicks = state.recordedPicks || [];

    // IMPORTANT: Restore currentPickIndex to the ACTUAL next pick
    // If recordedPicks has 5 items, currentPickIndex should be 5 (pointing to the 6th slot)
    currentPickIndex = recordedPicks.length;

    // Restore Setup Inputs
    document.getElementById("masterName").value = state.masterName;
    document.getElementById('bettorNamesInput').value = bettors.join(', ');
    document.getElementById("numRows").value = totalRounds;

    // Rebuild Table Rows with saved data
    const tableBody = document.querySelector("#dynamicTable tbody");
    tableBody.innerHTML = '';

    for (let i = 1; i <= totalPicks; i++) {
        let row = document.createElement('tr');
        row.id = `pick-row-${i}`;

        // Find if this pick was already saved in our batch array
        const pastPick = recordedPicks.find(p => p.draftNo === i);
        const teamName = pastPick ? pastPick.playerPicked : '';

        row.innerHTML = `
            <td>${i}</td>
            <td>${draftOrder[i - 1]}</td>
            <td class="team-picked-cell">${teamName}</td>
        `;

        if (teamName) {
            row.style.backgroundColor = "#e8f5e9";
            row.classList.add('completed-pick');
        }
        tableBody.appendChild(row);
    }

    // Show Draft UI
    document.getElementById('setup-controls').style.display = 'none';
    document.getElementById('draft-controls').style.display = 'block';

    populateGlobalTeamSelector();
    refreshAllDisplays(); // This will now show the CORRECT next picker
    updateUndoButtonState();
    if (recordedPicks.length > 0) {
        const last = recordedPicks[recordedPicks.length - 1];
        const lastPickDiv = document.getElementById("last-pick-display");
        lastPickDiv.innerHTML = `Last Recorded: ${last.betterName} took ${last.playerPicked}`;
    }

    // FIX: Manually restore the total picks number to the UI
    const totalDisplay = document.getElementById('total-picks-display');
    if (totalDisplay) {
        // Use state.totalPicks from your saved localStorage object
        totalDisplay.textContent = state.totalPicks || 0;
    }
    return true;

}



// --- UTILITY AND DISPLAY HELPERS ---

function getSerpentineNumber(pickNum, totalBettors) {
    const round = Math.ceil(pickNum / totalBettors);
    const posInRound = (pickNum - 1) % totalBettors;

    if (round % 2 === 0) {
        return totalBettors - posInRound;
    } else {
        return posInRound + 1;
    }
}

function refreshAllDisplays() {
    if (currentPickIndex >= totalPicks) {
        document.getElementById('current-bettor-display').textContent = "Draft Complete!";
        
        document.getElementById('finish-button').style.display = 'inline-block';
        return;
    }

    const nextBettorName = draftOrder[currentPickIndex];
    const nextPickNumber = currentPickIndex + 1;
    // Re-apply red background to any row that already has a recorded pick
    recordedPicks.forEach(pick => {
        const row = document.getElementById(`pick-row-${pick.draftNo}`);
        if (row) {
            row.style.backgroundColor = "#fde8e8";
            row.querySelector('.team-picked-cell').textContent = pick.playerPicked;
        }
    });

    document.getElementById('current-bettor-display').textContent = `${nextBettorName}`;
    document.getElementById('current-pick-number-display').textContent = nextPickNumber;
    document.getElementById('global-pick-area').style.display = 'block';
}

function finishAndClearDraft() {
    if (confirm("Are you sure you want to finish the draft and clear the local data? This action is permanent.")) {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
    }
}

/**
 * NEW: Send everything at once!
 * Call this from your "Finish Draft" button.
 */
function sendAllPicksToGoogle() {
    if (recordedPicks.length === 0) return alert("No picks to submit!");

    const masterName = document.getElementById("masterName").value;
    if (!confirm(`Submit all ${recordedPicks.length} picks?`)) return;

    fetch(depURL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
            master: masterName,
            action: "batchAddPicks",
            picks: recordedPicks
        })
    });

    alert("Picks submitted successfully!");

    // CHANGE: Instead of hiding the whole area, just style the submit button
    const submitBtn = document.getElementById('finish-button');
    submitBtn.style.backgroundColor = "#4CAF50";
    submitBtn.textContent = "Submitted ✓";
    document.getElementById('global-pick-area').style.display = 'none';
    submitBtn.disabled = true; // Prevents double submission
    const undoButton = document.getElementById("undo-button");
    undoButton.disabled = true;
}



window.initializeDraftOrder = initializeDraftOrder;
window.recordCurrentPickGlobal = recordCurrentPickGlobal;
window.undoLastPick = undoLastPick;
window.finishAndClearDraft = finishAndClearDraft;
