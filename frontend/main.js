const btnConnect = document.getElementById('connect');
const scoreElement = document.getElementById('score');
const character = document.querySelector(".character");

let port;
let score = 0;

// Dictionnaire des emojis
let emojis = {"cricri":0,"happy":1,"kiss":2,"love":3};

// Liste dynamique des cibles disponibles
let availableKeys = Object.keys(emojis);

// Cible courante
let currentKey = "cricri";
let current_id = emojis[currentKey];

btnConnect.addEventListener('click', async () => {
  if (!('serial' in navigator)) {
    console.log("Erreur : Web Serial API non supportée par ce navigateur.");
    return;
  }

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    console.log("Port ouvert. En attente de données...\n");

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const readerStream = textDecoder.readable.getReader();

    while (true) {
      const { value, done } = await readerStream.read();
      if (done) break;

      if (value) {
        if (parseInt(value.trim(), 10) === current_id) {
          console.log("Touché :", currentKey);

          // Retirer la cible actuelle de la liste
          availableKeys = availableKeys.filter(k => k !== currentKey);

          // Ajouter du score
          score += 5;
          scoreElement.textContent = "Score: " + score;

          // Vérifier s’il reste des cibles
          if (availableKeys.length === 0) {
            console.log("Toutes les cibles ont été touchées !");
            character.src = "asset/victory.svg"; // image de fin
            break;
          }

          // Choisir une nouvelle cible au hasard
          const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
          character.src = `asset/${randomKey}.svg`;
          currentKey = randomKey;
          current_id = emojis[currentKey];
        }
      }
    }
  } catch (err) {
    console.error(err);
    console.log(`\nErreur : ${err}`);
  }
});
