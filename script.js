const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get('story') || 'zombie_run_rin';
const currentStory = typeof allStories !== 'undefined' ? allStories[storyId] : null;

// --- 1. SYSTEM VARIABLES ---
let gameState = {
    hp: 100, sanity: 100, food: 100, 
    relationship: 50,
    ammo: 0,
    inventory: [], maxSlots: 3,
    day: 1, 
    // [แก้ใหม่] เก็บเวลาเป็นนาทีรวม (11:30 = 11*60 + 30 = 690)
    time: 690, 
    infected: false, noise: 0,
    currentSceneId: 'start',
    flags: {},
    combat: { active: false, name: "", hp: 0, maxHp: 0 }
};

const ITEM_EFFECTS = {
    "ปลากระป๋อง": { food: 30, msg: "กินปลากระป๋อง (+30 Food)", sfx: "sounds/eat.mp3" },
    "น้ำเปล่า": { sanity: 10, food: 10, msg: "ดื่มน้ำ (+10 Food/Sanity)", sfx: "sounds/drink.mp3" },
    "ขนมปัง": { food: 15, msg: "กินขนมปัง (+15 Food)", sfx: "sounds/eat.mp3" },
    "ช็อกโกแลต": { sanity: 20, rel: 10, msg: "แบ่งช็อกโกแลตให้น้อง (+20 Sanity, +10 Rin)", sfx: "sounds/eat.mp3" },
    "กล่องพยาบาล": { hp: 50, cure: true, msg: "ทำแผล (+50 HP, รักษาเชื้อ)", sfx: "sounds/heal.mp3" },
    "ไม้เบสบอล": { msg: "อาวุธสำหรับต่อสู้", sfx: "sounds/search.mp3" },
    "กุญแจรถยนต์": { msg: "กุญแจรถของพี่วินัย", sfx: "sounds/key.mp3" }
};

const NOISE_LEVELS = ["Silent 🤫", "Low 🔉", "Loud 🔊"];

// Elements
const sfxEl = document.getElementById('sfx-audio');
const sceneElements = {
    narrative: document.getElementById('narrative-box'),
    dialogueContainer: document.getElementById('dialogue-container'),
    speakerName: document.getElementById('speaker-name'),
    speakerText: document.getElementById('speaker-text'),
    icon: document.getElementById('scene-icon'),
    choices: document.getElementById('choices-area'),
    inv: document.getElementById('inventory-display'),
    enemyHud: document.getElementById('enemy-hud'),
    enemyName: document.getElementById('enemy-name'),
    enemyHpText: document.getElementById('enemy-hp-text'),
    enemyBar: document.getElementById('bar-enemy'),
    dmgPopup: document.getElementById('damage-popup')
};

function playUiSound() { if(sfxEl) { sfxEl.src = "sounds/ui_click.mp3"; sfxEl.volume = 0.5; sfxEl.play().catch(()=>{}); } }
function playEffectSound(soundFile) { if(sfxEl && soundFile) { sfxEl.src = soundFile; sfxEl.volume = 1.0; sfxEl.play().catch(()=>{}); } else { playUiSound(); } }

function updateHUD() {
    document.getElementById('val-hp').innerText = gameState.hp;
    document.getElementById('val-sanity').innerText = gameState.sanity;
    document.getElementById('val-food').innerText = gameState.food;
    document.getElementById('val-rel').innerText = gameState.relationship;
    document.getElementById('val-ammo').innerText = gameState.ammo;
    document.getElementById('val-slots').innerText = `${gameState.inventory.length}/${gameState.maxSlots}`;
    
    // [แก้ใหม่] ระบบคำนวณเวลาแบบนาที
    let totalMinutes = gameState.time;
    let hour = Math.floor(totalMinutes / 60) % 24;
    let minute = totalMinutes % 60;
    
    // แปลงให้เป็น format 00:00
    let timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    let period = (hour >= 6 && hour < 12) ? "Morning ☀️" : 
                 (hour >= 12 && hour < 18) ? "Afternoon ⛅" : "Night 🌑";

    document.getElementById('day-display').innerText = `📅 Day ${gameState.day}`;
    document.getElementById('time-display').innerText = `${timeStr} | ${period}`;

    document.getElementById('bar-hp').style.width = gameState.hp + '%';
    document.getElementById('bar-sanity').style.width = gameState.sanity + '%';
    document.getElementById('bar-food').style.width = gameState.food + '%';
    document.getElementById('bar-rel').style.width = gameState.relationship + '%';

    // Combat HUD
    if (gameState.combat.active) {
        sceneElements.enemyHud.classList.remove('hidden');
        sceneElements.enemyName.innerText = gameState.combat.name;
        sceneElements.enemyHpText.innerText = `${gameState.combat.hp}/${gameState.combat.maxHp}`;
        let percent = Math.max(0, (gameState.combat.hp / gameState.combat.maxHp) * 100);
        sceneElements.enemyBar.style.width = percent + '%';
    } else {
        if(sceneElements.enemyHud) sceneElements.enemyHud.classList.add('hidden');
    }

    sceneElements.inv.innerHTML = gameState.inventory.map((item, index) => 
        `<div class="inv-item" onclick="openItemMenu('${item}', ${index})">🔹 ${item}</div>`
    ).join('');

    if (hour >= 19 || hour < 6) document.body.classList.add('theme-night');
    else document.body.classList.remove('theme-night');
}

// --- ITEM SYSTEM ---
const itemModal = document.getElementById('item-modal');
const itemNameDisplay = document.getElementById('item-name-display');
const discardBtn = document.getElementById('btn-discard-action');

function openItemMenu(item, index) {
    playUiSound();
    itemNameDisplay.innerText = item;
    discardBtn.onclick = () => discardItem(index);

    const effect = ITEM_EFFECTS[item];
    let existingUseBtn = document.querySelector('.btn-use');
    if (effect && (effect.food || effect.hp || effect.sanity || effect.rel)) {
        if (!existingUseBtn) {
            existingUseBtn = document.createElement('button');
            existingUseBtn.className = 'btn-use';
            existingUseBtn.innerText = 'ใช้ (Use)';
            document.querySelector('.item-actions').prepend(existingUseBtn); 
        }
        existingUseBtn.style.display = 'block';
        existingUseBtn.onclick = () => useItem(item, index);
    } else {
        if (existingUseBtn) existingUseBtn.style.display = 'none';
    }
    itemModal.classList.remove('hidden');
}

function closeItemModal() { itemModal.classList.add('hidden'); }

function useItem(item, index) {
    const data = ITEM_EFFECTS[item];
    if (!data) return;
    playEffectSound(data.sfx);
    
    if (data.food) gameState.food += data.food;
    if (data.hp) gameState.hp += data.hp;
    if (data.sanity) gameState.sanity += data.sanity;
    if (data.rel) gameState.relationship += data.rel;
    if (data.cure) gameState.infected = false;

    gameState.inventory.splice(index, 1);
    checkStatsLimits();
    updateHUD();
    closeItemModal();
    showMessage(`✅ ${data.msg}`);
}

function discardItem(index) {
    playEffectSound("sounds/trash.mp3");
    const removedItem = gameState.inventory[index];
    gameState.inventory.splice(index, 1);
    updateHUD();
    closeItemModal();
    showMessage(`🗑️ ทิ้ง ${removedItem} แล้ว`);
}

// --- LOGIC ---
function checkStatsLimits() {
    if (gameState.hp > 100) gameState.hp = 100;
    if (gameState.sanity > 100) gameState.sanity = 100;
    if (gameState.food > 100) gameState.food = 100;
    if (gameState.relationship > 100) gameState.relationship = 100;
    if (gameState.relationship < 0) gameState.relationship = 0; 
    if (gameState.food < 0) gameState.food = 0;
}

// [แก้ใหม่] รับค่าเป็นนาที (Minutes)
function processTimePass(minutes) {
    if (!minutes) return;
    gameState.time += minutes;
    
    // ทุก 60 นาที อาหารลด 5 (เฉลี่ย)
    // ดังนั้น 1 นาที อาหารลด 0.08 (ปัดเศษเอา) หรือลดทุกๆ 1 ชั่วโมง
    if (gameState.time % 60 === 0) {
        gameState.food -= 5;
    }

    // เช็คข้ามวัน (24 * 60 = 1440 นาที)
    if (gameState.time >= 1440 * gameState.day) { 
        gameState.day++; 
        gameState.sanity -= 10; 
        showMessage("🌙 วันใหม่..."); 
    }
    
    if (gameState.infected) { 
        // ติดเชื้อลดเลือดทุกชั่วโมง
        if (gameState.time % 60 === 0) {
             gameState.hp -= 5; 
             showMessage(`⚠️ ติดเชื้อ! HP -5`); 
        }
    }
}

function checkConditions(choice) {
    if (choice.reqItem && !gameState.inventory.includes(choice.reqItem)) return false;
    return true;
}

function applyEffect(choice) {
    let msg = [];
    let effect = choice.effect;
    let timePass = choice.timePass || 0;

    processTimePass(timePass);

    if (effect) {
        if (effect.hp) gameState.hp += effect.hp;
        if (effect.sanity) gameState.sanity += effect.sanity;
        if (effect.food) gameState.food += effect.food;
        if (effect.rel) gameState.relationship += effect.rel;
        if (effect.getItem && gameState.inventory.length < gameState.maxSlots) {
             gameState.inventory.push(effect.getItem); msg.push(`ได้: ${effect.getItem}`);
        }
        if (effect.loseItem) {
            const idx = gameState.inventory.indexOf(effect.loseItem);
            if (idx > -1) gameState.inventory.splice(idx, 1);
        }
        
        // Combat Damage
        if (effect.damage && gameState.combat.active) {
            gameState.combat.hp -= effect.damage;
            msg.push(`💥 โจมตี ${effect.damage}!`);
            if(sceneElements.dmgPopup) {
                sceneElements.dmgPopup.innerText = `-${effect.damage}`;
                sceneElements.dmgPopup.classList.remove('hidden');
                setTimeout(() => sceneElements.dmgPopup.classList.add('hidden'), 800);
            }
        }
    }
    checkStatsLimits();
    updateHUD();
    return msg;
}

function showMessage(txt) {
    const el = document.getElementById('status-msg');
    el.innerText = txt;
    setTimeout(() => el.innerText = "", 4000);
}

function loadScene(sceneId) {
    if (gameState.hp <= 0) return loadScene('game_over_dead');
    if (gameState.sanity <= 0) return loadScene('game_over_insane');
    if (gameState.food <= 0) return loadScene('game_over_starve');

    const scene = currentStory.scenes[sceneId];
    if (!scene) { console.error("Scene not found:", sceneId); return; }

    // Update Combat State
    if (scene.combatInit) {
        gameState.combat.active = true;
        gameState.combat.name = scene.combatInit.name;
        gameState.combat.maxHp = scene.combatInit.hp;
        gameState.combat.hp = scene.combatInit.hp;
    } else if (scene.combatEnd) {
        gameState.combat.active = false;
    }

    window.currentSceneData = scene;
    gameState.currentSceneId = sceneId; 
    
    sceneElements.narrative.innerText = scene.text;
    
    if (scene.talk) {
        sceneElements.dialogueContainer.classList.remove('hidden');
        
        let displayName = scene.speaker || "???";
        let displayTalk = scene.talk;
        let nameColorClass = 'speaker-label';

        if (displayName.includes("ริน") && gameState.relationship <= 20) {
            displayName = "👧 น้องริน (โหมดปากแจ๋ว)"; 
            const coldResponses = ["...", "ชิ!", "ไอคนใจดำ...", "อย่ามายุ่ง", "หึ...", "ไปให้พ้น...", "เกลียดพี่...", "(เมินหน้าหนี)"];
            displayTalk = coldResponses[Math.floor(Math.random() * coldResponses.length)];
            nameColorClass += ' toxic'; 
        } 
        else if (displayName.includes("วินัย")) {
            nameColorClass += ' vinai';
        }

        sceneElements.speakerName.innerText = displayName;
        sceneElements.speakerName.className = nameColorClass;
        sceneElements.speakerText.innerText = `"${displayTalk}"`;
        
    } else {
        sceneElements.dialogueContainer.classList.add('hidden');
    }

    sceneElements.icon.innerText = scene.icon || "❓";
    sceneElements.choices.innerHTML = '';
    
    if (scene.choices) {
        scene.choices.forEach(choice => {
            if (checkConditions(choice)) {
                const btn = document.createElement('button');
                let tag = "";
                if (choice.reqItem) tag += ` [ใช้ ${choice.reqItem}]`;
                if (choice.timePass) tag += ` [⏳ ${choice.timePass} นาที]`; // แสดงหน่วยเป็นนาที
                if (choice.effect) {
                    if (choice.effect.damage) tag += ` [⚔️ ${choice.effect.damage}]`;
                    if (choice.effect.rel < 0) tag += ` [💔 น้องเกลียด]`;
                    if (choice.effect.rel > 0) tag += ` [💕 น้องชอบ]`;
                }
                btn.innerHTML = `➤ ${choice.text} <small>${tag}</small>`;
                btn.className = 'choice-btn';
                btn.onclick = () => { playEffectSound(choice.sfx); handleChoice(choice); }; 
                sceneElements.choices.appendChild(btn);
            }
        });
    }
    updateHUD();
}

function handleChoice(choice) {
    let fullStory = window.currentSceneData.text;
    if(window.currentSceneData.talk) fullStory += `\n\n[${window.currentSceneData.speaker}]: ${window.currentSceneData.talk}`;
    
    document.getElementById('m-story-en').innerText = "Situation Summary";
    document.getElementById('m-story-th').innerText = fullStory;
    document.getElementById('m-story-read').innerText = window.currentSceneData.en || "";

    document.getElementById('m-choice-en').innerText = "Your Action";
    document.getElementById('m-choice-th').innerText = choice.text;
    document.getElementById('m-choice-read').innerText = choice.en || "";

    let previewTxt = "";
    if (choice.effect) {
        if (choice.effect.hp) previewTxt += `HP ${choice.effect.hp} | `;
        if (choice.effect.damage) previewTxt += `Dmg ${choice.effect.damage} | `;
        if (choice.effect.rel) previewTxt += `Rin ${choice.effect.rel > 0 ? '+' : ''}${choice.effect.rel} | `;
    }
    document.getElementById('m-effect-preview').innerText = previewTxt;

    const nextBtn = document.getElementById('modal-next-btn');
    nextBtn.onclick = () => {
        playUiSound();
        const m = document.getElementById('translation-modal');
        m.classList.remove('show'); setTimeout(() => m.classList.add('hidden'), 200);
        
        if (choice.combatEnd) {
            gameState.combat.active = false;
            updateHUD(); 
        }

        const msgs = applyEffect(choice);
        
        if (gameState.combat.active && gameState.combat.hp <= 0 && choice.winId) {
             showMessage("🏆 ศัตรูถูกกำจัดแล้ว!");
             setTimeout(() => loadScene(choice.winId), 500); 
        } else {
             if(msgs && msgs.length > 0) showMessage(msgs.join(" | "));
             loadScene(choice.nextId);
        }
    };
    const m = document.getElementById('translation-modal');
    m.classList.remove('hidden'); setTimeout(() => m.classList.add('show'), 10);
}

// Init
const SAVE_KEY = 'survival_save_runrin_' + storyId;
function saveGameData() { localStorage.setItem(SAVE_KEY, JSON.stringify({state: gameState, timestamp: new Date().toLocaleString()})); playUiSound(); showMessage("💾 Game Saved!"); }
function loadGameData() { const saved = localStorage.getItem(SAVE_KEY); if (saved) { gameState = JSON.parse(saved).state; updateHUD(); loadScene(gameState.currentSceneId); document.getElementById('start-overlay').style.display = 'none'; showMessage("📂 Loaded!"); } }
function resetSaveData() { if(confirm("Delete save?")) { localStorage.removeItem(SAVE_KEY); location.reload(); } }
const hasSave = localStorage.getItem(SAVE_KEY);
const btnContinue = document.getElementById('btn-continue');
const btnReset = document.getElementById('btn-reset-save');
if (hasSave) { btnContinue.classList.remove('hidden'); btnReset.classList.remove('hidden'); btnContinue.onclick = () => { playUiSound(); loadGameData(); }; btnReset.onclick = () => { playUiSound(); resetSaveData(); }; }
const homeBtn = document.getElementById('home-btn');
if (homeBtn) homeBtn.onclick = () => { playUiSound(); setTimeout(() => window.location.href = 'index.html', 150); };
function openGuide() { playUiSound(); document.getElementById('guide-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('guide-modal').classList.add('show'), 10); }
function closeGuide() { document.getElementById('guide-modal').classList.remove('show'); setTimeout(() => document.getElementById('guide-modal').classList.add('hidden'), 300); }
document.getElementById('btn-newgame').addEventListener('click', () => {
    playUiSound();
    document.getElementById('start-overlay').style.display = 'none';
    gameState = { hp: 100, sanity: 100, food: 100, relationship: 50, ammo: 0, inventory: [], maxSlots: 3, day: 1, time: 690, infected: false, noise: 0, currentSceneId: currentStory.startNode, flags: {}, combat: { active: false, name: "", hp: 0, maxHp: 0 } };
    updateHUD();
    loadScene(currentStory.startNode);
});