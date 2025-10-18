const btnConnect = document.getElementById('connect');
const scoreElement = document.getElementById('score');
const character = document.querySelector(".character");

let port;
let score = 0;

// Dictionnaire des emojis
let emojis = {
  "christian":1,
  "adrien":2,
  "erell":3,
  "thibo":4,
  "poop":5,
  "cry":6,
};

let availableKeys = Object.keys(emojis);

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
      if(isNaN(triggeredTargetUnsafe)){
          continue;
      }

      let triggeredTarget = triggeredTargetUnsafe;
      
      if (triggeredTarget === current_id) {
        console.log("Touché :", currentKey);

        availableKeys = availableKeys.filter(k => k !== currentKey);

        score += 5;
        updateScore();
        updateTarget();
      } else {
        console.log("Raté : ",currentKey);
        if (score >= 5) {
            score -= 2;
        }
        
        triggeredEmojiName = Object.keys(emojis)[triggeredTarget - 1];
        console.log("retire "+triggeredEmojiName+" "+triggeredTarget);
        availableKeys = availableKeys.filter(k => k !== triggeredEmojiName);
        updateScore();
      }
      // Vérifier s’il reste des cibles
      if (availableKeys.length === 0) {
        console.log("Toutes les cibles ont été touchées !");
        character.src = "asset/fest.svg";
        
        // Send 'f' command to trigger LED blink
        await writer.write('f');
        console.log("Commande 'f' envoyée pour faire clignoter les LEDs");
        
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
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    alert("Connecté");

    console.log("Port ouvert. En attente de données...\n");

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
