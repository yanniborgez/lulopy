/*
  LuloPy (Local) — v7
  - Perfil (nombre + emoji) con onboarding
  - Modo Ruta guiada vs Libre
  - Desbloqueo de exámenes por progreso (Ruta guiada)
  - Misiones diarias (código largo) + reto del día (1 intento)
  - Reanudación automática
*/

const STORAGE_KEY = "lulopy_v7_progress";

// --------- Python (Pyodide) ----------
let pyodide = null;
let pyReady = false;
let pyLoadError = null;
let stdoutBuf = "";
let stderrBuf = "";

function $(id){ return document.getElementById(id); }
function normalizeOut(s){ return (s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n"); }

function canonicalizeFill(input){
  const s0 = (input ?? "").trim();
  if(!s0) return "";
  const lower = s0.toLowerCase();
  if(/\bnot\s+in\b/.test(lower)) return "not in";
  if(s0.includes('"""')) return '"""';
  if(/\bglobal\b/.test(lower)) return "global";
  for(const op of ["==","!=",">=","<=",">","<","+"]){
    if(s0.includes(op)) return op;
  }
  if(/\bin\b/.test(lower)) return "in";
  const num = s0.match(/-?\d+(?:\.\d+)?/);
  if(num) return num[0];
  const qs = s0.match(/(['"])(.*?)\1/s);
  if(qs) return qs[2].trim();
  const ids = s0.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const known = new Set(["strip","replace","split","upper","lower","len","int","float","str","bool","isinstance","range"]);
  for(const t of ids){ if(known.has(t)) return t; }
  if(ids.length) return ids[ids.length-1];
  return s0;
}

async function sha256(text){
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  return hashArr.map(b => b.toString(16).padStart(2,"0")).join("");
}

async function initPyodide(){
  try{
    if(!globalThis.loadPyodide) throw new Error("pyodide.js no disponible (¿sin internet?)");
    pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/" });
    stdoutBuf = ""; stderrBuf = "";
    pyodide.setStdout({batched: (s)=>{ stdoutBuf += s; }});
    pyodide.setStderr({batched: (s)=>{ stderrBuf += s; }});
    pyReady = true;
    $("pyStatus").textContent = "Listo";
  } catch(err){
    pyLoadError = err;
    pyReady = false;
    $("pyStatus").textContent = "No disponible";
  }
}
async function runPython(code){
  stdoutBuf = ""; stderrBuf = "";
  if(!pyReady) throw (pyLoadError || new Error("Pyodide no listo"));
  await pyodide.runPythonAsync(code);
  return {stdout: normalizeOut(stdoutBuf), stderr: normalizeOut(stderrBuf)};
}

let trainBank = [];
let exams = [];
let dailyBank = [];
let challengeBank = [];
async function loadData(){
  trainBank = await (await fetch("exercises.json")).json();
  exams = await (await fetch("exams.json")).json();
  dailyBank = await (await fetch("daily_bank.json")).json();
  challengeBank = await (await fetch("challenge_bank.json")).json();
  updateProgressSummary();
}

const CHAPTERS = [
  { id: 1, title: "Capítulo 1 — Fundamentos", desc: "Arranque controlado. Salidas claras, cero ruido, cero errores." },
  { id: 2, title: "Capítulo 2 — Variables y Cálculo", desc: "Las cifras viven en variables. La precisión es una regla." },
  { id: 3, title: "Capítulo 3 — Strings y Parsing", desc: "Los registros llegan sucios. Se limpian, se cortan, se vuelven útiles." },
  { id: 4, title: "Capítulo 4 — Validación", desc: "Si falla, debe verse. Booleans y reglas explícitas." },
];

const EXAM_LABELS = {
  "EXAM-1": "Examen 1 (Capítulos 1–2)",
  "EXAM-2": "Examen 2 (Capítulo 3)",
  "EXAM-3": "Examen 3 (Capítulo 4)",
};

const NARRATIVE = {};

const EMOJIS = ["🕵️","🧾","🧠","🧩","🧰","🗝️","🗂️","🧱","🧪","🧯","🧿","🛰️","🕯️","🗡️","🗝️","🪪","🧷","🧲","🧮","📎"];

function chapterExercises(chId){
  return trainBank.filter(e => Number(e.level) === Number(chId)).sort((a,b)=> a.id.localeCompare(b.id));
}
function chapterTopics(chId){
  const set = new Set(chapterExercises(chId).map(e => e.topic || "General"));
  return Array.from(set).sort((a,b)=> a.localeCompare(b));
}
function topicExercises(chId, topic){
  return chapterExercises(chId).filter(e => (e.topic || "General") === topic);
}
function examItems(examId){
  return exams.filter(e => e.exam_id === examId).sort((a,b)=> a.id.localeCompare(b.id));
}
function todayKey(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }


function canonicalFillAnswer(raw){
  const s0 = (raw ?? "").toString().trim().replace(/\r\n/g, "\n");
  const s = s0;
  const sl = s.toLowerCase();

  if(/\bnot\s+in\b/.test(sl)) return "not in";
  if(s.includes('"""')) return '"""';
  if(/\bglobal\b/.test(sl)) return "global";

  for(const op of ["==","!=",">=","<=",">","<","+"]){
    if(s.includes(op)) return op;
  }

  if(/\bin\b/.test(sl)) return "in";

  const num = s.match(/-?\d+(?:\.\d+)?/);
  if(num) return num[0];

  const q = s.match(/(['"])(.*?)\1/s);
  if(q) return (q[2] ?? "").trim();

  const toks = s.match(/[A-Za-z_][A-Za-z0-9_]*/g);
  if(toks && toks.length){
    const known = new Set(["strip","replace","split","upper","lower","len","int","float","str","bool","isinstance","range"]);
    for(const t of toks){
      if(known.has(t)) return t;
    }
    return toks[toks.length-1];
  }
  return s;
}

function defaultProgress(){
  return {
    profile: { name: null, emoji: "🕵️" },
    settings: { playMode: "guided", unlockPct: 70 },
    xp: 0,
    streak: 0,
    trainDone: {},
    examDone: {},
    dailyDone: {},
    challengeDone: {},
    seen: { daily: [], challenge: [] },
    daily: { date: null, missions: [], doneIds: [], rerolled: false },
    dailyChallenge: { date: null, id: null, attempted: false },
    last: { mode: "campaign", chapter: 1, topic: null, exam_id: null, idx: 0, exercise_id: null }
  };
}
function loadProgress(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultProgress();
    const p = JSON.parse(raw);
    const merged = {...defaultProgress(), ...p};
    merged.profile = {...defaultProgress().profile, ...(p.profile || {})};
    merged.settings = {...defaultProgress().settings, ...(p.settings || {})};
    merged.daily = {...defaultProgress().daily, ...(p.daily || {})};
    merged.last = {...defaultProgress().last, ...(p.last || {})};

    merged.trainDone = {...defaultProgress().trainDone, ...(p.trainDone || {})};
    merged.dailyDone = {...defaultProgress().dailyDone, ...(p.dailyDone || {})};
    merged.challengeDone = {...defaultProgress().challengeDone, ...(p.challengeDone || {})};
    merged.seen = {...defaultProgress().seen, ...(p.seen || {})};
    merged.seen.daily = Array.isArray(merged.seen.daily) ? merged.seen.daily : [];
    merged.seen.challenge = Array.isArray(merged.seen.challenge) ? merged.seen.challenge : [];

    merged.dailyChallenge = {...defaultProgress().dailyChallenge, ...(p.dailyChallenge || {})};

    if(p.done && !p.trainDone){
      merged.trainDone = {...merged.trainDone, ...p.done};
    }
    return merged;
  }catch(e){
    return defaultProgress();
  }
}
function saveProgress(p){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}
let progress = loadProgress();

function updateHUD(){
  $("xpValue").textContent = progress.xp;
  $("streakValue").textContent = progress.streak;
  const lvl = Math.floor(progress.xp / 250) + 1;
  $("playerLevel").textContent = lvl;

  const name = progress.profile?.name || "Jugador";
  const emoji = progress.profile?.emoji || "🕵️";
  const nameEl = $("playerName");
  if(nameEl) nameEl.textContent = name;
  const emojiEl = $("playerEmoji");
  if(emojiEl) emojiEl.textContent = emoji;

  $("modeChip").textContent = (progress.settings.playMode === "guided" ? "Ruta guiada" : "Libre");
}

let mode = "campaign"; // campaign | topic | exam | daily | challenge
let chapter = 1;
let topic = null;
let examId = null;
let list = [];
let idx = 0;

function setFeedback(kind, html){
  const box = $("feedback");
  box.classList.remove("good","bad");
  if(kind) box.classList.add(kind);
  box.innerHTML = html;
}
function clearConsole(){ $("console").textContent = ""; }

function showHome(){
  $("homeScreen").classList.remove("hidden");
  $("gameScreen").classList.add("hidden");
}

function updateProgressSummary(){
  try{
    const total = (trainBank?.length || 0);
    const done = Object.values(progress.trainDone || {}).filter(v => v && v.ok).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const elPct = $("overallPct"); if(elPct) elPct.textContent = `${pct}%`;
    const elCount = $("overallCount"); if(elCount) elCount.textContent = `${done}/${total} completados`;

    // Chapters completed
    const chaptersDone = CHAPTERS.filter(ch => {
      const pr = chapterProgress(ch.id);
      return pr.total > 0 && pr.done >= pr.total;
    }).length;
    const elCh = $("chaptersCompleted"); if(elCh) elCh.textContent = `${chaptersDone}/${CHAPTERS.length}`;

    // Exams completion
    const byExam = {};
    for(const item of (exams || [])){
      const rec = progress.examDone?.[item.id];
      if(rec?.attempts){
        byExam[item.exam_id] = (byExam[item.exam_id] || 0) + 1;
      }
    }
    const examIds = Array.from(new Set((exams || []).map(x=>x.exam_id)));
    let completedExams = 0;
    let totalExamItems = (exams || []).length;
    let attemptedExamItems = Object.values(progress.examDone || {}).filter(v => v?.attempts).length;

    for(const exId of examIds){
      const needed = (exams || []).filter(x => x.exam_id === exId).length;
      const have = byExam[exId] || 0;
      if(needed && have >= needed) completedExams += 1;
    }
    const elEC = $("examsCompleted"); if(elEC) elEC.textContent = `${completedExams}/${examIds.length || 0}`;
  }catch(_){}
}

function renderHomeAll(){
  try{
    renderChapterCards();
  }catch(_){}
  try{
    renderDailyUI();
  }catch(_){}
  try{
    renderChallengeHint();
  }catch(_){}
  try{
    updateContinueHint();
  }catch(_){}
  try{
    updateProgressSummary();
  }catch(_){}
}


function showGame(){
  $("homeScreen").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
}

function buildCurrentList(){
  if(mode === "campaign"){
    list = chapterExercises(chapter);
  } else if(mode === "topic"){
    list = topicExercises(chapter, topic);
  } else if(mode === "exam"){
    list = examItems(examId);
  } // daily/challenge keep list as assigned

  idx = clamp(idx, 0, Math.max(0, list.length-1));
}

function isExamLockedItem(e){
  const info = progress.examDone[e.id];
  return !!info && (info.attempts ?? 0) >= 1;
}

function chapterProgress(chId){
  const exs = chapterExercises(chId);
  const total = exs.length;
  const done = exs.filter(e => progress.trainDone[e.id]?.ok).length;
  return {done, total, pct: total ? Math.round(100*done/total) : 0};
}

function isExamUnlocked(exId){
  if(progress.settings.playMode !== "guided") return true;
  const pctReq = Number(progress.settings.unlockPct || 70);

  if(exId === "EXAM-1"){
    return chapterProgress(1).pct >= pctReq && chapterProgress(2).pct >= pctReq;
  }
  if(exId === "EXAM-2"){
    return chapterProgress(3).pct >= pctReq;
  }
  if(exId === "EXAM-3"){
    return chapterProgress(4).pct >= pctReq;
  }
  return true;
}

function openNarrative(kind, chId, onOk){ onOk?.(); }

function closeNarrative(){}


function openOverlay(){
  $("overlay").classList.remove("hidden");
  syncSettingsUI();
}

function closeOverlay(){
  $("overlay").classList.add("hidden");
}

function openTopicOverlay(chId=null){
  $("topicOverlay").classList.remove("hidden");
  if(chId !== null){
    $("chapterSelect").value = String(chId);
  }
  refreshTopics();
}
function closeTopicOverlay(){
  $("topicOverlay").classList.add("hidden");
}
function openExamOverlay(exId=null){
  $("examOverlay").classList.remove("hidden");
  if(exId){
    $("examSelect").value = exId;
  }
  updateExamNote();
}
function closeExamOverlay(){
  $("examOverlay").classList.add("hidden");
}



let profileMustSave = false;
function openProfileOverlay(mustSave=false){
  profileMustSave = mustSave;
  $("profileOverlay").classList.remove("hidden");
  $("closeProfileBtn").classList.toggle("hidden", mustSave);

  $("nameInput").value = progress.profile?.name || "";
  renderEmojiGrid();
}
function closeProfileOverlay(){
  if(profileMustSave) return;
  $("profileOverlay").classList.add("hidden");
}
function renderEmojiGrid(){
  const root = $("emojiGrid");
  root.innerHTML = "";
  const current = progress.profile?.emoji || "🕵️";
  EMOJIS.forEach(e => {
    const b = document.createElement("button");
    b.className = "emojiBtn" + (e === current ? " selected" : "");
    b.type = "button";
    b.textContent = e;
    b.addEventListener("click", ()=>{
      progress.profile.emoji = e;
      saveProgress(progress);
      renderEmojiGrid();
      updateHUD();
    });
    root.appendChild(b);
  });
}
function saveProfile(){
  const name = ($("nameInput").value || "").trim();
  if(!name){
    alert("Escribe un nombre para continuar.");
    return;
  }
  progress.profile.name = name;
  progress.profile.emoji = progress.profile.emoji || "🕵️";
  saveProgress(progress);
  updateHUD();
  $("profileOverlay").classList.add("hidden");
  profileMustSave = false;
}

function syncSettingsUI(){
  $("playModeSelect").value = progress.settings.playMode || "guided";
  $("unlockPctSelect").value = String(progress.settings.unlockPct || 70);
}
function saveSettings(){
  progress.settings.playMode = $("playModeSelect").value;
  progress.settings.unlockPct = Number($("unlockPctSelect").value);
  saveProgress(progress);
  updateHUD();
  renderChapterCards();
  updateExamNote();
}

function ensureDailyMissions(forceNew=false){
  const key = todayKey();
  const d = progress.daily || {date:null, missions:[], doneIds:[], rerolled:false};

  if(!forceNew && d.date === key && (d.missions?.length || 0) >= 1){
    progress.daily = d;
    return;
  }

  const seen = progress.seen?.daily || [];
  const remaining = dailyBank.filter(x => !seen.includes(x.id));

  if(remaining.length === 0){
    progress.daily = { date: key, missions: [], doneIds: [], rerolled: !!d.rerolled };
    saveProgress(progress);
    return;
  }

  const pick = remaining.slice(0, 2).map(x => x.id);
  progress.seen.daily = seen.concat(pick);

  progress.daily = {
    date: key,
    missions: pick.map(id => ({id})),
    doneIds: [],
    rerolled: forceNew ? true : !!d.rerolled
  };
  saveProgress(progress);
}

function renderDailyUI(){
  ensureDailyMissions(false);
  const key = progress.daily.date || todayKey();
  $("dailyDatePill").textContent = key;

  const root = $("dailyList");
  root.innerHTML = "";

  const ids = (progress.daily.missions || []).map(x => x.id);
  if(ids.length === 0){
    root.innerHTML = `<div class="small muted">Banco de misiones diarias agotado (100). Exporta progreso o reinicia si quieres repetir.</div>`;
    $("startDailyBtn").disabled = true;
    $("rerollDailyBtn").disabled = true;
    return;
  }
  $("startDailyBtn").disabled = false;

  ids.forEach((id, k)=>{
    const ex = dailyBank.find(e => e.id === id);
    const done = progress.daily.doneIds?.includes(id);
    const div = document.createElement("div");
    div.className = "dailyItem";
    div.innerHTML = `
      <div class="dailyLeft">
        <div class="dailyTitle">${done ? "✔ " : ""}Misión ${k+1}</div>
        <div class="dailyMeta">${ex ? (ex.type.toUpperCase()) : ""}</div>
      </div>
      <div class="pill">${done ? "Completa" : "Pendiente"}</div>
    `;
    root.appendChild(div);
  });

  const canReroll = !progress.daily.rerolled;
  $("rerollDailyBtn").disabled = !canReroll;
  $("rerollDailyBtn").textContent = canReroll ? "Re-crear (una vez)" : "Re-crear (usado)";
}

function renderChallengeHint(){
  ensureDailyChallenge();
  const key = todayKey();
  const dc = progress.dailyChallenge || { date:null, id:null, attempted:false };
  const seen = progress.seen?.challenge || [];
  const remaining = Math.max(0, (challengeBank?.length || 0) - seen.length);
  const pill = $("challengePill");
  const btn = $("startChallengeBtn");

  if(!dc.id){
    if(pill) pill.textContent = "Agotado";
    if(btn) btn.disabled = true;
    $("challengeHint").textContent = "Banco de retos agotado (100).";
    return;
  }

  // available today
  if(dc.date !== key){
    if(pill) pill.textContent = "Pendiente";
    if(btn) btn.disabled = false;
    $("challengeHint").textContent = remaining
      ? `Disponible • 1 intento • ${remaining} restantes.`
      : "Reto disponible. 1 intento.";
    return;
  }

  if(dc.attempted){
    if(pill) pill.textContent = "Intentado";
    if(btn) btn.disabled = false;
    $("challengeHint").textContent = `Ya intentado hoy • Vuelve mañana • ${remaining} restantes.`;
  } else {
    if(pill) pill.textContent = "Pendiente";
    if(btn) btn.disabled = false;
    $("challengeHint").textContent = remaining
      ? `Disponible • 1 intento • ${remaining} restantes.`
      : "Reto disponible. 1 intento.";
  }
}


function ensureDailyChallenge(){
  const key = todayKey();
  const dc = progress.dailyChallenge || {date:null, id:null, attempted:false};
  if(dc.date === key && dc.id){
    progress.dailyChallenge = dc;
    return;
  }
  const seen = progress.seen?.challenge || [];
  const remaining = challengeBank.filter(x => !seen.includes(x.id));
  if(remaining.length === 0){
    progress.dailyChallenge = {date:key, id:null, attempted:false};
    saveProgress(progress);
    return;
  }
  const pick = remaining[0].id;
  progress.seen.challenge = seen.concat([pick]);
  progress.dailyChallenge = {date:key, id:pick, attempted:false};
  saveProgress(progress);
}

function renderChapterCards(){
  const root = $("chapterCards");
  root.innerHTML = "";

  for(const ch of CHAPTERS){
    const pr = chapterProgress(ch.id);
    const card = document.createElement("div");
    card.className = "chapterCard";

    const suggested = (ch.id <= 2) ? "EXAM-1" : (ch.id === 3 ? "EXAM-2" : "EXAM-3");
    const unlocked = isExamUnlocked(suggested);

    card.innerHTML = `
      <div class="chapterTitle">${ch.title}</div>
      <div class="chapterDesc">${ch.desc}</div>
      <div class="chapterRow">
        <div class="progressBar"><div class="progressFill" style="width:${pr.pct}%"></div></div>
        <div class="small muted">${pr.done}/${pr.total}</div>
      </div>
      <div class="chapterActions">
        <button class="btn primary" data-action="continue">Continuar</button>
        <button class="btn" data-action="practice">Practicar por tema</button>
        <button class="btn" data-action="exam" ${unlocked ? "" : "disabled"}>${unlocked ? "Examen" : "Examen 🔒"}</button>
      </div>
      ${(!unlocked && progress.settings.playMode==="guided") ? `<div class="small muted">Examen bloqueado: completa ≥ ${progress.settings.unlockPct}% para desbloquear.</div>` : ""}
    `;

    card.querySelector("[data-action='continue']").addEventListener("click", ()=> startCampaign(ch.id));
    card.querySelector("[data-action='practice']").addEventListener("click", ()=>{
      openTopicOverlay(ch.id);
    });
    card.querySelector("[data-action='exam']").addEventListener("click", ()=>{
      openExamOverlay(suggested);
    });

    root.appendChild(card);
  }
}

function updateContinueHint(){
  const last = progress.last;
  let label = "Continuar";
  if(last.mode === "campaign"){
    const chTitle = CHAPTERS.find(c => c.id === last.chapter)?.title ?? `Capítulo ${last.chapter}`;
    label = `Última sesión: ${chTitle}`;
  } else if(last.mode === "topic"){
    label = `Última sesión: Práctica — Capítulo ${last.chapter} / ${last.topic}`;
  } else if(last.mode === "exam"){
    label = `Última sesión: ${EXAM_LABELS[last.exam_id] ?? last.exam_id}`;
  } else if(last.mode === "daily"){
    label = "Última sesión: Misiones diarias";
  } else if(last.mode === "challenge"){
    label = "Última sesión: Reto rápido";
  }
  $("continueHint").textContent = label;
}

function renderCurrent(){
  const e = list[idx];
  if(!e){
    $("qTitle").textContent = "No hay misiones";
    $("prompt").textContent = "";
    $("workspace").innerHTML = "";
    return;
  }

  if(mode === "campaign"){
    $("chipChapter").textContent = `Capítulo ${chapter}`;
    $("chipPath").textContent = "Ruta guiada";
  } else if(mode === "topic"){
    $("chipChapter").textContent = `Capítulo ${chapter}`;
    $("chipPath").textContent = `Práctica — ${topic}`;
  } else if(mode === "exam"){
    $("chipChapter").textContent = "Examen";
    $("chipPath").textContent = EXAM_LABELS[examId] ?? examId;
  } else if(mode === "daily"){
    $("chipChapter").textContent = "Diarias";
    $("chipPath").textContent = "Misiones diarias";
  } else {
    $("chipChapter").textContent = "Reto";
    $("chipPath").textContent = "Reto rápido";
  }

  $("qTitle").textContent = e.id;
  $("pillType").textContent = e.type.toUpperCase();
  $("pillPoints").textContent = `+${e.points ?? 0} XP`;

  const total = list.length;
  const at = idx + 1;
  $("progressText").textContent = `${at}/${total}`;
  $("progressFill").style.width = `${Math.round(100*at/Math.max(1,total))}%`;

  $("prompt").textContent = e.prompt ?? "";
  $("workspace").innerHTML = "";
  clearConsole();

  $("showAnswerBtn").classList.toggle("hidden", mode==="exam");

  if(mode==="exam" && isExamLockedItem(e)){
    setFeedback("bad", "🔒 Este inciso ya fue intentado (modo examen: 1 intento).");
  } else {
    setFeedback(null, "Resuelve la misión y presiona <b>Revisar</b>.");
  }

  const w = $("workspace");

  if(e.type === "mcq"){
    const wrap = document.createElement("div");
    wrap.className = "choices";
    e.choices.forEach((c, k)=>{
      const row = document.createElement("label");
      row.className = "choice";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "mcq";
      input.value = String(k);

      const outer = document.createElement("div");
      const inner = document.createElement("div");
      inner.textContent = String(c);
      outer.appendChild(inner);

      row.appendChild(input);
      row.appendChild(outer);
      wrap.appendChild(row);
    });
    w.appendChild(wrap);
  } else if(e.type === "fill"){
    const label = document.createElement("div");
    label.className = "small muted";
    label.textContent = "Respuesta corta (solo lo que reemplaza ____):";
    w.appendChild(label);
    const inp = document.createElement("input");
    inp.id = "answerBox";
    inp.className = "textInput";
    inp.placeholder = "Ejemplo: strip, 1250.50, not in, +, etc.";
    w.appendChild(inp);
  } else if(e.type === "code"){
    const ta = document.createElement("textarea");
    ta.id = "codeBox";
    ta.value = e.starter_code ?? "# tu código\n";
    w.appendChild(ta);

    if(!pyReady){
      const note = document.createElement("div");
      note.className = "small muted";
      note.innerHTML = "⚠️ Ejecución en navegador no disponible (Pyodide no cargó). Puedes ejecutar este código en VSCode/terminal.";
      w.appendChild(note);
    }
  }

  const run_ids = (mode === "daily" || mode === "challenge") ? (progress.last?.run_ids || list.map(x => x.id)) : null;
  progress.last = {
    mode,
    chapter,
    topic,
    exam_id: examId,
    idx,
    exercise_id: e.id,
    run_ids
  };
  saveProgress(progress);
}

function getUserAnswer(e){
  if(e.type === "mcq"){
    const checked = document.querySelector("input[name='mcq']:checked");
    if(!checked) return null;
    return e.choices[Number(checked.value)];
  }
  if(e.type === "fill"){
    return $("answerBox").value;
  }
  if(e.type === "code"){
    return $("codeBox").value;
  }
  return null;
}

function markDone(id, ok, points){
  const bucket = (mode==="exam") ? progress.examDone : (mode==="daily" ? progress.dailyDone : (mode==="challenge" ? progress.challengeDone : progress.trainDone));
  const prev = bucket[id];
  const attempts = (prev?.attempts ?? 0) + 1;
  bucket[id] = { ok, attempts, ts: Date.now() };

  if(ok){
    if(!prev?.ok) progress.xp += (points ?? 0);
    progress.streak += 1;
  } else {
    progress.streak = 0;
  }

  if(mode === "daily" && ok){
    if(!progress.daily.doneIds.includes(id)){
      progress.daily.doneIds.push(id);
    }
  }

  saveProgress(progress);
  updateHUD();
}

async function checkCurrent(){
  const e = list[idx];

  if(mode === "challenge"){
    ensureDailyChallenge();
    const key = todayKey();
    const dc = progress.dailyChallenge || {date:null, id:null, attempted:false};
    if(dc.date === key && dc.id === e.id && dc.attempted){
      setFeedback("Este reto ya fue intentado hoy.", false);
      return;
    }
  }
  if(!e) return;

  if(mode==="exam" && isExamLockedItem(e)){
    setFeedback("bad", "🔒 Este inciso ya fue intentado (modo examen: 1 intento).");
    return;
  }

  const ua = getUserAnswer(e);
  if(ua === null || ua === undefined || (typeof ua === "string" && ua.trim()==="")){
    setFeedback("bad", "Falta tu respuesta.");
    return;
  }

  try{
    if(e.type === "mcq"){
      const ok = (mode==="exam") ? (await sha256(ua.trim()) === e.answer_hash) : (ua === e.answer);
      markDone(e.id, ok, ok ? e.points : 0);
      setFeedback(ok ? "good" : "bad",
        mode==="exam" ? (ok ? "✅ Registrado." : "❌ Registrado.")
        : (ok ? `✅ Correcto. +${e.points} XP` : "❌ Incorrecto.") + (e.explanation ? `<div class="small muted"><br/>${e.explanation}</div>` : ""));
    }

    if(e.type === "fill"){
      const raw = (ua ?? "").toString();
      const ansCanon = canonicalFillAnswer(raw);
      const expCanon = canonicalFillAnswer((e.answer ?? "").toString());

      let ok = false;
      if(mode==="exam"){
        ok = (await sha256(ansCanon)) === e.answer_hash;
      } else {
        ok = (ansCanon === expCanon) || raw.includes((e.answer ?? "").toString());
      }

      markDone(e.id, ok, ok ? e.points : 0);
      setFeedback(ok ? "good" : "bad",
        mode==="exam" ? (ok ? "✅ Registrado." : "❌ Registrado.")
        : (ok ? `✅ Correcto. +${e.points} XP` : "❌ Incorrecto.") + (e.explanation ? `<div class=\"small muted\"><br/>${e.explanation}</div>` : "")
      );
    }

    if(e.type === "code"){
      if(!pyReady){
        setFeedback("bad", "⚠️ Ejecución en navegador no disponible. Ejecuta en VSCode/terminal.");
        return;
      }
      const res = await runPython(ua);
      $("console").textContent = res.stdout + (res.stderr ? ("\n[stderr]\n"+res.stderr) : "");
      const userNorm = normalizeOut(res.stdout).trimEnd();

      if(mode==="exam"){
        const ok = (await sha256(userNorm)) === e.expected_hash;
        markDone(e.id, ok, ok ? e.points : 0);
        setFeedback(ok ? "good" : "bad", ok ? "✅ Registrado." : "❌ Registrado.");
      } else {
        const expected = normalizeOut(e.expected_stdout ?? "").trimEnd();
        const ok = userNorm === expected;
        markDone(e.id, ok, ok ? e.points : 0);
        setFeedback(ok ? "good" : "bad",
          ok ? `✅ Correcto. +${e.points} XP`
             : `❌ La salida no coincide.<div class="small muted"><br/><b>Tu salida:</b><br/><pre class="console">${res.stdout || "(vacío)"}</pre><b>Salida esperada:</b><br/><pre class="console">${e.expected_stdout || "(vacío)"}</pre></div>`);
      }
    }

    if(mode === "daily"){
      renderDailyUI();
    }
    if(mode === "challenge"){
      const key = todayKey();
      progress.dailyChallenge = {date: key, id: e.id, attempted: true};
      saveProgress(progress);
      renderChallengeHint();
    }

  } catch(err){
    $("console").textContent = String(err);
    markDone(e.id, false, 0);
    setFeedback("bad", "Ocurrió un error. Revisa la consola.");
  }
}

function showAnswer(){
  const e = list[idx];
  if(!e || mode==="exam") return;
  if(e.type === "mcq"){
    setFeedback(null, `Respuesta: <b>${e.answer}</b>` + (e.explanation ? `<div class="small muted"><br/>${e.explanation}</div>` : ""));
  } else if(e.type === "fill"){
    setFeedback(null, `Respuesta: <b>${e.answer}</b>` + (e.explanation ? `<div class="small muted"><br/>${e.explanation}</div>` : ""));
  } else if(e.type === "code"){
    setFeedback(null, `Salida esperada:<br/><pre class="console">${e.expected_stdout || ""}</pre>`);
  }
}

function next(){
  if(idx < list.length - 1){
    idx += 1;
    renderCurrent();
    return;
  }

  if(mode === "campaign"){
    const chId = chapter;
    if(chId < 4){
      startCampaign(chId + 1, true);
    } else {
      showHome();
      renderChapterCards();
      renderDailyUI();
      renderChallengeHint();
      updateContinueHint();
    }
    return;
  }

  showHome();
  renderChapterCards();
  renderDailyUI();
  renderChallengeHint();
  updateContinueHint();
}

function startCampaign(chId, skipStartNarrative=false){
  mode = "campaign";
  chapter = Number(chId);
  topic = null;
  examId = null;

  const exs = chapterExercises(chapter);
  const firstNotDone = exs.findIndex(e => !progress.trainDone[e.id]?.ok);
  idx = (firstNotDone >= 0) ? firstNotDone : 0;
  buildCurrentList();

  const go = ()=>{ showGame(); renderCurrent(); };
  if(skipStartNarrative){
    openNarrative("start", chapter, go);
  } else {
    openNarrative("start", chapter, go);
  }
}

function resumeLast(){
  const last = progress.last || {};
  mode = last.mode || "campaign";
  chapter = Number(last.chapter || 1);
  topic = last.topic || null;
  examId = last.exam_id || null;
  idx = Number(last.idx || 0);

  if(mode === "daily"){
    ensureDailyMissions(false);
    const run = progress.last?.run_ids || (progress.daily.missions || []).map(x => x.id);
    list = run.map(id => dailyBank.find(e => e.id === id)).filter(Boolean);
  } else if(mode === "challenge"){
    const run = progress.last?.run_ids || [];
    list = run.map(id => challengeBank.find(e => e.id === id)).filter(Boolean);
    if(list.length === 0){
      ensureDailyChallenge();
      const dc = progress.dailyChallenge || {};
      if(dc.id){
        const ex = challengeBank.find(e => e.id === dc.id);
        list = ex ? [ex] : [];
      }
    }
  } else {
    buildCurrentList();
  }

  if(last.exercise_id){
    const k = list.findIndex(x => x.id === last.exercise_id);
    if(k >= 0) idx = k;
  }
  idx = clamp(idx, 0, Math.max(0, list.length-1));

  showGame();
  renderCurrent();
}

function startTopic(chId, top){
  mode = "topic";
  chapter = Number(chId);
  topic = top;
  examId = null;

  const exs = topicExercises(chapter, topic);
  const firstNotDone = exs.findIndex(e => !progress.trainDone[e.id]?.ok);
  idx = (firstNotDone >= 0) ? firstNotDone : 0;
  buildCurrentList();

  showGame();
  renderCurrent();
}

function startExam(exId){
  if(!isExamUnlocked(exId)){
    alert(`Examen bloqueado en Modo Ruta guiada.\nCompleta ≥ ${progress.settings.unlockPct}% del capítulo requerido.`);
    return;
  }
  mode = "exam";
  examId = exId;
  chapter = 1;
  topic = null;
  idx = 0;
  buildCurrentList();
  showGame();
  renderCurrent();
}

function startDaily(){
  ensureDailyMissions(false);
  if((progress.daily.missions || []).length === 0){
    alert("Banco de misiones diarias agotado.");
    return;
  }
  mode = "daily";
  chapter = progress.last?.chapter || 1;
  topic = null;
  examId = null;
  idx = 0;
  list = (progress.daily.missions || []).map(x => dailyBank.find(e => e.id === x.id)).filter(Boolean);

  progress.last.run_ids = list.map(x => x.id);
  saveProgress(progress);

  showGame();
  renderCurrent();
}

function rerollDaily(){
  if(progress.daily.rerolled) return;
  ensureDailyMissions(true);
  renderDailyUI();
}

function startChallenge(){
  ensureDailyChallenge();
  const key = todayKey();
  const dc = progress.dailyChallenge || {date:null, id:null, attempted:false};
  if(!dc.id){
    alert("Banco de retos agotado (100).");
    return;
  }
  if(dc.date === key && dc.attempted){
    alert("Reto de hoy ya fue intentado. Vuelve mañana.");
    return;
  }

  mode = "challenge";
  chapter = progress.last?.chapter || 1;
  topic = null;
  examId = null;
  idx = 0;

  const ex = challengeBank.find(e => e.id === dc.id);
  list = ex ? [ex] : [];
  if(list.length === 0){
    alert("No se pudo cargar el reto de hoy.");
    return;
  }

  progress.last.run_ids = list.map(x => x.id);
  saveProgress(progress);

  showGame();
  renderCurrent();
}

function exportProgress(){
  const payload = {
    product: "LuloPy",
    version: "v6",
    exported_at: new Date().toISOString(),
    progress
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "taxpy_progress.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

function resetAll(){
  if(!confirm("¿Resetear todo el progreso?")) return;
  progress = defaultProgress();
  saveProgress(progress);
  updateHUD();
  renderChapterCards();
  renderDailyUI();
  renderChallengeHint();
  updateContinueHint();
}

function refreshTopics(){
  const chId = Number($("chapterSelect").value);
  const topics = chapterTopics(chId);
  const sel = $("topicSelect");
  sel.innerHTML = "";
  topics.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
}

function updateExamNote(){
  const exId = $("examSelect").value;
  const items = examItems(exId);
  const attempted = items.filter(it => (progress.examDone[it.id]?.attempts ?? 0) >= 1).length;

  const unlocked = isExamUnlocked(exId);
  $("startExamBtn").disabled = !unlocked;
  if(progress.settings.playMode === "guided" && !unlocked){
    $("examNote").textContent = `${attempted}/${items.length} incisos intentados. 🔒 Examen bloqueado: completa ≥ ${progress.settings.unlockPct}% del capítulo requerido.`;
  } else {
    $("examNote").textContent = `${attempted}/${items.length} incisos intentados en este navegador.`;
  }
}

$("menuBtn").addEventListener("click", openOverlay);
const __ot = $("openTopicOverlayBtn"); if(__ot) __ot.addEventListener("click", ()=>{ closeOverlay(); openTopicOverlay(null); });
const __oe = $("openExamOverlayBtn"); if(__oe) __oe.addEventListener("click", ()=>{ closeOverlay(); openExamOverlay(null); });
const __op = $("openProfileFromConfigBtn"); if(__op) __op.addEventListener("click", ()=>{ closeOverlay(); openProfileOverlay(false); });
const __homeBtn = $("homeBtn");
if(__homeBtn){
  __homeBtn.addEventListener("click", ()=>{
    showHome();
    try{ renderChapterCards(); }catch(_){ }
    try{ renderDailyUI(); }catch(_){ }
    try{ renderChallengeHint(); }catch(_){ }
    try{ updateContinueHint(); }catch(_){ }
  });
}

$("openMapBtn").addEventListener("click", openOverlay);
$("closeOverlayBtn").addEventListener("click", closeOverlay);
const __cto = $("closeTopicOverlayBtn"); if(__cto) __cto.addEventListener("click", closeTopicOverlay);
const __ceo = $("closeExamOverlayBtn"); if(__ceo) __ceo.addEventListener("click", closeExamOverlay);

$("continueBtn").addEventListener("click", resumeLast);
$("newGameBtn").addEventListener("click", ()=>{
  if(!confirm("¿Iniciar nueva partida? Esto reinicia el progreso local.")) return;
  progress = defaultProgress();
  saveProgress(progress);
  updateHUD();
  renderChapterCards();
  renderDailyUI();
  renderChallengeHint();
  updateContinueHint();
  openProfileOverlay(true);
});

$("resumeCampaignBtn").addEventListener("click", ()=>{ closeOverlay(); resumeLast(); });
$("restartCampaignBtn").addEventListener("click", ()=>{
  if(!confirm("¿Reiniciar ruta? Esto reinicia el progreso local.")) return;
  progress = defaultProgress();
  saveProgress(progress);
  updateHUD();
  closeOverlay();
  openProfileOverlay(true);
});

$("chapterSelect").addEventListener("change", refreshTopics);
$("startTopicBtn").addEventListener("click", ()=>{
  const chId = Number($("chapterSelect").value);
  const top = $("topicSelect").value;
  closeTopicOverlay();
  startTopic(chId, top);
});

$("examSelect").addEventListener("change", updateExamNote);
$("startExamBtn").addEventListener("click", ()=>{
  const exId = $("examSelect").value;
  closeExamOverlay();
  startExam(exId);
});

$("saveSettingsBtn").addEventListener("click", saveSettings);

$("editProfileBtn").addEventListener("click", ()=> openProfileOverlay(false));
const __pt = $("playerTag"); if(__pt) __pt.addEventListener("click", ()=> openProfileOverlay(false));
$("closeProfileBtn").addEventListener("click", closeProfileOverlay);
$("saveProfileBtn").addEventListener("click", saveProfile);

const __cnb = $("closeNarrativeBtn"); if(__cnb) __cnb.addEventListener("click", closeNarrative);

$("exportBtn").addEventListener("click", exportProgress);
$("exportBtnHome").addEventListener("click", exportProgress);
$("resetBtn").addEventListener("click", resetAll);

$("checkBtn").addEventListener("click", checkCurrent);
$("showAnswerBtn").addEventListener("click", showAnswer);
$("nextBtn").addEventListener("click", next);

$("startDailyBtn").addEventListener("click", startDaily);
$("rerollDailyBtn").addEventListener("click", rerollDaily);
$("startChallengeBtn").addEventListener("click", startChallenge);

(async function main(){
  await loadData();
  updateHUD();

  const chSel = $("chapterSelect");
  chSel.innerHTML = "";
  CHAPTERS.forEach(ch => {
    const opt = document.createElement("option");
    opt.value = String(ch.id);
    opt.textContent = ch.title;
    chSel.appendChild(opt);
  });
  chSel.value = "1";
  refreshTopics();

  const exSel = $("examSelect");
  exSel.innerHTML = "";
  Object.keys(EXAM_LABELS).forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = EXAM_LABELS[k];
    exSel.appendChild(opt);
  });
  exSel.value = progress.last.exam_id || "EXAM-1";
  updateExamNote();

  ensureDailyMissions(false);
  renderDailyUI();
  renderChallengeHint();

  renderChapterCards();
  updateContinueHint();

  syncSettingsUI();

  // Pyodide
  await initPyodide();

  if(!(progress.profile?.name || "").trim()){
    openProfileOverlay(true);
  }
})();
