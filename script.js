// --- 0. INITIAL SETUP ---
const urlParams = new URLSearchParams(window.location.search);
const storyId = urlParams.get('story') || 'zombie_run_rin';
const SAVE_KEY = 'survival_save_runrin_' + storyId; 
const currentStory = typeof allStories !== 'undefined' ? allStories[storyId] : null;

// --- 1. UTILITY FUNCTIONS ---
function openGuide() { 
    const modal = document.getElementById('guide-modal');
    if(modal) {
        modal.classList.remove('hidden'); 
        setTimeout(() => modal.classList.add('show'), 10); 
    }
}

function closeGuide() { 
    const modal = document.getElementById('guide-modal');
    if(modal) {
        modal.classList.remove('show'); 
        setTimeout(() => modal.classList.add('hidden'), 300); 
    }
}

function showMessage(txt) { 
    const el = document.getElementById('status-msg');
    if(el) {
        el.innerText = txt;
        setTimeout(() => el.innerText = "", 4000);
    }
}

// --- 2. GAME VARIABLES ---
let gameState = {
    hp: 100, sanity: 100, food: 100, 
    relationship: 50,
    ammo: 0,
    inventory: [], 
    maxSlots: 3,
    day: 1, time: 690, 
    infected: false, noise: 0,
    currentSceneId: 'scene_start',
    flags: {},
    combat: { active: false, name: "", hp: 0, maxHp: 0 }
};

const ITEM_DB = {
    "ปลากระป๋อง": { type: "food", max: 5, desc: "อาหารกระป๋อง กินประทังชีวิต", effect: { food: 30 }, msg: "กินปลากระป๋อง (+30 Food)", sfx: "sounds/eat.mp3" },
    "น้ำเปล่า": { type: "food", max: 5, desc: "น้ำสะอาด ดับกระหาย", effect: { sanity: 10, food: 10 }, msg: "ดื่มน้ำ (+10 Food/Sanity)", sfx: "sounds/drink.mp3" },
    "ขนมปัง": { type: "food", max: 5, desc: "ขนมปังแห้งๆ", effect: { food: 15 }, msg: "กินขนมปัง (+15 Food)", sfx: "sounds/eat.mp3" },
    "ช็อกโกแลต": { type: "food", max: 10, desc: "ของหวานเยียวยาจิตใจ", effect: { sanity: 20, rel: 10 }, msg: "แบ่งน้องกิน (+20 Sanity, +10 Rin)", sfx: "sounds/eat.mp3" },
    "กล่องพยาบาล": { type: "med", max: 2, desc: "ชุดปฐมพยาบาล รักษาติดเชื้อ", effect: { hp: 50, cure: true }, msg: "ทำแผลใหญ่ (+50 HP)", sfx: "sounds/heal.mp3" },
    "ผ้าพันแผล": { type: "med", max: 5, desc: "ผ้าก็อซห้ามเลือด เพิ่มเลือด 40%", effect: { hp: 40 }, msg: "พันแผล (+40 HP)", sfx: "sounds/heal.mp3" },
    "ไม้เบสบอล": { type: "weapon", max: 1, desc: "ไม้เนื้อแข็ง", msg: "ใช้อาวุธ", sfx: "sounds/search.mp3" },
    "มีดทำครัว": { type: "weapon", max: 1, desc: "มีดปลายแหลม คมกริบ", msg: "ใช้อาวุธ", sfx: "sounds/search.mp3" },
    "กุญแจรถยนต์": { type: "key", max: 1, desc: "กุญแจรถพี่วินัย", msg: "เก็บกุญแจ", sfx: "sounds/key.mp3" },
    "ไฟแช็ก": { type: "misc", max: 1, desc: "จุดไฟให้แสงสว่าง", msg: "เก็บไฟแช็ก", sfx: "sounds/search.mp3" }
};

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

// --- 3. SOUND & VISUAL SYSTEM ---
const uiClickSound = new Audio("sounds/click.mp3");
uiClickSound.volume = 0.5;

function playUiSound() { 
    uiClickSound.currentTime = 0;
    uiClickSound.play().catch(()=>{}); 
}

function playEffectSound(f) { 
    if(sfxEl && f) { 
        sfxEl.src = f; 
        sfxEl.volume = 1.0; 
        sfxEl.currentTime = 0; 
        sfxEl.play().catch(()=>{}); 
    } 
}

document.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('.inv-item') || e.target.closest('.choice-btn')) {
        playUiSound();
    }
}, true);

function triggerVisualEffect(type) {
    const c = document.querySelector('.game-container');
    if(c && (type==="horror"||type==="damage")) {
        c.classList.remove('shake-screen'); void c.offsetWidth; c.classList.add('shake-screen');
        setTimeout(()=>c.classList.remove('shake-screen'),500);
        let b = document.getElementById('blood-screen') || document.createElement('div');
        if(!b.id) { b.id='blood-screen'; b.className='blood-overlay'; document.body.appendChild(b); }
        b.classList.add('active'); setTimeout(()=>b.classList.remove('active'), type==="horror"?4000:1000);
    }
}

// --- 4. HUD UPDATE ---
function updateHUD() {
    if(!sceneElements.narrative) return;
    document.getElementById('val-hp').innerText = gameState.hp;
    document.getElementById('val-sanity').innerText = gameState.sanity;
    document.getElementById('val-food').innerText = gameState.food;
    document.getElementById('val-rel').innerText = gameState.relationship;
    document.getElementById('val-ammo').innerText = gameState.ammo;
    document.getElementById('val-slots').innerText = `${gameState.inventory.length}/${gameState.maxSlots}`;
    
    let tm = gameState.time, h = Math.floor(tm/60)%24, m = tm%60;
    document.getElementById('time-display').innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')} | ${h>=6&&h<12?"Morning ☀️":h>=12&&h<18?"Afternoon ⛅":"Night 🌑"}`;
    document.getElementById('day-display').innerText = `📅 Day ${gameState.day}`;

    document.getElementById('bar-hp').style.width = Math.max(0, gameState.hp)+'%';
    document.getElementById('bar-sanity').style.width = Math.max(0, gameState.sanity)+'%';
    document.getElementById('bar-food').style.width = Math.max(0, gameState.food)+'%';
    document.getElementById('bar-rel').style.width = Math.max(0, gameState.relationship)+'%';

    if(gameState.combat.active) {
        sceneElements.enemyHud.classList.remove('hidden');
        document.getElementById('enemy-name').innerText = gameState.combat.name;
        document.getElementById('enemy-hp-text').innerText = `${gameState.combat.hp}/${gameState.combat.maxHp}`;
        document.getElementById('bar-enemy').style.width = Math.max(0,(gameState.combat.hp/gameState.combat.maxHp)*100)+'%';
    } else sceneElements.enemyHud.classList.add('hidden');

    sceneElements.inv.innerHTML = gameState.inventory.map((s,i) => 
        `<div class="inv-item" onclick="openItemMenu(${i})">🔹 ${s.name||s} <span style="color:#f1c40f;font-size:0.8em;">x${s.qty||1}</span></div>`
    ).join('');
    
    if(h>=19||h<6) document.body.classList.add('theme-night'); else document.body.classList.remove('theme-night');
}

// --- 5. ITEM LOGIC ---
const itemModal = document.getElementById('item-modal');
const itemNameDisplay = document.getElementById('item-name-display');
const discardBtn = document.getElementById('btn-discard-action');

function openItemMenu(i) {
    let s = gameState.inventory[i];
    if(typeof s === 'string') { s={name:s,qty:1}; gameState.inventory[i]=s; }
    const info = ITEM_DB[s.name] || {desc:"...",max:1,type:"misc"};
    itemNameDisplay.innerText = s.name;
    document.getElementById('item-desc-area').innerHTML = `<div class="item-desc-box">${info.desc}<div class="item-stat-row"><span>📦 ${s.qty}/${info.max}</span><span>🏷️ ${info.type.toUpperCase()}</span></div></div>`;
    discardBtn.onclick=()=>discardItem(i);
    let useBtn = document.querySelector('.btn-use');
    if(info.effect) {
        if(!useBtn) { useBtn=document.createElement('button'); useBtn.className='btn-use'; useBtn.innerText='ใช้'; document.querySelector('.item-actions').prepend(useBtn); }
        useBtn.style.display='block'; useBtn.onclick=()=>useItem(i);
    } else if(useBtn) useBtn.style.display='none';
    itemModal.classList.remove('hidden');
}
function closeItemModal() { itemModal.classList.add('hidden'); }
function useItem(i) {
    let s = gameState.inventory[i], info = ITEM_DB[s.name];
    if(!info||!info.effect) return;
    playEffectSound(info.sfx);
    if(info.effect.food) gameState.food+=info.effect.food;
    if(info.effect.hp) gameState.hp+=info.effect.hp;
    if(info.effect.sanity) gameState.sanity+=info.effect.sanity;
    if(info.effect.rel) gameState.relationship+=info.effect.rel;
    s.qty--; if(s.qty<=0) gameState.inventory.splice(i,1);
    closeItemModal(); checkStatsLimits(); updateHUD(); showMessage(`✅ ${info.msg}`);
}
function discardItem(i) {
    playEffectSound("sounds/trash.mp3");
    let name = gameState.inventory[i].name||gameState.inventory[i];
    gameState.inventory.splice(i,1); updateHUD(); closeItemModal(); showMessage(`🗑️ ทิ้ง ${name}`);
}

// --- 6. FULL INVENTORY LOGIC ---
let pendingName = null;
let pendingSceneId = null; 

function handleFullInventory(n) {
    pendingName = n; 
    
    const nameEl = document.getElementById('new-item-name');
    if(nameEl) nameEl.innerText = n;
    
    const l = document.getElementById('swap-list'); 
    l.innerHTML = "";
    
    gameState.inventory.forEach((s, i) => {
        l.innerHTML += `
            <div class="swap-item-row">
                <span>📦 ${s.name||s} (x${s.qty||1})</span>
                <button class="swap-btn" onclick="swapItem(${i})">ทิ้งชิ้นนี้</button>
            </div>`;
    });

    const modal = document.getElementById('full-inv-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('show'), 10);
    
    document.getElementById('btn-ignore-new').onclick = () => { 
        modal.classList.remove('show');
        setTimeout(() => modal.classList.add('hidden'), 300);
        pendingName = null; 
        if(pendingSceneId) { loadScene(pendingSceneId); pendingSceneId = null; }
    };
}

function swapItem(i) {
    let old = gameState.inventory[i].name || gameState.inventory[i];
    gameState.inventory.splice(i, 1);
    gameState.inventory.push({name: pendingName, qty: 1});

    const modal = document.getElementById('full-inv-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.classList.add('hidden'), 300);

    updateHUD(); 
    showMessage(`♻️ ทิ้ง ${old} เก็บ ${pendingName}`); 
    pendingName = null;

    if(pendingSceneId) { loadScene(pendingSceneId); pendingSceneId = null; }
}

// --- 7. CORE LOGIC ---
function checkStatsLimits() {
    if(gameState.hp>100) gameState.hp=100;
    if(gameState.sanity>100) gameState.sanity=100;
    if(gameState.food>100) gameState.food=100;
    if(gameState.relationship>100) gameState.relationship=100;
    if(gameState.relationship<0) gameState.relationship=0;
    if(gameState.food<0) gameState.food=0;
}

function processTimePass(m) {
    if(!m) return;
    gameState.time+=m;
    if(gameState.time%60===0) gameState.food-=5;
    if(gameState.time>=1440*gameState.day) { gameState.day++; gameState.sanity-=10; showMessage("🌙 วันใหม่..."); }
    if(gameState.infected && gameState.time%60===0) { gameState.hp-=5; showMessage("⚠️ ติดเชื้อ! HP -5"); }
}

function checkConditions(c) {
    if(c.reqItem && !gameState.inventory.find(i=>(i.name===c.reqItem)||(i===c.reqItem))) return false;
    if(c.hideIf && gameState.flags[c.hideIf]) return false;
    if(c.reqFlags) { for(let f of c.reqFlags) if(!gameState.flags[f]) return false; }
    return true;
}

function applyEffect(c) {
    let msg=[], eff=c.effect, tp=c.timePass||0;
    processTimePass(tp);
    if(eff) {
        if(eff.hp) gameState.hp+=eff.hp;
        if(eff.sanity) gameState.sanity+=eff.sanity;
        if(eff.food) gameState.food+=eff.food;
        if(eff.rel) gameState.relationship+=eff.rel;
        if(eff.getItem) {
            let n=eff.getItem, amt=eff.count||1, info=ITEM_DB[n]||{max:1}, ex=gameState.inventory.find(i=>i.name===n);
            if(ex && ex.qty<info.max) { 
                let add=Math.min(amt, info.max-ex.qty); ex.qty+=add; msg.push(`ได้ ${n} x${add}`); 
            } else {
                if(gameState.inventory.length<gameState.maxSlots) { gameState.inventory.push({name:n,qty:amt}); msg.push(`ได้ ${n} x${amt}`); }
                else { handleFullInventory(n); msg.push("⚠️ กระเป๋าเต็ม!"); }
            }
        }
        if(eff.loseItem) {
            let idx=gameState.inventory.findIndex(i=>(i.name===eff.loseItem)||(i===eff.loseItem));
            if(idx>-1) {
                if(typeof gameState.inventory[idx]==='object') { gameState.inventory[idx].qty--; if(gameState.inventory[idx].qty<=0) gameState.inventory.splice(idx,1); }
                else gameState.inventory.splice(idx,1);
            }
        }
        if(eff.setFlag) gameState.flags[eff.setFlag]=true;
        if(eff.visual) triggerVisualEffect(eff.visual);
        if(eff.damage && gameState.combat.active) {
            gameState.combat.hp-=eff.damage; msg.push(`💥 โจมตี ${eff.damage}!`);
            if(sceneElements.dmgPopup) { sceneElements.dmgPopup.innerText=`-${eff.damage}`; sceneElements.dmgPopup.classList.remove('hidden'); setTimeout(()=>sceneElements.dmgPopup.classList.add('hidden'),800); }
        }
    }
    checkStatsLimits(); updateHUD(); return msg;
}

// --- 8. STORY ENGINE ---
function loadScene(id) {
    if(id !== 'game_over_dead' && gameState.hp<=0) return loadScene('game_over_dead');
    if(id !== 'game_over_insane' && gameState.sanity<=0) return loadScene('game_over_insane');
    if(id !== 'game_over_starve' && gameState.food<=0) return loadScene('game_over_starve');

    if(!currentStory || !currentStory.scenes) { console.error("Story data missing"); return; }
    const scene = currentStory.scenes[id];
    if(!scene) { console.error("Scene missing:", id); return; }

    if(scene.visual) triggerVisualEffect(scene.visual);
    if(scene.sfx) playEffectSound(scene.sfx);

    if(scene.combatInit) {
        gameState.combat={active:true, name:scene.combatInit.name, hp:scene.combatInit.hp, maxHp:scene.combatInit.hp};
    } else if(scene.combatEnd) gameState.combat.active=false;

    gameState.currentSceneId = id; 
    
    sceneElements.narrative.innerText = scene.text;
    if(scene.talk) {
        sceneElements.dialogueContainer.classList.remove('hidden');
        let sp = scene.speaker||"???", tk = scene.talk;
        let cls = 'speaker-label';
        if(sp.includes("ริน") && gameState.relationship<=20) { sp="👧 น้องริน (Toxic)"; tk="..."; cls+=" toxic"; }
        sceneElements.speakerName.innerText=sp; sceneElements.speakerName.className=cls;
        sceneElements.speakerText.innerText=`"${tk}"`;
    } else sceneElements.dialogueContainer.classList.add('hidden');

    sceneElements.icon.innerText = scene.icon||"❓";
    sceneElements.choices.innerHTML = '';
    scene.choices.forEach(c => {
        if(checkConditions(c)) {
            let btn=document.createElement('button'); btn.className='choice-btn';
            let tag=""; if(c.reqItem) tag+=` [ใช้ ${c.reqItem}]`; if(c.timePass) tag+=` [⏳ ${c.timePass}น.]`;
            btn.innerHTML=`➤ ${c.text} <small>${tag}</small>`;
            btn.onclick=()=>{ 
                if(c.onclick) { eval(c.onclick); return; } 
                handleChoice(c); 
            };
            sceneElements.choices.appendChild(btn);
        }
    });
    updateHUD();
}

function handleChoice(c) {
    if(c.sfx) playEffectSound(c.sfx);
    if(currentStory && currentStory.scenes && currentStory.scenes[gameState.currentSceneId]) {
        document.getElementById('m-story-th').innerText = currentStory.scenes[gameState.currentSceneId].text; 
    }
    document.getElementById('m-choice-th').innerText = c.text;
    document.getElementById('m-effect-preview').innerText = c.effect ? "Effect Active" : "";
    
    if(c.combatEnd) gameState.combat.active=false;
    const msgs = applyEffect(c);
    
    if(pendingName) {
        pendingSceneId = c.nextId;
    } else {
        if(msgs.length>0) showMessage(msgs.join(" | "));
        if(gameState.combat.active && gameState.combat.hp<=0 && c.winId) setTimeout(()=>loadScene(c.winId),500);
        else loadScene(c.nextId);
    }
}

// --- 9. GLOBAL FUNCTIONS (SAVE / LOAD) ---
// [IMPORTANT] สร้างเป็น window function เพื่อให้ HTML onclick เรียกใช้ได้แน่นอน
window.saveGameData = function() { 
    localStorage.setItem(SAVE_KEY, JSON.stringify({state:gameState})); 
    showMessage("💾 Saved!"); 
    console.log("Game Saved:", gameState);
};

window.loadGameData = function() {
    const s = localStorage.getItem(SAVE_KEY);
    if(s) { 
        let d = JSON.parse(s).state; 
        if(d.inventory) d.inventory = d.inventory.map(x=>(typeof x==='string'?{name:x,qty:1}:x));
        gameState=d; 
        updateHUD(); 
        loadScene(gameState.currentSceneId); 
        document.getElementById('start-overlay').style.display='none';
        showMessage("📂 Game Loaded!");
    } else {
        alert("ไม่พบเซฟเกม!");
    }
};

window.endChapterOne = function(outcome) {
    const data = {
        hp: gameState.hp, sanity: gameState.sanity, food: gameState.food,
        inventory: gameState.inventory, relationship: gameState.relationship,
        flags: gameState.flags, outcome: outcome
    };
    localStorage.setItem('hell_save_transfer', JSON.stringify(data));
    localStorage.setItem('hell_part2_unlocked', 'true');
    
    document.getElementById('start-overlay').style.display = 'flex';
    alert("🎉 จบ Part 1! ปลดล็อค Part 2 แล้ว");
    
    updateMenuButtons();
};

window.startPartTwo = function() {
    const saved = localStorage.getItem('hell_save_transfer');
    if(!saved) return alert("ไม่พบเซฟ Part 1");
    const prev = JSON.parse(saved);
    
    gameState = {
        hp: prev.hp, sanity: prev.sanity, food: prev.food, relationship: prev.relationship,
        ammo: 0, inventory: prev.inventory, maxSlots: 3,
        day: 2, time: 120, // ตี 2
        infected: false, noise: 0,
        flags: prev.flags, combat: {active:false,name:"",hp:0,maxHp:0},
        currentSceneId: (prev.outcome==='bad') ? 'part2_start_solo' : 'part2_start'
    };
    
    updateHUD();
    loadScene(gameState.currentSceneId); 
    document.getElementById('start-overlay').style.display = 'none';
};

window.startNewGame = function() {
    // 1. ล้างข้อมูลทุกอย่าง
    localStorage.removeItem('hell_part2_unlocked'); 
    localStorage.removeItem('hell_save_transfer');
    localStorage.removeItem(SAVE_KEY);

    // 2. รีเซ็ตปุ่มในเมนู
    updateMenuButtons();

    // 3. เริ่มเกมใหม่
    const overlay = document.getElementById('start-overlay');
    if(overlay) overlay.style.display = 'none';
    
    gameState = { 
        hp: 100, sanity: 100, food: 100, 
        relationship: 50, ammo: 0, 
        inventory: [], maxSlots: 3, 
        day: 1, time: 690, 
        infected: false, noise: 0, 
        currentSceneId: 'scene_start', 
        flags: {}, 
        combat: { active: false, name: "", hp: 0, maxHp: 0 } 
    };
    updateHUD(); 
    loadScene('scene_start');
    showMessage("💀 New Game Started!"); 
};

// ฟังก์ชันอัปเดตปุ่มเมนู (เรียกใช้ตอนโหลดและตอนจบ Part 1/New Game)
function updateMenuButtons() {
    const btn2 = document.getElementById('btn-part2');
    const extra = document.getElementById('extra-chapters');
    const btnCon = document.getElementById('btn-continue');

    // เช็ค Part 2 Unlock
    if(localStorage.getItem('hell_part2_unlocked') === 'true') {
        if(btn2) {
            btn2.classList.remove('locked-btn'); 
            btn2.disabled = false;
            btn2.innerText = "▶ PLAY PART 2: Rooftop"; 
            btn2.style.background = "linear-gradient(180deg, #e67e22, #d35400)";
            btn2.style.color = "white";
        }
        if(extra) extra.classList.remove('hidden');
    } else {
        // ถ้ายังไม่ปลดล็อค (หรือกด New Game) ให้ล็อคกลับ
        if(btn2) {
            btn2.classList.add('locked-btn');
            btn2.disabled = true;
            btn2.innerText = "🔒 PART 2: Rooftop";
            btn2.style.background = "";
            btn2.style.color = "";
        }
        if(extra) extra.classList.add('hidden');
    }

    // เช็คปุ่ม Load Save
    if(localStorage.getItem(SAVE_KEY) && btnCon) {
        btnCon.classList.remove('hidden'); 
        btnCon.onclick = window.loadGameData;
    } else if (btnCon) {
        btnCon.classList.add('hidden');
    }
}

// --- 10. INITIALIZATION & LISTENERS ---
// เรียกครั้งแรกเพื่อเช็คสถานะปุ่ม
updateMenuButtons();

const toggleBtn = document.getElementById('btn-chapter-toggle');
if(toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        const el = document.getElementById('extra-chapters');
        if(el) el.classList.toggle('hidden');
    });
}

const b1 = document.getElementById('btn-part1');
if(b1) b1.addEventListener('click', ()=>{
    document.getElementById('start-overlay').style.display = 'none';
    gameState = { hp:100, sanity:100, food:100, relationship:50, ammo:0, inventory:[], maxSlots:3, day:1, time:690, infected:false, noise:0, currentSceneId:'scene_start', flags:{}, combat:{active:false,name:"",hp:0,maxHp:0} };
    updateHUD(); loadScene('scene_start');
});

const b2 = document.getElementById('btn-part2');
if(b2) {
    b2.addEventListener('click', window.startPartTwo);
}

document.getElementById('home-btn').onclick = () => { 
    document.getElementById('start-overlay').style.display='flex'; 
    updateMenuButtons(); // อัปเดตปุ่ม Load Save เผื่อมีเซฟใหม่
};

document.getElementById('btn-reset-save').onclick = () => { 
    if(confirm("ลบเซฟทั้งหมด?")) { 
        localStorage.removeItem(SAVE_KEY); 
        localStorage.removeItem('hell_part2_unlocked'); 
        location.reload(); 
    }
};

const btnNewRun = document.getElementById('btn-new-run');
if(btnNewRun) {
    btnNewRun.addEventListener('click', window.startNewGame);
}

const btnBackMenu = document.getElementById('btn-back-menu');
if(btnBackMenu) {
    btnBackMenu.addEventListener('click', () => {
        window.location.href = 'index.html'; 
    });
}