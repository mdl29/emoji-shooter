const btnConnect = document.getElementById('connect');
const scoreElement = document.getElementById('score');

let port;
let score = 0;

btnConnect.addEventListener('click', async () => {
  // Vérifier que l’API est supportée
  if (!('serial' in navigator)) {
    println("Erreur : Web Serial API non supportée par ce navigateur.");
    return;
  }

  try {
    // Demande à l’utilisateur de choisir un port
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });

    println("Port ouvert. En attente de données...\n");

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const readerStream = textDecoder.readable.getReader();

    // Boucle de lecture
    while (trueè) {
      const { value, done } = await readerStream.read();
      if (done) break; // flux fermé

      if (value) {
        if (value.trim() === "2") {
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
