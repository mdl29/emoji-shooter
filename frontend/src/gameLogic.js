// Logique pure du jeu de tir sur cibles AprilTag.
// Implémente fidèlement le diagramme d'états :
// Placement / Verif / Calib / Jeu (Tirage/Surveillance/Confirmation/Verdict/
// BonneCible/MauvaiseCible) / Fin.
// Ce module est sans DOM : testable avec node.

export const CONFIRM_FRAMES = 5;
export const BASE_TAGS = [0, 1, 2, 3, 4, 5];

export function markerCenter(corners) {
  let x = 0;
  let y = 0;
  for (const c of corners) {
    x += c.x;
    y += c.y;
  }
  return { x: x / corners.length, y: y / corners.length };
}

export function meanEdgeLength(corners) {
  let sum = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    sum += Math.hypot(a.x - b.x, a.y - b.y);
  }
  return sum / corners.length;
}

/** Ray-casting : centre strictement dans le polygone de référence ? */
export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Apparie chaque paddle (tag > 5) à sa base la plus proche.
 * Contrainte physique : la base est TOUJOURS plus bas que la cible
 * dans l'image (base.y > paddle.y).
 * Contrainte "proche" (diagramme Verif) : dist <= proxFactor * tailleBase.
 * En cas de conflit (2 paddles -> même base), le plus proche gagne.
 */
export function pairTargetsToBases(markers, opts = {}) {
  const proxFactor = opts.proxFactor ?? 6;
  const located = markers.map((m, index) => ({
    id: m.id,
    corners: m.corners,
    index,
    ...markerCenter(m.corners),
    size: meanEdgeLength(m.corners)
  }));
  const bases = located.filter((m) => m.id >= 0 && m.id <= 5);
  const paddles = located.filter((m) => m.id > 5);

  const paddleByBaseTag = new Map();
  for (const paddle of paddles) {
    let nearest = null;
    let nearestDist = Infinity;
    let nearestBaseSize = 0;
    for (const base of bases) {
      if (base.y <= paddle.y) continue; // base toujours plus bas
      const dist = Math.hypot(paddle.x - base.x, paddle.y - base.y);
      const maxDist = proxFactor * (base.size || 1);
      if (dist > maxDist) continue; // trop loin : pas "proche"
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = base;
        nearestBaseSize = base.size;
      }
    }
    if (!nearest) continue;
    const current = paddleByBaseTag.get(nearest.id);
    if (!current || nearestDist < current.dist) {
      // Index du paddle (pas seulement son tag) : le même tag peut
      // apparaître plusieurs fois (deux cibles de même apparence).
      paddleByBaseTag.set(nearest.id, {
        paddleTag: paddle.id,
        paddleIndex: paddles.indexOf(paddle),
        dist: nearestDist,
        baseSize: nearestBaseSize
      });
    }
  }
  return { bases, paddles, paddleByBaseTag };
}

/**
 * Vérification du placement (état Verif du diagramme) :
 * "6 tags détectés proches des 6 bases ?"
 */
export function checkPlacement(markers, opts = {}) {
  const { bases, paddles, paddleByBaseTag } = pairTargetsToBases(markers, opts);
  const baseIds = new Set(bases.map((b) => b.id));
  const missingBases = BASE_TAGS.filter((t) => !baseIds.has(t));
  const pairs = BASE_TAGS.map((baseTag) => {
    const hit = paddleByBaseTag.get(baseTag);
    return {
      baseTag,
      basePresent: baseIds.has(baseTag),
      paddleTag: hit ? hit.paddleTag : null,
      paddleIndex: hit ? hit.paddleIndex : null,
      dist: hit ? hit.dist : null,
      proche: Boolean(hit)
    };
  });
  const linkedCount = pairs.filter((p) => p.proche).length;
  const ok = missingBases.length === 0 && linkedCount === 6;
  return { ok, bases, paddles, paddleByBaseTag, pairs, missingBases, linkedCount };
}

/** Apparence d'une cible : logo connu (emojis.json) ou repli "tag:<id>". */
export function appearanceForTag(paddleTag, logoByTag = {}) {
  if (logoByTag[paddleTag] != null) return logoByTag[paddleTag];
  return `tag:${paddleTag}`;
}

/**
 * Calibration (état Calib) : surface de référence (forme du tag) + centre
 * par cible, score remis à 0 par l'appelant.
 */
export function buildTargetsFromPlacement(checkResult, logoByTag = {}) {
  const targets = [];
  for (const pair of checkResult.pairs) {
    if (!pair.proche) continue;
    const paddle = checkResult.paddles[pair.paddleIndex];
    const fallback = checkResult.paddles.find((p) => p.id === pair.paddleTag);
    const det = paddle ?? fallback;
    if (!det) continue;
    targets.push({
      baseTag: pair.baseTag,
      paddleTag: pair.paddleTag,
      appearance: appearanceForTag(pair.paddleTag, logoByTag),
      refPoly: det.corners.map((c) => ({ x: c.x, y: c.y })),
      refCenter: markerCenter(det.corners),
      alive: true
    });
  }
  return targets;
}

/**
 * Surveillance (état Jeu/Surveillance) : à chaque frame, pour chaque cible
 * restante : centre dans sa surface ? tag visible ?
 */
export function detectAnomalies(aliveTargets, markers) {
  const byBase = {};
  const anomalousBases = [];
  for (const target of aliveTargets) {
    const dets = markers.filter((m) => m.id === target.paddleTag);
    if (dets.length === 0) {
      byBase[target.baseTag] = { ok: false, reason: 'disparu', center: null };
      anomalousBases.push(target.baseTag);
      continue;
    }
    let inside = false;
    let best = null;
    for (const det of dets) {
      const c = markerCenter(det.corners);
      if (!best) best = c;
      if (pointInPolygon(c, target.refPoly)) {
        inside = true;
        best = c;
        break;
      }
    }
    if (inside) {
      byBase[target.baseTag] = { ok: true, reason: 'ok', center: best };
    } else {
      byBase[target.baseTag] = { ok: false, reason: 'hors-surface', center: best };
      anomalousBases.push(target.baseTag);
    }
  }
  return { byBase, anomalousBases, anyAnomaly: anomalousBases.length > 0 };
}

/** Confirmation : compteur de frames consécutives par cible. */
export function updateCounters(prevCounts, anomaliesByBase, aliveBases) {
  const next = { ...(prevCounts ?? {}) };
  for (const baseTag of aliveBases) {
    const anomaly = anomaliesByBase[baseTag];
    if (anomaly && !anomaly.ok) {
      next[baseTag] = (next[baseTag] ?? 0) + 1;
    } else {
      next[baseTag] = 0;
    }
  }
  // Nettoie les bases qui ne sont plus en jeu.
  for (const key of Object.keys(next)) {
    if (!aliveBases.includes(Number(key))) delete next[key];
  }
  return next;
}

/** Verdict : lot = cibles dont l'anomalie est maintenue >= seuil (5). */
export function verdictLot(counts, threshold = CONFIRM_FRAMES) {
  return Object.entries(counts ?? {})
    .filter(([, n]) => n >= threshold)
    .map(([baseTag]) => Number(baseTag));
}

/**
 * BonneCible / MauvaiseCible :
 * - lot contenant l'apparence demandée : +5 par cible demandée, -2 par autre.
 * - lot sans l'apparence demandée : -2 par cible du lot.
 * Les cibles du lot disparaissent (appelant : alive = false).
 * Le score peut devenir négatif.
 */
export function applyVerdict(lotBases, targetsByBase, requestedAppearance) {
  const perBase = [];
  let delta = 0;
  let good = false;
  for (const baseTag of lotBases) {
    const target = targetsByBase[baseTag];
    if (!target) continue;
    const isRequested = target.appearance === requestedAppearance;
    if (isRequested) good = true;
    const points = isRequested ? 5 : -2;
    delta += points;
    perBase.push({ baseTag, appearance: target.appearance, points });
  }
  return { delta, good, perBase };
}

export function remainingTargets(targets) {
  return targets.filter((t) => t.alive);
}

export function distinctAppearances(aliveTargets) {
  return [...new Set(aliveTargets.map((t) => t.appearance))];
}

/** Tirage : choix aléatoire d'une apparence parmi celles des cibles restantes. */
export function pickRandomAppearance(aliveTargets, rand = Math.random) {
  const distinct = distinctAppearances(aliveTargets);
  if (distinct.length === 0) return null;
  return distinct[Math.floor(rand() * distinct.length)];
}
