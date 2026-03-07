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
  "cry": 6,
};

// Dictionnaire mutable pour les assignments
let emojis = JSON.parse(JSON.stringify(emojisNames));

let availableKeys = Object.keys(emojis);

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
      emojis = JSON.parse(saved);
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
  for (let i = 1; i <= 6; i++) {
    const select = document.getElementById(`target-${i}`);
    if (select) {
      const defaultKey = Object.keys(emojisNames).find(k => emojisNames[k] === i);
      if (defaultKey) {
        select.value = defaultKey;
      }
    }
  }
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
for (let i = 1; i <= 6; i++) {
  const select = document.getElementById(`target-${i}`);
  if (select) {
    // Set default value based on current emojis (from storage or defaults)
    const defaultKey = Object.keys(emojis).find(k => emojis[k] === i);
    if (defaultKey) {
      select.value = defaultKey;
    }
    
    select.addEventListener('change', (e) => {
      const newValue = e.target.value;
      // Update emojis dictionary
      emojis[newValue] = i;
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
  availableKeys = Object.keys(emojis);
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
        updateTarget();
      } else {
        console.log("Missed : ", currentKey);
        if (score >= 5) {
          score -= 2;
        }

        triggeredEmojiName = Object.keys(emojis)[triggeredTarget - 1];
        console.log("Removed " + triggeredEmojiName + " (" + triggeredTarget+")");
        availableKeys = availableKeys.filter(k => k !== triggeredEmojiName);
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
