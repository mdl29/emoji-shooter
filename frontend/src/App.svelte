<script>
  import { onMount } from 'svelte';
  import emojiData from '../asset/emojis.json';
  import {
    CONFIRM_FRAMES,
    BASE_TAGS,
    markerCenter,
    checkPlacement,
    buildTargetsFromPlacement,
    detectAnomalies,
    updateCounters,
    verdictLot,
    applyVerdict,
    remainingTargets,
    distinctAppearances,
    pickRandomAppearance
  } from './gameLogic.js';

  // ---------- Apparences (tags > 5 -> image) ----------
  const keyFromPath = (path) => path.split('/').pop().replace(/\.[^.]+$/, '');
  const emojiList = emojiData.emojis.map((emoji) => ({
    ...emoji,
    key: keyFromPath(emoji.path)
  }));
  const emojiByKey = Object.fromEntries(emojiList.map((e) => [e.key, e]));
  // Vérité terrain : tag AprilTag -> apparence (le JSON). Plusieurs cibles
  // peuvent partager la même apparence = même tag posé sur 2 bases.
  const logoByTag = Object.fromEntries(
    emojiList.filter((e) => Number.isInteger(e.tag) && e.tag > 5).map((e) => [e.tag, e.key])
  );
  const appearanceSrc = (appearance) => emojiByKey[appearance]?.path ?? null;
  const appearanceName = (appearance) => emojiByKey[appearance]?.nom ?? `tag ${String(appearance).replace('tag:', '')}`;

  // ---------- Machine à états (diagramme) ----------
  // [*] -> Verif -> Placement <-> Verif -> Calib -> Jeu -> Fin -> Placement
  // Jeu : Tirage -> Surveillance <-> Confirmation -> Verdict (choice)
  //       -> BonneCible (+5/-2, re-tirage) / MauvaiseCible (-2, on garde la demande)
  let phase = 'Verif'; // 'Placement' | 'Verif' | 'Calib' | 'Jeu' | 'Fin'
  let jeuSub = '-'; // 'Tirage' | 'Surveillance' | 'Confirmation' | '-'
  let score = 0;
  let finalScore = 0;
  let targets = []; // [{ baseTag, paddleTag, appearance, refPoly, refCenter, alive }]
  let requested = null; // apparence demandée (tirage parmi restantes)
  let counters = {}; // baseTag -> frames consécutives d'anomalie
  let anomalies = {}; // baseTag -> { ok, reason, center }
  let lastCheck = null; // dernier checkPlacement (paires, manquants…)
  let stableCount = 0;
  let lastVerdict = null; // { lot, perBase, good, requested, delta }
  let verdictLog = [];
  let detectedIds = [];

  // Réglages (Confirmation = 5 frames imposé par le diagramme)
  // NOTE démo : baisser les FPS caméra laisse l'auto-exposition travailler
  // (moins de flou, meilleure détection en faible lumière). Défaut 8 comme la démo.
  let targetFps = 8;
  let proxFactor = 6;
  let stableFrames = 8;
  const CONFIRM = CONFIRM_FRAMES;

  // Panneau latéral rétractable
  let sidebarOpen = true;
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
  }

  // Plein écran dans la page du panneau gauche (prend toute la largeur, pas de Fullscreen API)
  let sidebarExpanded = false;
  function toggleSidebarExpanded() {
    sidebarExpanded = !sidebarExpanded;
    if (sidebarExpanded) sidebarOpen = true;
  }

  // Debug / simulation (touche ² comme avant)
  let debugHidden = true;
  let appearanceOverride = {}; // baseTag -> appearance forcée (test sans tags connus)
  let simulatedDown = new Set();
  let statusLine = 'Initialisation…';

  // ---------- Caméra + détection : pipeline repris tel quel de tools/apriltag-demo ----------
  // - vidéo cachée + canvas visible à pleine résolution (pas de downscale 640 :
  //   c'est ce qui tuait les petits tags des bases)
  // - AR.Detector détecte à chaque requestAnimationFrame sur l'image pleine taille
  // - le slider FPS ne bride PAS la détection : il règle la caméra via
  //   applyConstraints (comme la démo), pour laisser l'exposition respirer
  let videoEl;
  let canvasEl;
  let ctx = null;
  let fireworksCanvas;
  let detector = null;
  let libError = '';
  let cameraError = '';
  let detectStatus = '';
  let cameraReady = false;
  let stream = null;
  let rafId = 0;

  onMount(() => {
    ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    if (!apriltagLibReady()) {
      libError =
        "Lib AprilTag introuvable (CDN js-aruco2). Vérifiez la connexion internet — même scripts que tools/apriltag-demo.";
    } else {
      // Comme la démo : détecteur créé une fois, dictionnaire APRILTAG_16h5.
      detector = new window.AR.Detector({ dictionaryName: 'APRILTAG_16h5' });
    }
    startCamera();

    const onKey = (event) => {
      if (
        event.key === '²' || event.key === 'ù' || event.key === '√' ||
        event.code === 'BracketRight' || event.code === 'Backquote'
      ) {
        event.preventDefault();
        debugHidden = !debugHidden;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(rafId);
      stopCamera();
      stopFireworks();
    };
  });

  function apriltagLibReady() {
    const AR = window.AR;
    return Boolean(
      window.CV && AR && typeof AR.Detector === 'function' &&
      AR.DICTIONARIES && AR.DICTIONARIES['APRILTAG_16h5']
    );
  }

  function fpsConstraints() {
    return { ideal: targetFps, max: targetFps };
  }

  async function applyFps() {
    const track = stream && stream.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ frameRate: fpsConstraints() });
    } catch (err) {
      detectStatus = 'Réglage FPS ignoré : ' + err.message;
    }
  }

  function onFpsInput() {
    applyFps();
  }

  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError = 'Caméra inaccessible (nécessite https:// ou localhost).';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', frameRate: fpsConstraints() },
        audio: false
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      videoEl.addEventListener('loadedmetadata', onVideoReady, { once: true });
      if (videoEl.videoWidth) onVideoReady();
      cameraError = '';
      applyFps();
    } catch (err) {
      cameraError = `Caméra : ${err.message}`;
      stopCamera();
    }
  }

  function stopCamera() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    cameraReady = false;
  }

  function onVideoReady() {
    if (!videoEl.videoWidth) return;
    // Pleine résolution comme la démo (pas de 640px).
    canvasEl.width = videoEl.videoWidth;
    canvasEl.height = videoEl.videoHeight;
    cameraReady = true;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(processFrame);
  }

  function drawMarker(marker) {
    const { corners, id } = marker;
    ctx.strokeStyle = id >= 0 && id <= 5 ? '#00ff6a' : '#ffcc00';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = ctx.strokeStyle;
    for (const c of corners) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const center = markerCenter(corners);
    const label = 'id ' + id;
    ctx.font = 'bold 16px system-ui, sans-serif';
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(center.x - textWidth / 2 - 4, center.y - 10, textWidth + 8, 20);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, center.x, center.y);
  }

  function processFrame() {
    rafId = requestAnimationFrame(processFrame);
    if (!cameraReady || !videoEl.videoWidth || !detector) return;
    if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
    }
    // Comme la démo : drawImage pleine taille puis detect sur le même buffer.
    // AR.Detector convertit en gris en interne (CV.grayscale), pas de pré-passe.
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
    let markers = [];
    try {
      const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
      markers = detector.detect(imageData) ?? [];
    } catch (err) {
      console.warn('detect:', err);
      return;
    }
    for (const marker of markers) drawMarker(marker);
    drawGameOverlays();

    detectedIds = markers.map((m) => m.id);
    detectStatus = markers.length ? '' : 'Aucun tag détecté.';

    if (phase === 'Placement' || phase === 'Verif') handlePlacementFrame(markers);
    else if (phase === 'Jeu') handleJeuFrame(markers);
  }

  // ---------- Placement / Verif ----------
  function handlePlacementFrame(markers) {
    const res = checkPlacement(markers, { proxFactor });
    lastCheck = res;
    if (res.ok) stableCount += 1;
    else stableCount = 0;

    // Placement --> Verif : cibles détectées / Verif --> Placement : rien à voir
    if (phase === 'Placement') {
      if (res.bases.length > 0 || res.paddles.length > 0) phase = 'Verif';
      statusLine = '« Placez les cibles dans les bases »';
    } else {
      if (res.bases.length === 0 && res.paddles.length === 0) {
        phase = 'Placement';
        statusLine = '« Placez les cibles dans les bases »';
      } else if (!res.ok) {
        statusLine = `Vérification : ${res.linkedCount}/6 cibles proches des bases…`;
      } else {
        statusLine = `Vérification OK ${res.linkedCount}/6 — stabilisation ${Math.min(stableCount, stableFrames)}/${stableFrames}…`;
      }
    }

    // Verif --> Calib : 6 cibles OK (stabilisées)
    if (res.ok && stableCount >= stableFrames) doCalib(res);
  }

  // ---------- Calib ----------
  function doCalib(res) {
    phase = 'Calib';
    jeuSub = '-';
    targets = buildTargetsFromPlacement(res, logoByTag);
    for (const t of targets) {
      if (appearanceOverride[t.baseTag]) t.appearance = appearanceOverride[t.baseTag];
    }
    score = 0; // Score remis à 0 à chaque nouvelle manche
    counters = {};
    anomalies = {};
    requested = null;
    lastVerdict = null;
    stableCount = 0;
    statusLine = `Calibration : ${targets.length} surfaces de référence + centres enregistrés, score remis à 0…`;
    setTimeout(() => {
      if (phase !== 'Calib') return;
      phase = 'Jeu';
      doTirage();
    }, 900);
  }

  // ---------- Jeu ----------
  function doTirage() {
    const alive = remainingTargets(targets);
    if (alive.length === 0) {
      doFin();
      return;
    }
    // Tirage : apparence au hasard parmi celles des cibles restantes.
    requested = pickRandomAppearance(alive);
    counters = Object.fromEntries(alive.map((t) => [t.baseTag, 0]));
    jeuSub = 'Surveillance';
    statusLine = `Tirage : visez « ${appearanceName(requested)} » !`;
  }

  function handleJeuFrame(markers) {
    const alive = remainingTargets(targets);
    if (alive.length === 0) {
      doFin();
      return;
    }
    const { byBase, anomalousBases } = detectAnomalies(alive, markers);
    // Simulation debug : chute forcée (test du scoring sans tirer).
    for (const b of simulatedDown) {
      if (alive.some((t) => t.baseTag === b)) {
        byBase[b] = { ok: false, reason: 'simulée', center: null };
        if (!anomalousBases.includes(b)) anomalousBases.push(b);
      }
    }
    anomalies = byBase;
    const aliveBases = alive.map((t) => t.baseTag);
    counters = updateCounters(counters, byBase, aliveBases);
    const anyAnomaly = anomalousBases.length > 0;

    if (!anyAnomaly) {
      // Confirmation --> Surveillance : anomalie disparue avant 5 frames
      if (jeuSub === 'Confirmation') {
        jeuSub = 'Surveillance';
        statusLine = `Surveillance : visez « ${appearanceName(requested)} » — fausse alerte, on continue.`;
      }
      return;
    }
    // Surveillance --> Confirmation : anomalie détectée
    if (jeuSub === 'Surveillance') {
      jeuSub = 'Confirmation';
      statusLine = `Confirmation : anomalie sur ${anomalousBases.length} cible(s) — validation à ${CONFIRM} frames…`;
    }
    // Confirmation --> Verdict : anomalie maintenue ≥ 5 frames
    const lot = verdictLot(counters, CONFIRM);
    if (lot.length > 0) doVerdict(lot);
  }

  function doVerdict(lot) {
    const byBaseMap = Object.fromEntries(targets.map((t) => [t.baseTag, t]));
    const { delta, good, perBase } = applyVerdict(lot, byBaseMap, requested);
    score += delta; // peut devenir négatif
    for (const b of lot) {
      if (byBaseMap[b]) byBaseMap[b].alive = false;
      delete counters[b];
      simulatedDown.delete(b);
    }
    targets = [...targets];
    lastVerdict = { lot: [...lot], perBase, good, requested, delta };
    verdictLog = [lastVerdict, ...verdictLog].slice(0, 6);

    const alive = remainingTargets(targets);
    if (alive.length === 0) {
      // Jeu --> Fin : toutes les cibles ont disparu
      doFin();
      return;
    }
    if (good) {
      // BonneCible : lot contenant l'apparence demandée -> re-tirage.
      statusLine = `Bonne cible : ${delta >= 0 ? '+' : ''}${delta} pts — nouveau tirage…`;
      doTirage();
    } else {
      // MauvaiseCible : lot sans l'apparence demandée -> on attend toujours la demandée.
      statusLine = `Mauvaise cible : ${delta} pts — on attend toujours « ${appearanceName(requested)} ».`;
      jeuSub = 'Surveillance';
    }
  }

  // ---------- Fin ----------
  function doFin() {
    phase = 'Fin';
    jeuSub = '-';
    finalScore = score;
    statusLine = `Fin de manche : feu d'artifice — score final ${finalScore}.`;
    startFireworks();
  }

  function backToPlacement() {
    stopFireworks();
    targets = [];
    requested = null;
    counters = {};
    anomalies = {};
    lastVerdict = null;
    stableCount = 0;
    simulatedDown = new Set(simulatedDown);
    simulatedDown.clear();
    phase = 'Placement';
    jeuSub = '-';
    statusLine = '« Repositionnez les cibles »';
  }

  // ---------- Surcouches jeu (sur le même canvas pleine résolution) ----------
  function drawGameOverlays() {
    if (!ctx) return;
    // Surfaces de référence (cyan) + état par cible restante.
    if (phase === 'Jeu' || phase === 'Fin') {
      for (const t of targets) {
        if (!t.alive) continue;
        ctx.strokeStyle = 'rgba(0,220,255,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(t.refPoly[0].x, t.refPoly[0].y);
        for (let i = 1; i < t.refPoly.length; i++) ctx.lineTo(t.refPoly[i].x, t.refPoly[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0,220,255,0.9)';
        ctx.beginPath();
        ctx.arc(t.refCenter.x, t.refCenter.y, 4, 0, Math.PI * 2);
        ctx.fill();

        const st = anomalies[t.baseTag];
        const n = counters[t.baseTag] ?? 0;
        if (st && !st.ok) {
          ctx.strokeStyle = '#ff3b30';
          ctx.lineWidth = 3;
          ctx.strokeRect(t.refPoly[0].x - 6, t.refPoly[0].y - 6, 12, 12);
          ctx.fillStyle = '#ff3b30';
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${n}/${CONFIRM}`, t.refCenter.x + 10, t.refCenter.y + 4);
        }
      }
    }

    // Liaisons base <-> paddle pendant le placement.
    if ((phase === 'Placement' || phase === 'Verif' || phase === 'Calib') && lastCheck) {
      ctx.strokeStyle = 'rgba(0,255,106,0.7)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      for (const p of lastCheck.pairs) {
        if (!p.proche) continue;
        const paddle = lastCheck.paddles[p.paddleIndex];
        const base = lastCheck.bases.find((b) => b.id === p.baseTag);
        if (!base || !paddle) continue;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(paddle.x, paddle.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  // ---------- Feu d'artifice (Fin de manche) ----------
  let fwRunning = false;
  let fwRaf = 0;
  let fwParticles = [];
  function startFireworks() {
    if (fwRunning) return;
    fwRunning = true;
    fwParticles = [];
    const tick = () => {
      if (!fwRunning) return;
      if (!fireworksCanvas) {
        fwRaf = requestAnimationFrame(tick);
        return;
      }
      const fctx = fireworksCanvas.getContext('2d');
      const W = (fireworksCanvas.width = fireworksCanvas.clientWidth || window.innerWidth);
      const H = (fireworksCanvas.height = fireworksCanvas.clientHeight || 400);
      fctx.fillStyle = 'rgba(10,10,25,0.25)';
      fctx.fillRect(0, 0, W, H);
      if (fwParticles.length < 220 && Math.random() < 0.25) {
        const x = Math.random() * W;
        const y = H * (0.15 + Math.random() * 0.4);
        const hue = Math.floor(Math.random() * 360);
        for (let i = 0; i < 26; i++) {
          const a = (Math.PI * 2 * i) / 26 + Math.random() * 0.3;
          const sp = 1 + Math.random() * 3;
          fwParticles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 40 + Math.random() * 30, hue });
        }
      }
      fwParticles = fwParticles.filter((p) => p.life > 0);
      for (const p of fwParticles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 1;
        fctx.fillStyle = `hsl(${p.hue} 100% 60% / ${Math.max(0, p.life / 60)})`;
        fctx.beginPath();
        fctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        fctx.fill();
      }
      fwRaf = requestAnimationFrame(tick);
    };
    fwRaf = requestAnimationFrame(tick);
  }
  function stopFireworks() {
    fwRunning = false;
    cancelAnimationFrame(fwRaf);
  }

  // ---------- Debug helpers ----------
  function forceCalib() {
    if (lastCheck?.ok) doCalib(lastCheck);
  }
  function toggleSimulated(baseTag) {
    const next = new Set(simulatedDown);
    if (next.has(baseTag)) next.delete(baseTag);
    else next.add(baseTag);
    simulatedDown = next;
  }

  $: aliveTargets = targets.filter((t) => t.alive);
  $: deadCount = targets.length - aliveTargets.length;
  $: remainingLooks = [...new Set(aliveTargets.map((t) => t.appearance))];
  $: phaseLabel =
    phase === 'Jeu' ? `Jeu · ${jeuSub}` : phase;
</script>

<div class="app" class:sidebar-expanded={sidebarExpanded}>
  <!-- Panneau gauche rétractable : caméra + placement -->
  <aside class="sidebar" class:collapsed={!sidebarOpen} class:expanded={sidebarExpanded} aria-hidden={!sidebarOpen}>
    <div class="sidebar-inner">
      <div class="brand">
        <div>
          <h1>Emoji Shooter</h1>
          <p class="brand-sub">AprilTag · <strong>{phaseLabel}</strong></p>
        </div>
        <div class="brand-actions">
          <button class="btn ghost" onclick={toggleSidebarExpanded} title={sidebarExpanded ? 'Réduire le panneau' : 'Agrandir le panneau'}>⤢</button>
          <button class="btn ghost" onclick={toggleSidebar} title="Masquer le panneau">⟨</button>
        </div>
      </div>

      <section class="camera-card">
        <div class="video-wrap">
          <!-- svelte-ignore a11y-media-has-caption -->
          <video bind:this={videoEl} autoplay playsinline muted style="display:none"></video>
          <canvas bind:this={canvasEl}></canvas>
        </div>
        <div class="camera-foot">
          {#if cameraError}
            <p class="warn">{cameraError}</p>
            <button class="btn" onclick={startCamera}>Réessayer caméra</button>
          {:else if !cameraReady}
            <p class="muted">Connexion caméra…</p>
          {:else}
            <p class="muted">
              {detectedIds.length} tag(s) : {detectedIds.join(', ') || '—'}
              {#if detectStatus} · {detectStatus}{/if}
            </p>
          {/if}
          {#if libError}
            <p class="warn">{libError}</p>
          {/if}
          <div class="controls">
            <label for="fps">FPS caméra</label>
            <input id="fps" type="range" min="1" max="30" step="1" bind:value={targetFps} oninput={onFpsInput} />
            <span id="fpsValue">{targetFps}</span>
          </div>
        </div>

        {#if phase === 'Placement'}
          <div class="banner warn-banner">« Placez les cibles dans les bases »</div>
        {:else if phase === 'Verif'}
          <div class="banner info-banner">
            Vérification — <strong>{lastCheck ? `${lastCheck.linkedCount}/6` : '…'}</strong>
            {#if lastCheck && lastCheck.missingBases.length > 0}
              <span> · bases manquantes : {lastCheck.missingBases.join(', ')}</span>
            {/if}
          </div>
        {:else if phase === 'Calib'}
          <div class="banner info-banner">Calibration — surfaces + centres · score remis à 0</div>
        {/if}
      </section>

      <div class="side-section">
        <p class="label">Apparences connues (tag → image)</p>
        <div class="chips">
          {#each Object.entries(logoByTag) as [tag, key]}
            <div class="chip small">
              {#if appearanceSrc(key)}
                <img src={appearanceSrc(key)} alt={appearanceName(key)} />
              {/if}
              <span class="chip-meta">tag {tag} · {appearanceName(key)}</span>
            </div>
          {/each}
        </div>
        {#if targets.length > 0}
          <p class="label">Manche : {aliveTargets.length} restante(s) · {deadCount} touchée(s)</p>
          <p class="muted small">{statusLine}</p>
        {/if}
      </div>
    </div>
  </aside>

  <!-- Poignée pour rouvrir quand le panneau est caché -->
  {#if !sidebarOpen}
    <button class="edge-toggle" onclick={toggleSidebar} title="Afficher le panneau">⟩</button>
  {/if}

  <!-- Scène principale : emoji + score au centre -->
  <main class="stage">
    <div class="stage-top">
      <button class="btn ghost show-side" onclick={toggleSidebar} title={sidebarOpen ? 'Masquer le panneau' : 'Afficher le panneau'}>
        {sidebarOpen ? '⟨' : '⟩'}
      </button>
      <div class="phase-pill">{phaseLabel}</div>
    </div>

    <div class="score-hero" class:neg={score < 0}>
      <span class="score-label">SCORE</span>
      <span class="score-value">{score}</span>
    </div>

    <div class="hero">
      {#if phase === 'Jeu' && requested}
        <div class="emoji-hero">
          {#if appearanceSrc(requested)}
            <img src={appearanceSrc(requested)} alt={appearanceName(requested)} />
          {:else}
            <div class="wanted-fallback big">{appearanceName(requested)}</div>
          {/if}
        </div>
        <div class="wanted-name big">{appearanceName(requested)}</div>
        <p class="hero-hint">Visez cette cible !</p>
      {:else if phase === 'Fin'}
        <div class="emoji-hero">
          <img src="asset/fest.svg" alt="Feu d'artifice" />
        </div>
        <div class="wanted-name big">Score final : {finalScore}</div>
        <p class="hero-hint">« Repositionnez les cibles » pour rejouer.</p>
        <button class="btn primary big" onclick={backToPlacement}>Nouvelle manche</button>
        <canvas bind:this={fireworksCanvas} class="fireworks"></canvas>
      {:else if phase === 'Calib'}
        <div class="emoji-hero placeholder"><span>⚙️</span></div>
        <div class="wanted-name big">Calibration…</div>
        <p class="hero-hint">Enregistrement des surfaces…</p>
      {:else}
        <div class="emoji-hero placeholder"><span>🎯</span></div>
        <div class="wanted-name big">{lastCheck ? `${lastCheck.linkedCount}/6 cibles` : 'En attente'}</div>
        <p class="hero-hint">Posez 6 cibles (tags &gt; 5) près des bases (0 à 5)</p>
      {/if}
    </div>

    <p class="status-line"><strong>{phaseLabel}</strong> — {statusLine}</p>

    {#if phase === 'Jeu'}
      {#if jeuSub === 'Confirmation'}
        <div class="banner danger-banner center">Confirmation : verdict à {CONFIRM} frames…</div>
      {/if}
      {#if lastVerdict}
        <div class="banner {lastVerdict.good ? 'good-banner' : 'danger-banner'} center">
          {lastVerdict.good ? 'Bonne cible' : 'Mauvaise cible'} :
          {lastVerdict.perBase.map((p) => `base ${p.baseTag} (${appearanceName(p.appearance)} : ${p.points >= 0 ? '+' : ''}${p.points})`).join(' · ')}
        </div>
      {/if}
      <div class="chips center">
        {#each aliveTargets as t (t.baseTag)}
          {@const n = counters[t.baseTag] ?? 0}
          {@const st = anomalies[t.baseTag]}
          <div class="chip" class:anom={st && !st.ok}>
            {#if appearanceSrc(t.appearance)}
              <img src={appearanceSrc(t.appearance)} alt={appearanceName(t.appearance)} />
            {:else}
              <span class="chip-tag">{appearanceName(t.appearance)}</span>
            {/if}
            <span class="chip-meta">base {t.baseTag}</span>
            {#if st && !st.ok}
              <span class="chip-count">{st.reason} {n}/{CONFIRM}</span>
            {:else}
              <span class="chip-count ok">OK</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </main>

  {#if !debugHidden}
    <aside class="debug-menu">
      <div class="debug-header"><h3>Debug — {phase} / {jeuSub}</h3></div>
      <div class="debug-content">
        <label class="debug-label">Caméra FPS <input type="range" min="1" max="30" step="1" bind:value={targetFps} oninput={onFpsInput} /> {targetFps}</label>
        <label class="debug-label">Proximité base↔cible <input type="range" min="2" max="12" step="0.5" bind:value={proxFactor} /> ×{proxFactor}</label>
        <label class="debug-label">Stabilité Verif→Calib <input type="range" min="1" max="30" step="1" bind:value={stableFrames} /> {stableFrames} frames ({stableCount})</label>
        <p class="debug-label">Confirmation : {CONFIRM} frames (diagramme).</p>
        <div class="debug-row">
          <button class="btn" onclick={forceCalib} disabled={!lastCheck?.ok}>Forcer calibration</button>
          <button class="btn" onclick={backToPlacement}>Retour placement</button>
        </div>
        {#if lastCheck}
          <p class="debug-label">Paires base → paddle</p>
          <ul class="link-results">
            {#each lastCheck.pairs as p}
              <li>base {p.baseTag} → {p.paddleTag != null ? `tag ${p.paddleTag}` : 'vide'}{p.proche ? '' : ' (loin/vide)'}</li>
            {/each}
          </ul>
        {/if}
        {#if targets.length > 0}
          <p class="debug-label">Cibles (base → apparence)</p>
          <ul class="link-results">
            {#each targets as t}
              <li>
                base {t.baseTag} · tag {t.paddleTag} · {appearanceName(t.appearance)} · {t.alive ? 'en jeu' : 'disparue'}
                {#if t.alive}
                  <button class="btn mini" onclick={() => toggleSimulated(t.baseTag)}>
                    {simulatedDown.has(t.baseTag) ? 'stop simu' : 'simuler chute'}
                  </button>
                  <select value={appearanceOverride[t.baseTag] ?? ''} onchange={(e) => { appearanceOverride = { ...appearanceOverride, [t.baseTag]: e.currentTarget.value || undefined }; }}>
                    <option value="">auto</option>
                    {#each emojiList as e}
                      <option value={e.key}>{e.nom}</option>
                    {/each}
                  </select>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if verdictLog.length > 0}
          <p class="debug-label">Derniers verdicts</p>
          <ul class="link-results">
            {#each verdictLog as v}
              <li>{v.good ? 'Bonne' : 'Mauvaise'} · {v.requested} · {v.delta} · lot {v.lot.join(',')}</li>
            {/each}
          </ul>
        {/if}
      </div>
    </aside>
  {/if}
</div>
