const btnConnect = document.getElementById('connect');
const scoreElement = document.getElementById('score');
const character = document.getElementById("character");

let port;
let score = 0;

let emojis = {"cricri":0,"happy":1,"kiss":2,"love":3};

const current_id = emojis['cricri']

btnConnect.addEventListener('click', async () => {
  if (!('serial' in navigator)) {
    println("Erreur : Web Serial API non supportée par ce navigateur.");
    return;
  }

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    println("Port ouvert. En attente de données...\n");

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const readerStream = textDecoder.readable.getReader();

    while (true) {
      const { value, done } = await readerStream.read();
      if (done) break;

      if (value) {
        if (value.trim() === current_id) {
          const keys = Object.keys(emojis);
          const randomKey = keys[Math.floor(Math.random() * keys.length)];
          character.src = `asset/${randomKey}.svg`;
          score += 5;
          scoreElement.textContent = "Score: " + score;
        }
      }
    }
  } catch (err) {
    console.error(err);
    prinln(`\nErreur : ${err}`);
  }
});
