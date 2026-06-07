const btnConnect = document.getElementById('connect');
const scoreElement = document.getElementById('score');
const character = document.querySelector(".character");
const debugMenu = document.querySelector('.debug-menu');
const debugContent = document.getElementById('debugContent');

let port;
let score = 0;

// Dictionnaire des emojis (clés par défaut)
let emojisNames = {
  "christian": 1,
  "adrien": 2,
  "erell": 3,
  "thibo": 4,
  "poop": 5,
  "cry": 6
};

const emojiDrawings = [
  "christian",
  "adrien",
  "erell",
  "thibo",
  "poop",
  "cry",
  "devil",
  "laugh",
  "thug",
  "kiss",
  "chocked"
];

// Dictionnaire mutable pour les assignments
let emojis = JSON.parse(JSON.stringify(emojisNames));

let availableKeys = Object.keys(emojis);
const targetCount = Object.keys(emojisNames).length;

function getEmojiForTarget(targetId) {
  return Object.keys(emojis).find(k => emojis[k] === targetId);
}

function getAssignedEmojiKeys() {
  return Array.from({ length: targetCount }, (_, i) => getEmojiForTarget(i + 1)).filter(Boolean);
}

function assignEmojiToTarget(targetId, newKey) {
  const previousKeyForTarget = getEmojiForTarget(targetId);
  const previousTargetForKey = emojis[newKey];

  if (previousKeyForTarget) {
    delete emojis[previousKeyForTarget];
  }

  if (previousTargetForKey && previousTargetForKey !== targetId && previousKeyForTarget) {
    emojis[previousKeyForTarget] = previousTargetForKey;
  }

  emojis[newKey] = targetId;
}

function syncTargetControls() {
  for (let i = 1; i <= targetCount; i++) {
    const select = document.getElementById(`target-${i}`);
    const assignedKey = getEmojiForTarget(i);
    if (select && assignedKey) {
      select.value = assignedKey;
    }
  }
}

function formatEmojiName(key) {
  if (key === 'chocked') return 'Choqué';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function ensureTargetControls() {
  const grid = document.querySelector('.targets-grid');
  if (!grid) return;

  for (let i = 1; i <= targetCount; i++) {
    let select = document.getElementById(`target-${i}`);

    if (!select) {
      const targetItem = document.createElement('div');
      targetItem.className = 'target-item';

      const label = document.createElement('span');
      label.textContent = `Cible ${i}:`;

      select = document.createElement('select');
      select.id = `target-${i}`;
      select.className = 'target-select';

      targetItem.append(label, select);
      grid.appendChild(targetItem);
    }

    select.replaceChildren();
    for (const key of emojiDrawings) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = formatEmojiName(key);
      select.appendChild(option);
    }
  }
}

ensureTargetControls();

// Hide debug menu by default
debugContent.classList.add('hidden');
debugMenu.classList.add('hidden');

// Debug menu toggle function
function toggleDebugMenu() {
  debugContent.classList.toggle('hidden');
  debugMenu.classList.toggle('hidden');
}

// Keyboard shortcut to toggle debug menu
document.addEventListener('keydown', (e) => {
  // Check for ² (touche au carré) or ù (touche accent grave)
  if (e.key === '²' || e.key === 'ù' || e.key === '√' || e.code === 'BracketRight' || e.code === 'Backquote') {
    e.preventDefault();
    toggleDebugMenu();
  }
});

// Load config from localStorage
function loadConfigFromStorage() {
  const saved = localStorage.getItem('emojisConfig');
  if (saved) {
    try {
      const savedConfig = JSON.parse(saved);
      emojis = JSON.parse(JSON.stringify(emojisNames));

      for (let i = 1; i <= targetCount; i++) {
        const savedKey = emojiDrawings.find(k => savedConfig[k] === i);
        if (savedKey) {
          assignEmojiToTarget(i, savedKey);
        }
      }

      console.log('Config loaded from localStorage:', emojis);
    } catch (e) {
      console.error('Erreur lors du chargement de la config:', e);
    }
  }
}

// Save config to localStorage
function saveConfigToStorage() {
  localStorage.setItem('emojisConfig', JSON.stringify(emojis));
  console.log('Config saved to localStorage:', emojis);
}

// Reset config to defaults
function resetConfig() {
  emojis = JSON.parse(JSON.stringify(emojisNames));
  localStorage.removeItem('emojisConfig');
  // Update UI
  syncTargetControls();
  console.log('Config reset to defaults');
}

// Load config on startup
loadConfigFromStorage();

// Reset button handler
const resetBtn = document.getElementById('resetConfig');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (confirm('Êtes-vous sûr de vouloir réinitialiser la configuration ?')) {
      resetConfig();
    }
  });
}

// Change handlers pour les dropdowns
for (let i = 1; i <= targetCount; i++) {
  const select = document.getElementById(`target-${i}`);
  if (select) {
    // Set default value based on current emojis (from storage or defaults)
    const defaultKey = getEmojiForTarget(i);
    if (defaultKey) {
      select.value = defaultKey;
    }
    
    select.addEventListener('change', (e) => {
      const newValue = e.target.value;
      // Update emojis dictionary
      assignEmojiToTarget(i, newValue);
      syncTargetControls();
      console.log(`Target ${i} changed to: ${newValue}`);
      // Save to localStorage
      saveConfigToStorage();
    });
  }
}

// Cible actuelle
let currentKey;
let current_id;

function updateScore() {
  scoreElement.textContent = "Score: " + score;
}

function updateTarget() {
  const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
  character.src = `asset/targets/${randomKey}.svg`;
  currentKey = randomKey;
  current_id = emojis[currentKey];
}

async function mainloop(readerStream, writer) {
  // Full reset
  availableKeys = getAssignedEmojiKeys();
  score = 0;
  updateScore();
  updateTarget();

  while (true) {
    const { value, done } = await readerStream.read();
    if (done) break;

    if (value) {
      let triggeredTargetUnsafe = parseInt(value.trim(), 10);
      if (isNaN(triggeredTargetUnsafe)) {
        continue;
      }

      let triggeredTarget = triggeredTargetUnsafe;

      if (triggeredTarget === current_id) {
        console.log("Hit :", currentKey);

        availableKeys = availableKeys.filter(k => k !== currentKey);

        score += 5;
        updateScore();
      } else {
        console.log("Missed : ", currentKey);
        if (score >= 5) {
          score -= 2;
        }

        const triggeredEmojiName = getEmojiForTarget(triggeredTarget);
        if (triggeredEmojiName) {
          console.log("Removed " + triggeredEmojiName + " (" + triggeredTarget+")");
          availableKeys = availableKeys.filter(k => k !== triggeredEmojiName);
        }
        updateScore();
      }
      // Vérifier s’il reste des cibles
      if (availableKeys.length === 0) {
        console.log("Toutes les cibles ont été touchées !");
        character.src = "asset/fest.svg";

        // Send 'f' command to trigger LED blink
        await writer.write('f');
        console.log("Command 'f' sent to make LED blinks");

        break;
      }

      updateTarget();
    }
  }
}

async function countdown() {
  for (let i = 5; i > 0; i--) {
    scoreElement.textContent = `Prochaine partie dans... ${i}`;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

btnConnect.addEventListener('click', async () => {
  if (!('serial' in navigator)) {
    alert("Erreur : Web Serial API non supportée par ce navigateur.");
    return;
  }

  btnConnect.hidden = true;

  try {
    const filters = [
      { usbVendorId: 0x2341, usbProductId: 0x0043 },
      { usbVendorId: 0x2341, usbProductId: 0x0001 }
    ];

    // Prompt user to select an Arduino Uno device.
    port = await navigator.serial.requestPort({ filters });
    await port.open({ baudRate: 9600 });
    alert("Connecté");

    console.log("Port open, waiting for inputs...\n");

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const readerStream = textDecoder.readable.getReader();

    const textEncoder = new TextEncoderStream();
    const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    const writer = textEncoder.writable.getWriter();

    while (true) {
      await mainloop(readerStream, writer);
      await countdown();
      //await new Promise(resolve => setTimeout(resolve, 1000));
      alert("Appuyez sur Entrée pour recommencer");
    }

  } catch (err) {
    alert("Erreur lors de connexion, regardez la console");
    console.error(err);
    console.log(`\nErreur : ${err}`);
  } finally {
    if (port) {
      await port.close();
    }
  }
});
