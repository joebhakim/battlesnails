import * as THREE from 'three';

const DAMAGE_WINDOW_TIER_CONFIG = {
  minor: {
    className: 'damage-window--minor',
    finalHold: 0.5,
    countUpSpeed: 34,
    pulseDecay: 12,
    pulseGain: 0.16,
    pulseImpactGain: 0.08,
    maxPulse: 0.75,
    baseScale: 0.82,
    damageScale: 0.035,
    maxDamageScale: 0.13,
    activeFloat: -14,
    finalFloat: -24,
    bob: 1.4,
    finalBob: 0.6,
    fadeStart: 0.42
  },
  hit: {
    className: 'damage-window--hit',
    finalHold: 0.82,
    countUpSpeed: 26,
    pulseDecay: 9,
    pulseGain: 0.25,
    pulseImpactGain: 0.13,
    maxPulse: 1.05,
    baseScale: 0.92,
    damageScale: 0.045,
    maxDamageScale: 0.24,
    activeFloat: -22,
    finalFloat: -38,
    bob: 2.5,
    finalBob: 1.1,
    fadeStart: 0.58
  },
  burst: {
    className: 'damage-window--burst',
    finalHold: 1.12,
    countUpSpeed: 24,
    pulseDecay: 6.2,
    pulseGain: 0.48,
    pulseImpactGain: 0.24,
    maxPulse: 1.35,
    baseScale: 1,
    damageScale: 0.052,
    maxDamageScale: 0.52,
    activeFloat: -36,
    finalFloat: -72,
    bob: 4,
    finalBob: 1.5,
    fadeStart: 0.72
  }
};
const DAMAGE_GROUP_MERGE_WINDOW = 0.25;
const HIT_TOTAL_THRESHOLD = 2;
const HIT_PEAK_THRESHOLD = 1.25;
const BURST_TOTAL_THRESHOLD = 6;
const BURST_PEAK_THRESHOLD = 4.5;
const MAX_SEEN_EVENT_IDS = 240;
const DEFAULT_DAMAGE_COLOR = '#ffe28a';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return x * x * (3 - (2 * x));
}

function getEventId(event, index) {
  if (event.id) {
    return event.id;
  }

  const position = event.position ?? {};
  return [
    event.tick ?? 't',
    event.type ?? 'event',
    event.attackerSlot ?? 'a',
    event.targetSlot ?? 'b',
    event.side ?? index,
    event.amount ?? 0,
    Number.isFinite(position.x) ? position.x.toFixed(2) : 'x',
    Number.isFinite(position.y) ? position.y.toFixed(2) : 'y',
    Number.isFinite(position.z) ? position.z.toFixed(2) : 'z'
  ].join(':');
}

function createPosition(eventPosition) {
  return new THREE.Vector3(
    Number.isFinite(eventPosition?.x) ? eventPosition.x : 0,
    Number.isFinite(eventPosition?.y) ? eventPosition.y : 0,
    Number.isFinite(eventPosition?.z) ? eventPosition.z : 0
  );
}

function setColorSafely(color, value) {
  try {
    color.set(value ?? DEFAULT_DAMAGE_COLOR);
  } catch {
    color.set(DEFAULT_DAMAGE_COLOR);
  }
}

function getCssRgb(color, alpha: number | null = null) {
  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  if (alpha === null) {
    return `rgb(${red}, ${green}, ${blue})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatDamageValue(value) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safeValue >= 10) {
    return safeValue.toFixed(1);
  }

  if (safeValue >= 1) {
    return safeValue.toFixed(1);
  }

  if (safeValue >= 0.05) {
    return safeValue.toFixed(1);
  }

  return safeValue.toFixed(2);
}

function getEventDamage(event, key) {
  return Number.isFinite(event?.[key]) ? Math.max(0, event[key]) : 0;
}

function getImpactStrength(event) {
  if (Number.isFinite(event?.impactImpulse)) {
    return Math.max(0, event.impactImpulse);
  }

  if (Number.isFinite(event?.impactSpeed)) {
    return Math.max(0, event.impactSpeed);
  }

  return 0;
}

export function getDamageWindowTier({ total = 0, peakAmount = 0, allowBurst = true } = {}) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const safePeakAmount = Number.isFinite(peakAmount) ? Math.max(0, peakAmount) : 0;

  if (allowBurst && (safeTotal >= BURST_TOTAL_THRESHOLD || safePeakAmount >= BURST_PEAK_THRESHOLD)) {
    return 'burst';
  }

  if (safeTotal >= HIT_TOTAL_THRESHOLD || safePeakAmount >= HIT_PEAK_THRESHOLD) {
    return 'hit';
  }

  return 'minor';
}

function createDamagePalette(bodyColor, impactRatio) {
  const baseColor = new THREE.Color();
  const textColor = new THREE.Color();
  const borderColor = new THREE.Color();
  const glowColor = new THREE.Color();
  const hsl = { h: 0, s: 0, l: 0 };

  setColorSafely(baseColor, bodyColor);
  baseColor.getHSL(hsl);
  textColor.setHSL(
    hsl.h,
    clamp(Math.max(0.72, hsl.s) + (impactRatio * 0.12), 0, 1),
    clamp(0.7 + (impactRatio * 0.08), 0, 1)
  );
  borderColor.copy(textColor).lerp(new THREE.Color(0xffffff), 0.3);
  glowColor.copy(textColor).lerp(new THREE.Color(0xff5a3d), impactRatio * 0.28);

  return {
    text: getCssRgb(textColor),
    border: getCssRgb(borderColor, 0.46),
    glow: getCssRgb(glowColor, 0.34 + (impactRatio * 0.18)),
    shadow: getCssRgb(textColor, 0.48)
  };
}

export class DamageIndicators {
  declare activeBurstGroupsByPair: any;
  declare activeGroupsByPair: any;
  declare camera: any;
  declare container: any;
  declare layer: any;
  declare nextGroupId: any;
  declare projectedPosition: any;
  declare recentBurstByPair: any;
  declare seenEventIds: any;
  declare seenEventQueue: any;
  declare windows: any;
  constructor({ container, camera }) {
    this.container = container;
    this.camera = camera;
    this.layer = document.createElement('div');
    this.layer.className = 'damage-indicator-layer';
    this.container.appendChild(this.layer);
    this.windows = new Map<any, any>();
    this.activeGroupsByPair = new Map<any, any>();
    this.activeBurstGroupsByPair = new Map<any, any>();
    this.recentBurstByPair = new Map<any, any>();
    this.nextGroupId = 1;
    this.seenEventIds = new Set<any>();
    this.seenEventQueue = [] as any[];
    this.projectedPosition = new THREE.Vector3();
  }

  handleSnapshotEvents(events: any[] = [], slotColors = new Map<any, any>()) {
    for (const [index, event] of events.entries()) {
      if (event?.type !== 'damage') {
        continue;
      }

      const eventId = getEventId(event, index);
      if (this.seenEventIds.has(eventId)) {
        continue;
      }

      this.rememberEventId(eventId);
      this.addToWindow(event, slotColors.get(event.targetSlot));
    }
  }

  rememberEventId(eventId) {
    this.seenEventIds.add(eventId);
    this.seenEventQueue.push(eventId);

    while (this.seenEventQueue.length > MAX_SEEN_EVENT_IDS) {
      this.seenEventIds.delete(this.seenEventQueue.shift());
    }
  }

  getWindowKey(event) {
    return `${event.attackerSlot ?? 'a'}:${event.targetSlot ?? 'b'}`;
  }

  createWindow(event, bodyColor, pairKey, tier, lane, impactRatio) {
    const tierConfig = DAMAGE_WINDOW_TIER_CONFIG[tier];
    const palette = createDamagePalette(bodyColor ?? event.bodyColor, impactRatio);
    const element = document.createElement('div');
    element.className = `damage-window ${tierConfig.className}`;
    element.style.setProperty('--damage-color', palette.text);
    element.style.setProperty('--damage-border', palette.border);
    element.style.setProperty('--damage-glow', palette.glow);
    element.style.setProperty('--damage-shadow', palette.shadow);

    const totalElement = document.createElement('div');
    totalElement.className = 'damage-window-total';
    element.replaceChildren(totalElement);
    this.layer.appendChild(element);

    return {
      id: this.nextGroupId++,
      pairKey,
      lane,
      element,
      totalElement,
      tier,
      tierConfig,
      ageSinceEvent: 0,
      finalAge: 0,
      finalized: false,
      total: 0,
      displayedTotal: 0,
      peakAmount: 0,
      bashTotal: 0,
      hitCount: 0,
      maxImpactRatio: impactRatio,
      pulse: 1,
      burstAge: 0,
      worldPosition: createPosition(event.position),
      phase: Math.random() * Math.PI * 2
    };
  }

  setWindowTier(windowState, tier) {
    if (tier === windowState.tier) {
      return;
    }

    const wasBurst = windowState.tier === 'burst';
    windowState.element.classList.remove(windowState.tierConfig.className);
    windowState.tier = tier;
    windowState.tierConfig = DAMAGE_WINDOW_TIER_CONFIG[tier];
    windowState.element.classList.add(windowState.tierConfig.className);
    if (tier === 'burst' && !wasBurst) {
      windowState.burstAge = 0;
      windowState.pulse = windowState.tierConfig.maxPulse;
    }
  }

  markWindowAsBurst(windowState) {
    if (windowState.lane !== 'burst') {
      if (this.activeGroupsByPair.get(windowState.pairKey) === windowState.id) {
        this.activeGroupsByPair.delete(windowState.pairKey);
      }
      windowState.lane = 'burst';
    }

    this.activeBurstGroupsByPair.set(windowState.pairKey, windowState.id);
    this.recentBurstByPair.set(windowState.pairKey, windowState.id);
    this.setWindowTier(windowState, 'burst');
  }

  finalizeWindow(windowState) {
    if (windowState.finalized) {
      return;
    }

    windowState.finalized = true;
    windowState.finalAge = 0;
    if (this.activeGroupsByPair.get(windowState.pairKey) === windowState.id) {
      this.activeGroupsByPair.delete(windowState.pairKey);
    }
    if (this.activeBurstGroupsByPair.get(windowState.pairKey) === windowState.id) {
      this.activeBurstGroupsByPair.delete(windowState.pairKey);
    }
  }

  getMergeableWindow(pairKey, activeMap) {
    const activeId = activeMap.get(pairKey);
    const windowState = activeId ? this.windows.get(activeId) : null;
    if (!windowState || windowState.finalized) {
      activeMap.delete(pairKey);
      return null;
    }

    if (windowState.ageSinceEvent > DAMAGE_GROUP_MERGE_WINDOW) {
      this.finalizeWindow(windowState);
      return null;
    }

    return windowState;
  }

  hasVisibleBurst(pairKey) {
    const burstId = this.recentBurstByPair.get(pairKey);
    if (!burstId) {
      return false;
    }

    if (!this.windows.has(burstId)) {
      this.recentBurstByPair.delete(pairKey);
      return false;
    }

    return true;
  }

  forgetWindowMappings(windowState) {
    if (this.activeGroupsByPair.get(windowState.pairKey) === windowState.id) {
      this.activeGroupsByPair.delete(windowState.pairKey);
    }
    if (this.activeBurstGroupsByPair.get(windowState.pairKey) === windowState.id) {
      this.activeBurstGroupsByPair.delete(windowState.pairKey);
    }
    if (this.recentBurstByPair.get(windowState.pairKey) === windowState.id) {
      this.recentBurstByPair.delete(windowState.pairKey);
    }
  }

  addToWindow(event, bodyColor: any = null) {
    const amount = getEventDamage(event, 'amount');
    const bashDamage = getEventDamage(event, 'bashDamage');
    const impact = getImpactStrength(event);
    const impactRatio = clamp(impact / 24, 0, 1);
    const pairKey = this.getWindowKey(event);
    const eventTier = getDamageWindowTier({ total: amount, peakAmount: amount });
    const isBurstEvent = eventTier === 'burst';
    const activeMap = isBurstEvent ? this.activeBurstGroupsByPair : this.activeGroupsByPair;
    const lane = isBurstEvent ? 'burst' : 'flow';
    const startingTier = isBurstEvent ? 'burst' : 'minor';
    const windowState = this.getMergeableWindow(pairKey, activeMap) ??
      this.createWindow(event, bodyColor, pairKey, startingTier, lane, impactRatio);

    windowState.total += amount;
    windowState.peakAmount = Math.max(windowState.peakAmount, amount);
    windowState.bashTotal += bashDamage;
    windowState.hitCount += 1;
    windowState.ageSinceEvent = 0;
    windowState.finalAge = 0;
    windowState.finalized = false;
    windowState.maxImpactRatio = Math.max(windowState.maxImpactRatio, impactRatio);
    windowState.pulse = Math.min(
      windowState.tierConfig.maxPulse,
      windowState.pulse + windowState.tierConfig.pulseGain + impactRatio * windowState.tierConfig.pulseImpactGain
    );
    const tier = getDamageWindowTier({
      total: windowState.total,
      peakAmount: windowState.peakAmount,
      allowBurst: isBurstEvent || !this.hasVisibleBurst(pairKey)
    });

    if (tier === 'burst') {
      this.markWindowAsBurst(windowState);
    } else {
      this.setWindowTier(windowState, tier);
      this.activeGroupsByPair.set(pairKey, windowState.id);
    }

    windowState.worldPosition.lerp(createPosition(event.position), 0.42);
    this.windows.set(windowState.id, windowState);
  }

  update(delta) {
    const width = this.container.clientWidth || window.innerWidth || 1;
    const height = this.container.clientHeight || window.innerHeight || 1;

    for (const [key, windowState] of this.windows.entries()) {
      const { tierConfig } = windowState;
      windowState.ageSinceEvent += delta;
      windowState.burstAge += delta;
      if (windowState.ageSinceEvent > DAMAGE_GROUP_MERGE_WINDOW) {
        this.finalizeWindow(windowState);
      }

      if (windowState.finalized) {
        windowState.finalAge += delta;
      }

      if (windowState.finalAge >= tierConfig.finalHold) {
        this.forgetWindowMappings(windowState);
        windowState.element.remove();
        this.windows.delete(key);
        continue;
      }

      const countAlpha = Math.min(1, delta * tierConfig.countUpSpeed);
      windowState.displayedTotal += (windowState.total - windowState.displayedTotal) * countAlpha;
      if (Math.abs(windowState.total - windowState.displayedTotal) < 0.005 || windowState.finalized) {
        windowState.displayedTotal = windowState.total;
      }

      windowState.pulse = Math.max(0, windowState.pulse - delta * tierConfig.pulseDecay);
      this.projectedPosition.copy(windowState.worldPosition).project(this.camera);

      if (
        this.projectedPosition.z < -1 ||
        this.projectedPosition.z > 1 ||
        this.projectedPosition.x < -1.25 ||
        this.projectedPosition.x > 1.25 ||
        this.projectedPosition.y < -1.25 ||
        this.projectedPosition.y > 1.25
      ) {
        windowState.element.style.opacity = '0';
        continue;
      }

      const screenX = ((this.projectedPosition.x * 0.5) + 0.5) * width;
      const screenY = ((-this.projectedPosition.y * 0.5) + 0.5) * height;
      const finalProgress = windowState.finalized
        ? clamp(windowState.finalAge / tierConfig.finalHold, 0, 1)
        : 0;
      const floatY = windowState.finalized
        ? tierConfig.finalFloat * easeOutCubic(finalProgress)
        : tierConfig.activeFloat;
      const bobY = Math.sin(windowState.phase + windowState.ageSinceEvent * 16) *
        (windowState.finalized ? tierConfig.finalBob : tierConfig.bob);
      const shakeX = windowState.tier === 'burst' && !windowState.finalized
        ? Math.sin(windowState.ageSinceEvent * 62 + windowState.phase) * windowState.pulse * 4
        : 0;
      const damageScale = Math.min(tierConfig.maxDamageScale, windowState.total * tierConfig.damageScale);
      const baseScale = tierConfig.baseScale + damageScale;
      const finalBounce = windowState.finalized ? Math.sin((1 - finalProgress) * Math.PI) * 0.08 : 0;
      const burstKick = windowState.tier === 'burst' && !windowState.finalized
        ? Math.max(0, 1 - windowState.burstAge / 0.28) * 0.14
        : 0;
      const pop = 1 + windowState.pulse * 0.18 + finalBounce + burstKick;
      const opacity = windowState.finalized ? 1 - smoothstep(tierConfig.fadeStart, 1, finalProgress) : 1;

      windowState.totalElement.textContent = formatDamageValue(windowState.displayedTotal);
      windowState.element.style.opacity = opacity.toFixed(3);
      windowState.element.style.transform = [
        `translate(${(screenX + shakeX).toFixed(2)}px, ${(screenY + floatY + bobY).toFixed(2)}px)`,
        'translate(-50%, -50%)',
        `scale(${(baseScale * pop).toFixed(3)})`
      ].join(' ');
    }
  }

  clear() {
    for (const windowState of this.windows.values()) {
      windowState.element.remove();
    }

    this.windows.clear();
    this.activeGroupsByPair.clear();
    this.activeBurstGroupsByPair.clear();
    this.recentBurstByPair.clear();
    this.seenEventIds.clear();
    this.seenEventQueue = [];
  }
}
