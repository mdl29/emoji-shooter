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

  let linkCanvas;
  let linkBusy = false;
  let linkStatus = '';
  let linkPairs = [];
  // Convention : base AprilTag 0..5 <-> cible Arduino 1..6 (baseTag + 1 = cible).
  // Persistée pour pouvoir être recalibrée si le câblage change.
  let baseTagByTarget = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
  // Tag paddle (>5) détecté sur chaque cible (null = base vide / sans paddle).
  let targetTagByTarget = {};
  // Logo (emoji) associé à chaque tag paddle : dit "quel tag a quel id april-tag".
  let logoByTargetTag = {};

  onMount(() => {
    loadConfigFromStorage();
    loadAprilTagConfigFromStorage();

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

  // Retire le logo d'une cible : la base n'a pas de paddle (cible null).
  function unassignTarget(targetId) {
    const nextEmojis = { ...emojis };
    const previousKeyForTarget = Object.keys(nextEmojis).find(
      (key) => nextEmojis[key] === targetId
    );
    if (previousKeyForTarget) {
      delete nextEmojis[previousKeyForTarget];
    }
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
      // Reconstruction depuis zéro : une cible absente = cible null (vide),
      // on ne ré-applique jamais les défauts par-dessus un vide explicite.
      const nextEmojis = {};
      for (const targetId of targetIds) {
        const savedKey = emojiDrawings.find((key) => savedConfig[key] === targetId);
        if (savedKey) {
          nextEmojis[savedKey] = targetId;
        }
      }
      emojis = nextEmojis;
      selectedEmojiByTarget = getSelectedEmojiByTarget(emojis);

      console.log('Config loaded from localStorage:', emojis);
    } catch (error) {
      console.error('Erreur lors du chargement de la config:', error);
    }
  }

  function saveConfigToStorage() {
    localStorage.setItem('emojisConfig', JSON.stringify(emojis));
    console.log('Config saved to localStorage:', emojis);
  }

  function loadAprilTagConfigFromStorage() {
    const saved = localStorage.getItem('aprilTagConfig');
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (parsed.baseTagByTarget) {
        baseTagByTarget = { ...baseTagByTarget, ...parsed.baseTagByTarget };
      }
      if (parsed.targetTagByTarget) {
        targetTagByTarget = { ...parsed.targetTagByTarget };
      }
      if (parsed.logoByTargetTag) {
        logoByTargetTag = { ...parsed.logoByTargetTag };
      }
      console.log('AprilTag config loaded from localStorage:', parsed);
    } catch (error) {
      console.error('Erreur lors du chargement de la config AprilTag:', error);
    }
  }

  function saveAprilTagConfigToStorage() {
    const config = { baseTagByTarget, targetTagByTarget, logoByTargetTag };
    localStorage.setItem('aprilTagConfig', JSON.stringify(config));
    console.log('AprilTag config saved to localStorage:', config);
  }

  // La lib expose des globales (window.CV / window.AR). Si aruco.js a été
  // interrompu (ex. cv.js non chargé avant lui), window.AR peut exister
  // SANS AR.Detector : on vérifie donc chaque morceau explicitement.
  const APRILTAG_VENDOR_SCRIPTS = [
    'vendor/cv.js',
    'vendor/aruco.js',
    'vendor/dictionaries/apriltag_16h5.js'
  ];

  function apriltagLibReady() {
    const AR = window.AR;
    return Boolean(
      window.CV &&
        AR &&
        typeof AR.Detector === 'function' &&
        AR.DICTIONARIES &&
        AR.DICTIONARIES['APRILTAG_16h5']
    );
  }

  function loadVendorScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-vendor="${src}"]`)) {
        resolve();
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.dataset.vendor = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Échec du chargement de ${src}`));
      document.head.appendChild(el);
    });
  }

  // Garantit une lib complète : si les <script> du head ont échoué
  // (cache, ordre, ancienne page), on (re)charge en séquence.
  async function ensureApriltagLib() {
    if (apriltagLibReady()) return;
    for (const src of APRILTAG_VENDOR_SCRIPTS) {
      await loadVendorScript(src);
    }
    if (!apriltagLibReady()) {
      const missing = [];
      if (!window.CV) missing.push('CV (vendor/cv.js)');
      if (!window.AR || typeof window.AR.Detector !== 'function')
        missing.push('AR.Detector (vendor/aruco.js)');
      if (!window.AR || !window.AR.DICTIONARIES || !window.AR.DICTIONARIES['APRILTAG_16h5'])
        missing.push('dictionnaire APRILTAG_16h5 (vendor/dictionaries/apriltag_16h5.js)');
      throw new Error(`Lib AprilTag incomplète, manquant : ${missing.join(', ')}.`);
    }
  }

  function markerCenter(corners) {    let x = 0;
    let y = 0;
    for (const corner of corners) {
      x += corner.x;
      y += corner.y;
    }
    return { x: x / corners.length, y: y / corners.length };
  }

  function loadExampleFrame() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("Impossible de charger l'image exemple (camera_example.png)."));
      img.src = 'camera_example.png';
    });
  }

  // Sépare les tags de bases (0-5) des tags de paddles (>5) et apparie
  // chaque paddle à sa base la plus proche. Contrainte physique : la base
  // est TOUJOURS plus bas que la cible dans l'image (base.y > paddle.y),
  // donc on ignore les bases situées au-dessus du paddle.
  // En cas de conflit (2 paddles -> même base), le plus proche gagne.
  // Une base sans paddle proche reste non liée (base vide possible).
  function pairTargetsToBases(markers) {
    const located = markers.map((marker) => ({
      id: marker.id,
      corners: marker.corners,
      ...markerCenter(marker.corners)
    }));
    const bases = located.filter((marker) => marker.id >= 0 && marker.id <= 5);
    const paddles = located.filter((marker) => marker.id > 5);

    const paddleByBaseTag = new Map();
    for (const paddle of paddles) {
      let nearest = null;
      let nearestDist = Infinity;
      for (const base of bases) {
        // La base est toujours plus bas que la cible posée dessus.
        if (base.y <= paddle.y) continue;
        const dist = Math.hypot(paddle.x - base.x, paddle.y - base.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = base;
        }
      }
      if (!nearest) continue;
      const current = paddleByBaseTag.get(nearest.id);
      if (!current || nearestDist < current.dist) {
        paddleByBaseTag.set(nearest.id, { paddleTag: paddle.id, dist: nearestDist });
      }
    }

    return { bases, paddles, paddleByBaseTag };
  }

  // Décide des mises à jour après détection (fonction pure, testable).
  // - Base sans paddle : la cible devient null (menu "Vide").
  // - Tag paddle déjà connu (tag -> logo appris avant) : la cible prend le
  //   logo connu => met à jour le menu déroulant du dessus.
  // - Tag paddle jamais vu : on apprend le logo actuellement sélectionné.
  // Retourne { assignments: {cibleId: logoKey}, learned: {paddleTag: logoKey},
  //             toEmpty: [cibleId] }.
  function computeLinkUpdates(pairs, emojiForTarget, knownLogoByPaddleTag) {
    const assignments = {};
    const learned = {};
    const toEmpty = [];
    const known = { ...knownLogoByPaddleTag };
    for (const pair of pairs) {
      const currentLogo = emojiForTarget[pair.cibleId];
      if (pair.paddleTag == null) {
        // Pas de cible sur la base => cible null (seulement si changement).
        if (currentLogo) toEmpty.push(pair.cibleId);
        continue;
      }
      const knownLogo = known[pair.paddleTag];
      if (knownLogo) {
        if (knownLogo !== currentLogo) {
          assignments[pair.cibleId] = knownLogo;
        }
      } else if (currentLogo) {
        learned[pair.paddleTag] = currentLogo;
        known[pair.paddleTag] = currentLogo;
      }
    }
    return { assignments, learned, toEmpty };
  }

  function drawLinkPreview(img, bases, paddles, paddleByBaseTag) {
    if (!linkCanvas) return;
    const maxWidth = 320;
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    linkCanvas.width = Math.round(img.naturalWidth * scale);
    linkCanvas.height = Math.round(img.naturalHeight * scale);
    const ctx = linkCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, linkCanvas.width, linkCanvas.height);

    const drawBox = (marker, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(marker.corners[0].x * scale, marker.corners[0].y * scale);
      for (let i = 1; i < marker.corners.length; i++) {
        ctx.lineTo(marker.corners[i].x * scale, marker.corners[i].y * scale);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(`id ${marker.id}`, marker.x * scale + 4, marker.y * scale - 4);
    };

    for (const base of bases) drawBox(base, '#00ff6a');
    for (const paddle of paddles) drawBox(paddle, '#ffcc00');

    ctx.strokeStyle = 'rgba(0, 255, 106, 0.8)';
    ctx.setLineDash([4, 3]);
    for (const [baseTag, hit] of paddleByBaseTag) {
      const base = bases.find((candidate) => candidate.id === baseTag);
      const paddle = paddles.find((candidate) => candidate.id === hit.paddleTag);
      if (!base || !paddle) continue;
      ctx.beginPath();
      ctx.moveTo(base.x * scale, base.y * scale);
      ctx.lineTo(paddle.x * scale, paddle.y * scale);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Fonction "Lier" : détecte les AprilTags sur l'image exemple
  // (même détecteur APRILTAG_16h5 que tools/apriltag-demo), apparie
  // chaque paddle à sa base et associe le logo de la base à son tag.
  async function linkTargetsToBases() {
    if (linkBusy) return;
    linkBusy = true;
    linkStatus = "Chargement de l'image exemple...";
    linkPairs = [];

    try {
      linkStatus = 'Chargement de la lib AprilTag...';
      await ensureApriltagLib();
      const detector = new window.AR.Detector({ dictionaryName: 'APRILTAG_16h5' });
      const img = await loadExampleFrame();
      linkStatus = 'Détection des AprilTags...';
      // Laisse le statut se peindre avant la détection (calcul synchrone coûteux).
      await new Promise((resolve) => setTimeout(resolve, 30));

      const frame = document.createElement('canvas');
      frame.width = img.naturalWidth;
      frame.height = img.naturalHeight;
      const frameCtx = frame.getContext('2d', { willReadFrequently: true });
      frameCtx.drawImage(img, 0, 0);
      const imageData = frameCtx.getImageData(0, 0, frame.width, frame.height);
      const markers = detector.detect(imageData);
      const { bases, paddles, paddleByBaseTag } = pairTargetsToBases(markers);

      if (bases.length === 0) {
        throw new Error(
          `Aucune base (tag 0-5) détectée (${markers.length} tag(s) au total). Vérifiez l'image exemple.`
        );
      }

      const nextTargetTagByTarget = {};
      const nextLogoByTargetTag = { ...logoByTargetTag };
      const pairs = [];
      for (const targetId of targetIds) {
        const baseTag = baseTagByTarget[targetId];
        const hit = baseTag != null ? paddleByBaseTag.get(baseTag) : undefined;
        const paddleTag = hit ? hit.paddleTag : null;
        nextTargetTagByTarget[targetId] = paddleTag;
        pairs.push({ cibleId: targetId, baseTag, paddleTag, logoKey: null });
      }

      // Tag connu -> on aligne le menu déroulant du dessus sur le logo connu.
      // Tag jamais vu -> on apprend le logo actuellement sélectionné.
      const emojiSnapshot = Object.fromEntries(
        targetIds.map((targetId) => [targetId, getEmojiForTarget(targetId)])
      );
      const { assignments, learned, toEmpty } = computeLinkUpdates(
        pairs,
        emojiSnapshot,
        nextLogoByTargetTag
      );
      Object.assign(nextLogoByTargetTag, learned);

      let updatedCount = 0;
      for (const [cibleId, logoKey] of Object.entries(assignments)) {
        if (!emojiByKey[logoKey]) continue;
        // assignEmojiToTarget échange si besoin : deux paddles intervertis
        // => deux menus déroulants intervertis, la config reste cohérente.
        assignEmojiToTarget(Number(cibleId), logoKey);
        updatedCount++;
      }
      // Base sans cible associée => cible null (menu "Vide").
      let emptiedCount = 0;
      for (const cibleId of toEmpty) {
        unassignTarget(cibleId);
        emptiedCount++;
      }
      if (updatedCount > 0 || emptiedCount > 0) {
        saveConfigToStorage();
      }

      for (const pair of pairs) {
        pair.logoKey =
          pair.paddleTag != null ? (assignments[pair.cibleId] ?? emojiSnapshot[pair.cibleId]) : null;
      }
      targetTagByTarget = nextTargetTagByTarget;
      logoByTargetTag = nextLogoByTargetTag;
      saveAprilTagConfigToStorage();
      linkPairs = pairs;

      const emptyCount = pairs.filter((pair) => pair.paddleTag == null).length;
      const learnedCount = Object.keys(learned).length;
      linkStatus =
        `${bases.length} base(s), ${paddles.length} paddle(s) détecté(s) — ` +
        `${pairs.length - emptyCount}/${pairs.length} base(s) liée(s)` +
        `${emptyCount ? ` (${emptyCount} vide(s))` : ''} · ` +
        `${updatedCount} menu(s) déroulant(s) mis à jour` +
        `${emptiedCount ? ` · ${emptiedCount} vidé(s)` : ''}` +
        `${learnedCount ? ` · ${learnedCount} nouveau(x) tag(s) appris` : ''}. ` +
        `Config AprilTag mise à jour.`;
      drawLinkPreview(img, bases, paddles, paddleByBaseTag);
      console.log(
        'Liaison AprilTag:',
        markers.map((marker) => marker.id),
        pairs
      );
    } catch (error) {
      console.error(error);
      linkStatus = `Erreur : ${error.message}`;
    } finally {
      linkBusy = false;
    }
  }

  function startGame() {
    availableKeys = getAssignedEmojiKeys();
    score = 0;
    updateScore();
    if (availableKeys.length === 0) {
      currentKey = null;
      currentTargetId = null;
      scoreText = 'Aucune cible : assignez des logos dans le debug menu';
      return;
    }
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
    if (!newValue) {
      unassignTarget(targetId);
      console.log(`Target ${targetId} emptied (pas de cible sur la base)`);
      saveConfigToStorage();
      return;
    }
    assignEmojiToTarget(targetId, newValue);
    console.log(`Target ${targetId} changed to: ${newValue}`);
    saveConfigToStorage();
  }

  function updateScore() {
    scoreText = `Score: ${score}`;
  }

  function updateTarget() {
    if (availableKeys.length === 0) return;
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
    // Aucune cible assignée (tout est null) : on ignore les hits.
    if (currentTargetId == null) return false;

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
              value={selectedEmojiByTarget[targetId] ?? ''}
              onchange={(event) => changeTarget(targetId, event)}
            >
              <option value="">— Vide (pas de cible) —</option>
              {#each emojiDrawings as key}
                <option value={key}>{formatEmojiName(key)}</option>
              {/each}
            </select>
            <span
              class="tag-info"
              title="AprilTag de base (0-5) et tag paddle (>5) lié — voir section Liaison AprilTag"
              >base {baseTagByTarget[targetId] ?? '?'} · paddle {targetTagByTarget[targetId] ??
                '—'}</span
            >
          </div>
        {/each}
      </div>
    </div>
    <div class="debug-section link-section">
      <p class="debug-label">Liaison AprilTag (image exemple)</p>
      <p class="link-hint">
        Bases : tags 0-5 · Paddles : tags &gt; 5 (la base est toujours plus bas que sa
        cible). Détecte les tags sur <code>camera_example.png</code>, apparie chaque paddle
        à la base la plus proche <strong>sous</strong> lui, puis : si la base n'a pas
        de cible, son menu passe à « Vide » (cible null) ; si le tag est connu, le menu
        de la cible est mis à jour avec le logo associé ; si c'est un nouveau tag, le
        logo actuellement sélectionné lui est associé.
      </p>
      <button class="link-btn" onclick={linkTargetsToBases} disabled={linkBusy}>
        {linkBusy ? 'Liaison en cours…' : 'Lier'}
      </button>
      {#if linkStatus}
        <p class="link-status">{linkStatus}</p>
      {/if}
      <canvas bind:this={linkCanvas} class="link-canvas" class:hidden={linkPairs.length === 0}
      ></canvas>
      {#if linkPairs.length > 0}
        <ul class="link-results">
          {#each linkPairs as pair}
            <li>
              Base tag {pair.baseTag} (Cible {pair.cibleId}{pair.logoKey
                ? ` · ${formatEmojiName(pair.logoKey)}`
                : ''}) →
              {#if pair.paddleTag != null}
                <strong>paddle tag {pair.paddleTag}</strong>
              {:else}
                <em>vide</em>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if Object.keys(logoByTargetTag).length > 0}
        <p class="debug-label">Tags paddle → logos :</p>
        <ul class="link-results">
          {#each Object.entries(logoByTargetTag) as [tag, logoKey]}
            <li>tag {tag} → {formatEmojiName(logoKey)}</li>
          {/each}
        </ul>
      {/if}
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
