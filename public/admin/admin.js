import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
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

const form = document.getElementById("addPlayerForm");
const nameInput = document.getElementById("playerName");
const codeInput = document.getElementById("playerCode");
const addBtn = document.getElementById("addBtn");
const statusEl = document.getElementById("status");
const envEl = document.getElementById("env");
const countEl = document.getElementById("count");
const playersTbody = document.getElementById("playersTbody");

const CODE_REGEX = /^[A-Z0-9]{3,16}$/;
let firestoreDb;

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  if (!message) {
    statusEl.removeAttribute("data-status");
    statusEl.style.color = "";
    return;
  }
  statusEl.dataset.status = type;
  statusEl.style.color = type === "error" ? "#c0392b" : type === "success" ? "#2c662d" : "";
}

function toDisplayTime(timestamp) {
  if (!timestamp) return "—";
  try {
    const date = timestamp.toDate();
    return date.toLocaleString();
  } catch (err) {
    console.error("Failed to parse timestamp", err);
    return "—";
  }
}

async function initFirebase() {
  try {
    const response = await fetch("/__/firebase/init.json");
    if (!response.ok) {
      throw new Error(`Failed to load Firebase config: ${response.status}`);
    }
    const config = await response.json();
    const app = initializeApp(config);
    const db = getFirestore(app);
    console.log(`[Firebase] initialized ${config.projectId}`);
    envEl.textContent = `${config.projectId} · Firestore ready`;
    return { db };
  } catch (error) {
    console.error(error);
    envEl.textContent = "Failed to load Firebase";
    setStatus("Could not initialise Firebase.", "error");
    throw error;
  }
}

function renderPlayers(snapshot) {
  playersTbody.innerHTML = "";
  let count = 0;
  snapshot.forEach((docSnap) => {
    count += 1;
    const data = docSnap.data();
    const tr = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.textContent = data.name || "—";
    tr.append(nameTd);

    const codeTd = document.createElement("td");
    codeTd.textContent = data.code || docSnap.id;
    tr.append(codeTd);

    const createdTd = document.createElement("td");
    createdTd.textContent = toDisplayTime(data.createdAt);
    tr.append(createdTd);

    const actionsTd = document.createElement("td");
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.code = docSnap.id;
    deleteBtn.addEventListener("click", async () => {
      const { code } = deleteBtn.dataset;
      if (!code) return;
      if (!confirm(`Delete player ${code}?`)) {
        return;
      }
      setStatus("");
      try {
        await deleteDoc(doc(firestoreDb, "players", code));
        setStatus(`Player ${code} deleted.`, "success");
      } catch (error) {
        console.error(error);
        setStatus("Failed to delete player.", "error");
      }
    });
    actionsTd.append(deleteBtn);
    tr.append(actionsTd);

    playersTbody.append(tr);
  });
  countEl.textContent = String(count);
}

function ensureUppercaseInput(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    target.value = target.value.toUpperCase();
    if (start !== null && end !== null) {
      target.setSelectionRange(start, end);
    }
  }
}

(async () => {
  let db;
  try {
    ({ db } = await initFirebase());
  } catch (error) {
    return;
  }

  firestoreDb = db;

  codeInput.addEventListener("input", ensureUppercaseInput);

  const playersRef = collection(db, "players");
  const playersQuery = query(playersRef, orderBy("createdAt", "desc"));
  onSnapshot(
    playersQuery,
    (snapshot) => {
      renderPlayers(snapshot);
    },
    (error) => {
      console.error(error);
      setStatus("Failed to load players.", "error");
    }
  );

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    const name = nameInput.value.trim();
    let code = codeInput.value.trim().toUpperCase();
    codeInput.value = code;

    if (!name) {
      setStatus("Player name is required.", "error");
      nameInput.focus();
      return;
    }

    if (!CODE_REGEX.test(code)) {
      setStatus("Code must be 3–16 characters (A–Z, 0–9).", "error");
      codeInput.focus();
      return;
    }

    addBtn.disabled = true;

    try {
      const docRef = doc(db, "players", code);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        setStatus("Code already exists.", "error");
        addBtn.disabled = false;
        codeInput.focus();
        return;
      }

      await setDoc(docRef, {
        name,
        code,
        active: true,
        createdAt: serverTimestamp(),
      });

      setStatus(`Player ${name} (${code}) added.`, "success");
      form.reset();
      nameInput.focus();
    } catch (error) {
      console.error(error);
      setStatus("Failed to add player.", "error");
    } finally {
      addBtn.disabled = false;
    }
  });
})();
