import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const gatePanel = document.getElementById("gatePanel");
const gateCodeInput = document.getElementById("gateCode");
const gateBtn = document.getElementById("gateBtn");
const gateStatus = document.getElementById("gateStatus");
const welcomeStrip = document.getElementById("welcomeStrip");
const playerNameEl = document.getElementById("playerName");
const playerCodeEl = document.getElementById("playerCode");
const changePlayerBtn = document.getElementById("changePlayer");
const lobbyContent = document.getElementById("lobbyContent");

const CODE_REGEX = /^[A-Z0-9]{3,16}$/;
let firestoreDb;

function setGateStatus(message, type = "info") {
  gateStatus.textContent = message;
  gateStatus.style.color =
    type === "error" ? "#c0392b" : type === "success" ? "#2c662d" : "";
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

function setLobbyState(player) {
  if (player) {
    gatePanel.classList.add("hidden");
    welcomeStrip.classList.remove("hidden");
    lobbyContent.classList.remove("hidden");
    playerNameEl.textContent = player.name || "Player";
    playerCodeEl.textContent = player.code;
  } else {
    welcomeStrip.classList.add("hidden");
    lobbyContent.classList.add("hidden");
    gatePanel.classList.remove("hidden");
    playerNameEl.textContent = "";
    playerCodeEl.textContent = "";
  }
}

function cachePlayer(player) {
  if (player) {
    localStorage.setItem("playerCode", player.code);
    localStorage.setItem("playerName", player.name || "");
  } else {
    localStorage.removeItem("playerCode");
    localStorage.removeItem("playerName");
  }
}

async function initFirebase() {
  const response = await fetch("/__/firebase/init.json");
  if (!response.ok) {
    throw new Error(`Failed to load Firebase config: ${response.status}`);
  }
  const config = await response.json();
  const app = initializeApp(config);
  firestoreDb = getFirestore(app);
  console.log(`[Firebase] initialized ${config.projectId}`);
}

async function fetchPlayerByCode(code) {
  if (!firestoreDb) return null;
  const docRef = doc(firestoreDb, "players", code);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data();
  if (data.active === false) {
    return null;
  }
  return {
    name: data.name || "",
    code: snapshot.id,
    active: data.active !== false,
  };
}

async function trySignInWithCode(code) {
  const player = await fetchPlayerByCode(code);
  if (!player) {
    setGateStatus("Invalid or inactive code.", "error");
    cachePlayer(null);
    setLobbyState(null);
    return false;
  }

  cachePlayer(player);
  setLobbyState(player);
  setGateStatus("");
  return true;
}

(async () => {
  try {
    await initFirebase();
  } catch (error) {
    console.error(error);
    setGateStatus("Unable to initialise lobby.", "error");
    gateBtn.disabled = true;
    return;
  }

  gateCodeInput.addEventListener("input", ensureUppercaseInput);

  const storedCode = localStorage.getItem("playerCode");
  if (storedCode) {
    const normalized = storedCode.toUpperCase();
    gateCodeInput.value = normalized;
    try {
      const player = await fetchPlayerByCode(normalized);
      if (player) {
        cachePlayer(player);
        setLobbyState(player);
        setGateStatus("");
      } else {
        cachePlayer(null);
        setLobbyState(null);
      }
    } catch (error) {
      console.error(error);
      cachePlayer(null);
      setLobbyState(null);
      setGateStatus("Unable to verify stored code.", "error");
    }
  } else {
    setLobbyState(null);
  }

  if (!storedCode || welcomeStrip.classList.contains("hidden")) {
    gateCodeInput.focus();
  }

  gateBtn.addEventListener("click", async () => {
    setGateStatus("");
    let code = gateCodeInput.value.trim().toUpperCase();
    gateCodeInput.value = code;

    if (!CODE_REGEX.test(code)) {
      setGateStatus("Enter a 3–16 character code (A–Z, 0–9).", "error");
      gateCodeInput.focus();
      return;
    }

    gateBtn.disabled = true;
    try {
      const success = await trySignInWithCode(code);
      if (success) {
        gateCodeInput.value = "";
      }
    } catch (error) {
      console.error(error);
      setGateStatus("Unable to verify code.", "error");
    } finally {
      gateBtn.disabled = false;
    }
  });

  changePlayerBtn.addEventListener("click", () => {
    cachePlayer(null);
    setLobbyState(null);
    gateCodeInput.value = "";
    setGateStatus("");
    gateCodeInput.focus();
  });
})();
