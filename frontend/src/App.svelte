<script>
  import { onMount } from 'svelte';
  import emojiData from '../asset/emojis.json';

  const keyFromPath = (path) => path.split('/').pop().replace(/\.[^.]+$/, '');
  const emojiList = emojiData.emojis.map((emoji, index) => ({
    ...emoji,
    id: index + 1,
    key: keyFromPath(emoji.path)
  }));
  const emojiByKey = Object.fromEntries(emojiList.map((emoji) => [emoji.key, emoji]));
  const emojiByName = Object.fromEntries(emojiList.map((emoji) => [emoji.nom, emoji]));
  const emojiDrawings = emojiList.map((emoji) => emoji.key);

  const defaultEmojis = Object.fromEntries(
    emojiData.defaults.map((name, index) => [emojiByName[name].key, index + 1])
  );
  
  const targetIds = Object.values(defaultEmojis);

  let port;
  let score = 0;
  let scoreText = 'SCORE: 0';
  let emojis = { ...defaultEmojis };
  let selectedEmojiByTarget = getSelectedEmojiByTarget(emojis);
  let availableKeys = Object.keys(defaultEmojis);
  let currentKey = 'christian';
  let currentTargetId = defaultEmojis[currentKey];
  let characterSrc = targetSrc(currentKey);
  let connectHidden = false;
  let debugHidden = true;
  let isCountingDown = false;
  let restartRequested = false;

  onMount(() => {
    loadConfigFromStorage();

    const handleKeydown = (event) => {
      if (
        event.key === '²' ||
        event.key === 'ù' ||
        event.key === '√' ||
        event.code === 'BracketRight' ||
        event.code === 'Backquote'
      ) {
        event.preventDefault();
        debugHidden = !debugHidden;
      }
    };

    document.addEventListener('keydown', handleKeydown);

    return () => document.removeEventListener('keydown', handleKeydown);
  });

  function targetSrc(key) {
    return emojiByKey[key].path;
  }

  function getEmojiForTarget(targetId) {
    return Object.keys(emojis).find((key) => emojis[key] === targetId);
  }

  function getSelectedEmojiByTarget(sourceEmojis) {
    return Object.fromEntries(
      targetIds.map((targetId) => [
        targetId,
        Object.keys(sourceEmojis).find((key) => sourceEmojis[key] === targetId)
      ])
    );
  }

  function getAssignedEmojiKeys() {
    return targetIds.map(getEmojiForTarget).filter(Boolean);
  }

  function assignEmojiToTarget(targetId, newKey) {
    const nextEmojis = { ...emojis };
    const previousKeyForTarget = Object.keys(nextEmojis).find((key) => nextEmojis[key] === targetId);
    const previousTargetForKey = nextEmojis[newKey];

    if (previousKeyForTarget) {
      delete nextEmojis[previousKeyForTarget];
    }

    if (previousTargetForKey && previousTargetForKey !== targetId && previousKeyForTarget) {
      nextEmojis[previousKeyForTarget] = previousTargetForKey;
    }

    nextEmojis[newKey] = targetId;
    emojis = nextEmojis;
    selectedEmojiByTarget = getSelectedEmojiByTarget(emojis);
  }

  function formatEmojiName(key) {
    return emojiByKey[key].nom;
  }

  function loadConfigFromStorage() {
    const saved = localStorage.getItem('emojisConfig');
    if (!saved) return;

    try {
      const savedConfig = JSON.parse(saved);
      emojis = { ...defaultEmojis };

      for (const targetId of targetIds) {
        const savedKey = emojiDrawings.find((key) => savedConfig[key] === targetId);
        if (savedKey) {
          assignEmojiToTarget(targetId, savedKey);
        }
      }

      console.log('Config loaded from localStorage:', emojis);
    } catch (error) {
      console.error('Erreur lors du chargement de la config:', error);
    }
  }

  function saveConfigToStorage() {
    localStorage.setItem('emojisConfig', JSON.stringify(emojis));
    console.log('Config saved to localStorage:', emojis);
  }

  function startGame() {
    availableKeys = getAssignedEmojiKeys();
    score = 0;
    updateScore();
    updateTarget();
  }

  function restartGame() {
    if (isCountingDown) {
      restartRequested = true;
    }

    startGame();
  }

  function changeTarget(targetId, event) {
    const newValue = event.currentTarget.value;
    assignEmojiToTarget(targetId, newValue);
    console.log(`Target ${targetId} changed to: ${newValue}`);
    saveConfigToStorage();
  }

  function updateScore() {
    scoreText = `Score: ${score}`;
  }

  function updateTarget() {
    const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    currentKey = randomKey;
    currentTargetId = emojis[currentKey];
    characterSrc = targetSrc(currentKey);
  }

  async function mainloop(readerStream, writer) {
    startGame();

    let buffer = '';

    while (true) {
      const { value, done } = await readerStream.read();
      if (done) break;
      if (!value) continue;

      buffer += value;

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line) continue;

        const finished = await handleMessage(line, writer);
        if (finished) return;
      }
    }
  }

  async function handleMessage(line, writer) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      console.log('Unknown message:', line);
      return false;
    }

    const type = line.slice(0, separatorIndex);
    const payload = line.slice(separatorIndex + 1).trim();

    if (type === 'debug') {
      console.log('Arduino debug:', payload);
      return false;
    }

    // A hit happens when a target jumps and releases its switch ("up").
    // "down" means the target was placed back upright; we ignore it.
    if (type !== 'up') {
      return false;
    }

    const triggeredTarget = parseInt(payload, 10);
    if (Number.isNaN(triggeredTarget)) return false;

    return registerHit(triggeredTarget, writer);
  }

  async function registerHit(triggeredTarget, writer) {
    if (triggeredTarget === currentTargetId) {
      console.log('Hit :', currentKey);
      availableKeys = availableKeys.filter((key) => key !== currentKey);
      score += 5;
    } else {
      console.log('Missed : ', currentKey);
      if (score >= 5) {
        score -= 2;
      }

      const triggeredEmojiName = getEmojiForTarget(triggeredTarget);
      if (triggeredEmojiName) {
        console.log(`Removed ${triggeredEmojiName} (${triggeredTarget})`);
        availableKeys = availableKeys.filter((key) => key !== triggeredEmojiName);
      }
    }

    updateScore();

    if (availableKeys.length === 0) {
      console.log('Toutes les cibles ont été touchées !');
      characterSrc = 'asset/fest.svg';
      await writer.write('effects:fireworks');
      console.log("Command 'effects:fireworks' sent to make LED blinks");
      return true;
    }

    updateTarget();
    return false;
  }

  async function countdown() {
    isCountingDown = true;

    for (let i = 5; i > 0; i--) {
      if (restartRequested) break;

      scoreText = `Prochaine partie dans... ${i}`;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    restartRequested = false;
    isCountingDown = false;
  }

  async function connect() {
    if (!('serial' in navigator)) {
      alert('Erreur : Web Serial API non supportée par ce navigateur.');
      return;
    }

    connectHidden = true;

    try {
      const filters = [
        { usbVendorId: 0x2341, usbProductId: 0x0043 },
        { usbVendorId: 0x2341, usbProductId: 0x0001 }
      ];

      port = await navigator.serial.requestPort({ filters });
      await port.open({ baudRate: 9600 });
      alert('Connecté');

      console.log('Port open, waiting for inputs...\n');

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const readerStream = textDecoder.readable.getReader();

      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(port.writable);
      const writer = textEncoder.writable.getWriter();

      while (true) {
        await mainloop(readerStream, writer);
        await countdown();
      }
    } catch (error) {
      alert('Erreur lors de connexion, regardez la console');
      console.error(error);
      console.log(`\nErreur : ${error}`);
      connectHidden = false;
    } finally {
      if (port) {
        await port.close();
      }
    }
  }
</script>

{#if !connectHidden}
  <button id="connect" onclick={connect}>Connecter</button>
{/if}

<img src="asset/sourcecode-qrcode.svg" alt="QR code du code source" class="source-qrcode" />

<div class:hidden={debugHidden} class="debug-menu">
  <div class="debug-header">
    <h3>Debug Menu</h3>
  </div>
  <div class:hidden={debugHidden} class="debug-content">
    <div class="debug-section">
      <button class="reset-btn" onclick={restartGame}>Recommencer</button>
      <p class="debug-label">Cibles assignées:</p>
      <div class="targets-grid">
        {#each targetIds as targetId}
          <div class="target-item">
            <span>Cible {targetId}:</span>
            <select
              id={`target-${targetId}`}
              class="target-select"
              value={selectedEmojiByTarget[targetId]}
              onchange={(event) => changeTarget(targetId, event)}
            >
              {#each emojiDrawings as key}
                <option value={key}>{formatEmojiName(key)}</option>
              {/each}
            </select>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<div class="main-content">
  <div class="topbar">
    <h1>Emoji Shooter</h1>
  </div>

  <div class="game-area">
    <img src={characterSrc} alt="Personnage" class="character" />
  </div>

  <div class="score-container">
    <div id="score">{scoreText}</div>
  </div>
</div>
