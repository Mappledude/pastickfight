import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CODE_REGEX = /^[A-Z0-9]{3,16}$/;
const LOG_KEY = "admin.debugLog";
const MAX_LOG_LINES = 500;

const envEl = document.getElementById("env");
const debugLogEl = document.getElementById("debugLog");
const copyLogBtn = document.getElementById("copyLog");
const clearLogBtn = document.getElementById("clearLog");
const healthInitBtn = document.getElementById("healthInit");
const healthPingBtn = document.getElementById("healthPing");
const healthReadBtn = document.getElementById("healthRead");
const healthWriteBtn = document.getElementById("healthWrite");

const playerForm = document.getElementById("playerForm");
const playerNameInput = document.getElementById("playerName");
const playerCodeInput = document.getElementById("playerCode");
const playerAddBtn = document.getElementById("playerAddBtn");
const playerStatusEl = document.getElementById("playerStatus");
const playerCountEl = document.getElementById("playerCount");
const playersTbody = document.getElementById("playersTbody");

const arenaForm = document.getElementById("arenaForm");
const arenaNameInput = document.getElementById("arenaName");
const arenaCodeInput = document.getElementById("arenaCode");
const arenaAddBtn = document.getElementById("arenaAddBtn");
const arenaStatusEl = document.getElementById("arenaStatus");
const arenaCountEl = document.getElementById("arenaCount");
const arenasTbody = document.getElementById("arenasTbody");

let firebaseConfig = null;
let firebaseApp = null;
let firestoreDb = null;
let unsubscribePlayers = null;
let unsubscribeArenas = null;
let logLines = [];

function loadLogFromSession() {
  try {
    const stored = sessionStorage.getItem(LOG_KEY);
    if (!stored) {
      logLines = [];
      return;
    }
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      logLines = parsed.slice(-MAX_LOG_LINES);
    } else {
      logLines = [];
    }
  } catch (error) {
    console.warn("Failed to restore debug log", error);
    logLines = [];
  }
}

function persistLog() {
  try {
    sessionStorage.setItem(LOG_KEY, JSON.stringify(logLines.slice(-MAX_LOG_LINES)));
  } catch (error) {
    console.warn("Failed to persist debug log", error);
  }
}

function renderLog() {
  debugLogEl.value = logLines.join("\n");
  debugLogEl.scrollTop = debugLogEl.scrollHeight;
}

function logEvent(event, details) {
  const timestamp = new Date().toISOString();
  const serialized =
    details && Object.keys(details).length > 0
      ? `${timestamp} ${event} ${JSON.stringify(details)}`
      : `${timestamp} ${event}`;
  logLines.push(serialized);
  if (logLines.length > MAX_LOG_LINES) {
    logLines = logLines.slice(-MAX_LOG_LINES);
  }
  persistLog();
  renderLog();
  console.log(serialized);
}

function setStatus(targetEl, message, type = "info") {
  targetEl.textContent = message;
  targetEl.dataset.status = type;
  if (!message) {
    targetEl.removeAttribute("data-status");
    targetEl.style.color = "";
    return;
  }
  if (type === "error") {
    targetEl.style.color = "#c0392b";
  } else if (type === "success") {
    targetEl.style.color = "#2c662d";
  } else {
    targetEl.style.color = "";
  }
}

function ensureUppercaseInput(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement) {
    const { selectionStart, selectionEnd } = target;
    target.value = target.value.toUpperCase();
    if (selectionStart !== null && selectionEnd !== null) {
      target.setSelectionRange(selectionStart, selectionEnd);
    }
  }
}

function toDisplayTime(timestamp) {
  if (!timestamp) return "—";
  try {
    const date = timestamp.toDate();
    return date.toLocaleString();
  } catch (error) {
    logEvent("timestamp.parse.err", { message: error.message });
    return "—";
  }
}

async function fetchFirebaseConfig() {
  logEvent("config.fetch.start");
  let response;
  try {
    response = await fetch("/__/firebase/init.json", { cache: "no-store" });
  } catch (error) {
    logEvent("config.fetch.err", { message: error.message, code: error.code });
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Failed to load Firebase config: ${response.status}`);
    logEvent("config.fetch.err", { status: response.status, statusText: response.statusText });
    throw error;
  }

  const config = await response.json();
  logEvent("config.fetch.ok", { projectId: config.projectId });
  return config;
}

async function initialiseFirebase({ forceFetchConfig = false } = {}) {
  try {
    if (!firebaseConfig || forceFetchConfig) {
      firebaseConfig = await fetchFirebaseConfig();
    }

    if (!firebaseApp) {
      if (getApps().length === 0) {
        firebaseApp = initializeApp(firebaseConfig);
        logEvent("app.init.ok", { projectId: firebaseConfig.projectId });
        console.log(`[Firebase] initialized ${firebaseConfig.projectId}`);
      } else {
        firebaseApp = getApp();
        logEvent("app.init.reuse", { projectId: firebaseConfig.projectId });
      }
    }

    firestoreDb = getFirestore(firebaseApp);
    logEvent("firestore.ready", { projectId: firebaseConfig.projectId });
    envEl.textContent = `${firebaseConfig.projectId} · Firestore ready`;
    return firestoreDb;
  } catch (error) {
    envEl.textContent = "Failed to load Firebase";
    setStatus(playerStatusEl, "Could not initialise Firebase.", "error");
    setStatus(arenaStatusEl, "Could not initialise Firebase.", "error");
    logEvent("app.init.err", { message: error.message, code: error.code });
    throw error;
  }
}

function renderCollectionRow({ name, code, createdAt }, onDelete) {
  const tr = document.createElement("tr");

  const nameTd = document.createElement("td");
  nameTd.textContent = name || "—";
  tr.appendChild(nameTd);

  const codeTd = document.createElement("td");
  codeTd.textContent = code;
  tr.appendChild(codeTd);

  const createdTd = document.createElement("td");
  createdTd.textContent = toDisplayTime(createdAt);
  tr.appendChild(createdTd);

  const actionsTd = document.createElement("td");
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", onDelete);
  actionsTd.appendChild(deleteBtn);
  tr.appendChild(actionsTd);

  return tr;
}

function subscribeToPlayers(db) {
  if (unsubscribePlayers) unsubscribePlayers();
  const playersRef = collection(db, "players");
  const playersQuery = query(playersRef, orderBy("createdAt", "desc"));
  unsubscribePlayers = onSnapshot(
    playersQuery,
    (snapshot) => {
      playersTbody.innerHTML = "";
      let count = 0;
      snapshot.forEach((docSnap) => {
        count += 1;
        const data = docSnap.data();
        const row = renderCollectionRow(
          {
            name: data.name,
            code: data.code || docSnap.id,
            createdAt: data.createdAt,
          },
          () => handlePlayerDelete(docSnap.id)
        );
        playersTbody.appendChild(row);
      });
      playerCountEl.textContent = String(count);
      logEvent("players.snapshot.update", { size: snapshot.size });
    },
    (error) => {
      setStatus(playerStatusEl, "Failed to load players.", "error");
      logEvent("players.snapshot.err", { message: error.message, code: error.code });
    }
  );
}

function subscribeToArenas(db) {
  if (unsubscribeArenas) unsubscribeArenas();
  const arenasRef = collection(db, "arenas");
  const arenasQuery = query(arenasRef, orderBy("createdAt", "desc"));
  unsubscribeArenas = onSnapshot(
    arenasQuery,
    (snapshot) => {
      arenasTbody.innerHTML = "";
      let count = 0;
      snapshot.forEach((docSnap) => {
        count += 1;
        const data = docSnap.data();
        const row = renderCollectionRow(
          {
            name: data.name,
            code: data.code || docSnap.id,
            createdAt: data.createdAt,
          },
          () => handleArenaDelete(docSnap.id)
        );
        arenasTbody.appendChild(row);
      });
      arenaCountEl.textContent = String(count);
      logEvent("arenas.snapshot.update", { size: snapshot.size });
    },
    (error) => {
      setStatus(arenaStatusEl, "Failed to load arenas.", "error");
      logEvent("arenas.snapshot.err", { message: error.message, code: error.code });
    }
  );
}

async function handlePlayerDelete(code) {
  if (!firestoreDb) return;
  if (!confirm(`Delete player ${code}?`)) {
    return;
  }
  logEvent("players.delete.confirm", { code });
  try {
    await deleteDoc(doc(firestoreDb, "players", code));
    setStatus(playerStatusEl, `Player ${code} deleted.`, "success");
    logEvent("players.delete.ok", { code });
  } catch (error) {
    setStatus(playerStatusEl, "Failed to delete player.", "error");
    logEvent("players.delete.err", { code, errCode: error.code, errMsg: error.message });
  }
}

async function handleArenaDelete(code) {
  if (!firestoreDb) return;
  if (!confirm(`Delete arena ${code}?`)) {
    return;
  }
  logEvent("arenas.delete.confirm", { code });
  try {
    await deleteDoc(doc(firestoreDb, "arenas", code));
    setStatus(arenaStatusEl, `Arena ${code} deleted.`, "success");
    logEvent("arenas.delete.ok", { code });
  } catch (error) {
    setStatus(arenaStatusEl, "Failed to delete arena.", "error");
    logEvent("arenas.delete.err", { code, errCode: error.code, errMsg: error.message });
  }
}

function registerPlayerForm(db) {
  playerCodeInput.addEventListener("input", ensureUppercaseInput);
  playerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(playerStatusEl, "");

    const name = playerNameInput.value.trim();
    const code = playerCodeInput.value.trim().toUpperCase();
    playerCodeInput.value = code;

    if (!name) {
      setStatus(playerStatusEl, "Player name is required.", "error");
      playerNameInput.focus();
      return;
    }
    if (!CODE_REGEX.test(code)) {
      setStatus(playerStatusEl, "Code must be 3–16 characters (A–Z, 0–9).", "error");
      playerCodeInput.focus();
      return;
    }

    playerAddBtn.disabled = true;
    logEvent("players.add.submit", { code });

    try {
      const playerRef = doc(db, "players", code);
      const snapshot = await getDoc(playerRef);
      if (snapshot.exists()) {
        setStatus(playerStatusEl, "Code already exists.", "error");
        logEvent("players.add.exists", { code });
        playerAddBtn.disabled = false;
        playerCodeInput.focus();
        return;
      }

      await setDoc(playerRef, {
        name,
        code,
        active: true,
        createdAt: serverTimestamp(),
        currentRoomId: null, // Future: enforce single-room membership per player
      });

      setStatus(playerStatusEl, `Player ${name} (${code}) added.`, "success");
      logEvent("players.add.ok", { code });
      playerForm.reset();
      playerNameInput.focus();
    } catch (error) {
      setStatus(playerStatusEl, "Failed to add player.", "error");
      logEvent("players.add.err", { code, errCode: error.code, errMsg: error.message });
    } finally {
      playerAddBtn.disabled = false;
    }
  });
}

function registerArenaForm(db) {
  arenaCodeInput.addEventListener("input", ensureUppercaseInput);
  arenaForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(arenaStatusEl, "");

    const name = arenaNameInput.value.trim();
    const code = arenaCodeInput.value.trim().toUpperCase();
    arenaCodeInput.value = code;

    if (!name) {
      setStatus(arenaStatusEl, "Arena name is required.", "error");
      arenaNameInput.focus();
      return;
    }
    if (!CODE_REGEX.test(code)) {
      setStatus(arenaStatusEl, "Code must be 3–16 characters (A–Z, 0–9).", "error");
      arenaCodeInput.focus();
      return;
    }

    arenaAddBtn.disabled = true;
    logEvent("arenas.add.submit", { code });

    try {
      const arenaRef = doc(db, "arenas", code);
      const snapshot = await getDoc(arenaRef);
      if (snapshot.exists()) {
        setStatus(arenaStatusEl, "Code already exists.", "error");
        logEvent("arenas.add.exists", { code });
        arenaAddBtn.disabled = false;
        arenaCodeInput.focus();
        return;
      }

      await setDoc(arenaRef, {
        name,
        code,
        active: true,
        createdAt: serverTimestamp(),
      });

      setStatus(arenaStatusEl, `Arena ${name} (${code}) added.`, "success");
      logEvent("arenas.add.ok", { code });
      arenaForm.reset();
      arenaNameInput.focus();
    } catch (error) {
      setStatus(arenaStatusEl, "Failed to add arena.", "error");
      logEvent("arenas.add.err", { code, errCode: error.code, errMsg: error.message });
    } finally {
      arenaAddBtn.disabled = false;
    }
  });
}

async function runHealthInit() {
  try {
    await initialiseFirebase({ forceFetchConfig: true });
    logEvent("health.init.ok", { projectId: firebaseConfig?.projectId });
  } catch (error) {
    logEvent("health.init.err", { message: error.message, code: error.code });
  }
}

async function runHealthPing() {
  const routes = ["/", "/lobby", "/admin"];
  for (const route of routes) {
    try {
      const response = await fetch(route, { cache: "no-store" });
      logEvent("health.ping", { route, status: response.status });
    } catch (error) {
      logEvent("health.ping.err", { route, message: error.message, code: error.code });
    }
  }
}

async function runHealthRead() {
  if (!firestoreDb) {
    logEvent("health.read.err", { message: "Firestore not initialised" });
    return;
  }
  try {
    const docRef = doc(firestoreDb, "players", "__NON_EXISTENT__");
    const snapshot = await getDoc(docRef);
    logEvent("health.read.ok", { exists: snapshot.exists() });
  } catch (error) {
    logEvent("health.read.err", { message: error.message, code: error.code });
  }
}

async function runHealthWrite() {
  if (!firestoreDb) {
    logEvent("health.write.err", { message: "Firestore not initialised" });
    return;
  }
  try {
    const diagRef = doc(firestoreDb, "diag", "WRITE_TEST");
    await setDoc(diagRef, { ts: serverTimestamp(), rand: Math.random() });
    logEvent("health.write.ok", {});
  } catch (error) {
    logEvent("health.write.err", { code: error.code, message: error.message });
  }
}

function registerDiagnostics() {
  copyLogBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(debugLogEl.value);
      logEvent("debug.copy.ok");
    } catch (error) {
      logEvent("debug.copy.err", { message: error.message });
    }
  });

  clearLogBtn.addEventListener("click", () => {
    logLines = [];
    persistLog();
    renderLog();
    console.log(`${new Date().toISOString()} debug.clear.ok`);
  });

  healthInitBtn.addEventListener("click", () => {
    runHealthInit();
  });
  healthPingBtn.addEventListener("click", () => {
    runHealthPing();
  });
  healthReadBtn.addEventListener("click", () => {
    runHealthRead();
  });
  healthWriteBtn.addEventListener("click", () => {
    runHealthWrite();
  });
}

async function main() {
  loadLogFromSession();
  renderLog();
  logEvent("admin.page.load", {});

  try {
    const db = await initialiseFirebase();
    registerPlayerForm(db);
    registerArenaForm(db);
    subscribeToPlayers(db);
    subscribeToArenas(db);
  } catch (error) {
    logEvent("admin.init.failed", { message: error.message });
  }

  registerDiagnostics();
}

main().catch((error) => {
  logEvent("admin.fatal", { message: error.message });
});
