import { formatTuningValue, isTuningEntryVisible } from '../sim/Tuning.js';

const INDICATOR_TARGET_COLOR = '#e8b830';
const INDICATOR_CURRENT_COLOR = '#8fd3ff';
const INDICATOR_GRID_COLOR = 'rgba(210, 225, 255, 0.22)';
const INDICATOR_RIM_COLOR = 'rgba(232, 184, 48, 0.38)';
const INDICATOR_PLANE_SCALE = 1.35;
const INDICATOR_IMPACT_REFERENCE = 14;

function ensureIndicatorResolution(canvas) {
  const width = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio));
  const height = Math.max(1, Math.round(canvas.clientHeight * window.devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function projectTopDownPoint(point, radius, centerX, centerY) {
  const viewScale = INDICATOR_PLANE_SCALE;
  return {
    x: centerX + (point.x / viewScale) * radius,
    y: centerY - (point.z / viewScale) * radius
  };
}

function getScaledPoint(vector = { x: 0, y: 0, z: 1 }, reach = 1) {
  const safeReach = Number.isFinite(reach) ? reach : 1;
  return {
    x: (Number.isFinite(vector.x) ? vector.x : 0) * safeReach,
    y: (Number.isFinite(vector.y) ? vector.y : 0) * safeReach,
    z: (Number.isFinite(vector.z) ? vector.z : 1) * safeReach
  };
}

function drawTopDownPlane(ctx, width, height) {
  const centerX = width / 2;
  const centerY = height * 0.6;
  const radius = Math.min(width, height) * 0.34;

  ctx.strokeStyle = INDICATOR_GRID_COLOR;
  ctx.lineWidth = Math.max(1, width * 0.008);

  for (const ringScale of [0.33, 0.66, 1]) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * ringScale, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const angle of [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4]) {
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(centerX - x, centerY - y);
    ctx.lineTo(centerX + x, centerY + y);
    ctx.stroke();
  }

  ctx.strokeStyle = INDICATOR_RIM_COLOR;
  ctx.lineWidth = Math.max(1.5, width * 0.01);
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX, centerY - radius);
  ctx.stroke();

  return { centerX, centerY, radius };
}

function drawPlaneVector(ctx, point, color, radius, centerX, centerY) {
  const origin = projectTopDownPoint({ x: 0, y: 0, z: 0 }, radius, centerX, centerY);
  const clampedLength = Math.hypot(point.x, point.z);
  const scale = clampedLength > INDICATOR_PLANE_SCALE
    ? INDICATOR_PLANE_SCALE / clampedLength
    : 1;
  const target = projectTopDownPoint({
    x: point.x * scale,
    y: point.y,
    z: point.z * scale
  }, radius, centerX, centerY);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, radius * 0.06);
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(target.x, target.y, Math.max(3, radius * 0.075), 0, Math.PI * 2);
  ctx.fill();
}

function drawHeightGauge(ctx, targetPoint, currentPoint, width, height) {
  const railX = width * 0.88;
  const railTop = height * 0.26;
  const railBottom = height * 0.86;
  const railMid = (railTop + railBottom) / 2;
  const railHalf = (railBottom - railTop) / 2;

  ctx.strokeStyle = INDICATOR_GRID_COLOR;
  ctx.lineWidth = Math.max(1, width * 0.008);
  ctx.beginPath();
  ctx.moveTo(railX, railTop);
  ctx.lineTo(railX, railBottom);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(232, 184, 48, 0.22)';
  ctx.beginPath();
  ctx.moveTo(railX - width * 0.025, railMid);
  ctx.lineTo(railX + width * 0.025, railMid);
  ctx.stroke();

  for (const [point, color, offset] of [
    [targetPoint, INDICATOR_TARGET_COLOR, -width * 0.018],
    [currentPoint, INDICATOR_CURRENT_COLOR, width * 0.018]
  ]) {
    const value = clamp(Number.isFinite(point?.y) ? point.y : 0, -INDICATOR_PLANE_SCALE, INDICATOR_PLANE_SCALE);
    const y = railMid - (value / INDICATOR_PLANE_SCALE) * railHalf;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(railX + offset, y, Math.max(2.5, width * 0.016), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawImpactGauge(ctx, impactPower, width, centerX, centerY, radius) {
  const power = Math.max(0, Number.isFinite(impactPower) ? impactPower : 0);
  const ratio = clamp(power / INDICATOR_IMPACT_REFERENCE, 0, 1);
  if (ratio <= 0.005) {
    return;
  }

  ctx.strokeStyle = `rgba(255, 92, 64, ${0.35 + (ratio * 0.55)})`;
  ctx.lineWidth = Math.max(2, width * 0.012);
  ctx.beginPath();
  ctx.arc(
    centerX,
    centerY,
    radius * 1.12,
    -Math.PI / 2,
    -Math.PI / 2 + (Math.PI * 2 * ratio)
  );
  ctx.stroke();

  ctx.font = `${Math.max(10, width * 0.062)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgba(255, 132, 96, ${0.6 + (ratio * 0.35)})`;
  ctx.fillText(`power ${power.toFixed(1)}`, width * 0.08, centerY + radius * 0.9);
}

export class UI {
  constructor() {
    this.app = document.getElementById('app');
    this.playerLabel = document.getElementById('player-label');
    this.enemyLabel = document.getElementById('enemy-label');
    this.playerHealthBarFill = document.querySelector('#player-health .health-bar-fill');
    this.enemyHealthBarFill = document.querySelector('#enemy-health .health-bar-fill');
    this.playerHealthValue = document.getElementById('player-health-value');
    this.enemyHealthValue = document.getElementById('enemy-health-value');
    this.instructions = document.getElementById('controls-hint');
    this.startMenu = document.getElementById('start-menu');
    this.startMenuTitle = this.startMenu.querySelector('h1');
    this.startMenuCopy = this.startMenu.querySelector('.menu-copy');
    this.modeActions = document.getElementById('mode-actions');
    this.startSinglePlayerButton = document.getElementById('start-singleplayer');
    this.startTestModeButton = document.getElementById('start-testmode');
    this.startSimulatorButton = document.getElementById('start-simulator');
    this.startMultiplayerButton = document.getElementById('start-multiplayer');
    this.singlePlayerSetup = document.getElementById('singleplayer-setup');
    this.singlePlayerSetupControls = document.getElementById('singleplayer-setup-controls');
    this.singlePlayerStartButton = document.getElementById('singleplayer-start');
    this.singlePlayerBackButton = document.getElementById('singleplayer-back');
    this.musicButton = document.getElementById('music-toggle');
    this.gameMessage = document.getElementById('game-message');
    this.leftStalkIndicator = document.getElementById('left-stalk-indicator');
    this.rightStalkIndicator = document.getElementById('right-stalk-indicator');
    this.testPanel = document.getElementById('test-panel');
    this.testPanelKicker = this.testPanel.querySelector('.test-panel__kicker');
    this.testPanelTitle = this.testPanel.querySelector('h2');
    this.testPanelCopy = this.testPanel.querySelector('.test-panel__copy');
    this.testStatus = document.getElementById('test-status');
    this.testControls = document.getElementById('test-controls');
    this.testApplyButton = document.getElementById('test-apply');
    this.testResetArenaButton = document.getElementById('test-reset-arena');
    this.testResetDefaultsButton = document.getElementById('test-reset-defaults');
    this.simulatorPanel = document.getElementById('simulator-panel');
    this.simulatorStatus = document.getElementById('simulator-status');
    this.simulatorSeedInput = document.getElementById('simulator-seed');
    this.simulatorMatchCountInput = document.getElementById('simulator-match-count');
    this.simulatorRunButton = document.getElementById('simulator-run');
    this.simulatorRestartVisualButton = document.getElementById('simulator-restart-visual');
    this.simulatorCopyJsonButton = document.getElementById('simulator-copy-json');
    this.simulatorCopyStatus = document.getElementById('simulator-copy-status');
    this.simulatorMetrics = document.getElementById('simulator-metrics');
    this.simulatorTuningStatus = document.getElementById('simulator-tuning-status');
    this.simulatorTuningControls = document.getElementById('simulator-tuning-controls');
    this.simulatorTuningApplyButton = document.getElementById('simulator-tuning-apply');
    this.simulatorTuningDefaultsButton = document.getElementById('simulator-tuning-defaults');
    this.testControlRefs = new Map();
    this.testControlSchema = [];
    this.fullTestControlSchema = [];
    this.pendingTestValues = null;
    this.appliedTestValues = null;
    this.onTestApply = null;
    this.simulatorTuningControlRefs = new Map();
    this.simulatorTuningControlSchema = [];
    this.fullSimulatorTuningControlSchema = [];
    this.pendingSimulatorTuningValues = null;
    this.appliedSimulatorTuningValues = null;
    this.onSimulatorTuningApply = null;
    this.singlePlayerOptionValues = {};
    this.singlePlayerOptionRefs = new Map();

    this.drawStalkIndicator(this.leftStalkIndicator, null);
    this.drawStalkIndicator(this.rightStalkIndicator, null);
  }

  setInstructions(text) {
    this.instructions.textContent = text;
  }

  setHealthLabels(playerLabel, opponentLabel) {
    this.playerLabel.textContent = playerLabel;
    this.enemyLabel.textContent = opponentLabel;
  }

  updatePlayerHealth(currentHealth, maxHealth) {
    this.updateHealthBar(this.playerHealthBarFill, this.playerHealthValue, currentHealth, maxHealth, '#b8443a');
  }

  updateEnemyHealth(currentHealth, maxHealth) {
    this.updateHealthBar(this.enemyHealthBarFill, this.enemyHealthValue, currentHealth, maxHealth, '#888078');
  }

  formatHealthValue(value) {
    if (!Number.isFinite(value)) {
      return '0';
    }

    return Math.abs(value - Math.round(value)) < 0.05
      ? `${Math.round(value)}`
      : value.toFixed(1);
  }

  updateHealthBar(fillElement, valueElement, currentHealth, maxHealth, healthyColor) {
    const percentage = Math.max(0, (currentHealth / maxHealth) * 100);
    fillElement.style.width = `${percentage}%`;
    valueElement.textContent = `${this.formatHealthValue(currentHealth)}/${this.formatHealthValue(maxHealth)}`;

    if (percentage > 66) {
      fillElement.style.backgroundColor = healthyColor;
    } else if (percentage > 33) {
      fillElement.style.backgroundColor = '#c49a2a';
    } else {
      fillElement.style.backgroundColor = '#d04030';
    }
  }

  setupMusicButton(toggleCallback) {
    this.musicButton.addEventListener('click', toggleCallback);
  }

  setupModeButtons({ onSinglePlayer, onTestMode, onSimulator, onMultiplayer }) {
    this.startSinglePlayerButton.addEventListener('click', onSinglePlayer);
    this.startTestModeButton.addEventListener('click', onTestMode);
    this.startSimulatorButton.addEventListener('click', onSimulator);
    this.startMultiplayerButton.addEventListener('click', onMultiplayer);
  }

  setupSinglePlayerSetup({ schema = [], values = {}, onStart, onBack }) {
    this.singlePlayerOptionValues = { ...values };
    this.renderSinglePlayerSetupControls(schema, this.singlePlayerOptionValues);
    this.singlePlayerStartButton.onclick = () => {
      onStart?.({ ...this.singlePlayerOptionValues });
    };
    this.singlePlayerBackButton.onclick = () => {
      this.showModeSelect();
      onBack?.();
    };
  }

  showStartMenu() {
    this.startMenu.classList.add('visible');
    this.showModeSelect();
  }

  hideStartMenu() {
    this.startMenu.classList.remove('visible');
  }

  showModeSelect() {
    this.startMenuTitle.textContent = 'Choose A Mode';
    this.startMenuCopy.textContent = 'Single Player, Test Mode, Simulator, or LAN Multiplayer. The snails keep getting stranger.';
    this.modeActions.classList.remove('hidden');
    this.singlePlayerSetup.classList.add('hidden');
  }

  showSinglePlayerSetup(values = {}) {
    this.startMenuTitle.textContent = 'Single Player';
    this.startMenuCopy.textContent = 'Pick a stage and enemy setup.';
    this.modeActions.classList.add('hidden');
    this.singlePlayerSetup.classList.remove('hidden');
    this.updateSinglePlayerSetupValues(values);
  }

  renderSinglePlayerSetupControls(schema, values) {
    this.singlePlayerSetupControls.innerHTML = '';
    this.singlePlayerOptionRefs.clear();

    for (const entry of schema) {
      const label = document.createElement('label');
      label.className = 'singleplayer-control';

      const labelText = document.createElement('span');
      labelText.className = 'singleplayer-control__label';
      labelText.textContent = entry.label;

      const select = document.createElement('select');
      select.className = 'singleplayer-control__select';
      select.id = `singleplayer-option-${entry.id}`;
      for (const option of entry.options ?? []) {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        select.appendChild(optionElement);
      }

      select.value = `${values[entry.id] ?? entry.defaultValue}`;
      select.addEventListener('change', (event) => {
        this.singlePlayerOptionValues[entry.id] = event.currentTarget.value;
      });

      label.append(labelText, select);
      this.singlePlayerSetupControls.appendChild(label);
      this.singlePlayerOptionRefs.set(entry.id, { select, entry });
    }
  }

  updateSinglePlayerSetupValues(values) {
    this.singlePlayerOptionValues = {
      ...this.singlePlayerOptionValues,
      ...values
    };

    for (const [id, refs] of this.singlePlayerOptionRefs.entries()) {
      const nextValue = this.singlePlayerOptionValues[id] ?? refs.entry.defaultValue;
      refs.select.value = `${nextValue}`;
      this.singlePlayerOptionValues[id] = nextValue;
    }
  }

  showTestPanel({ schema, values, onApply, onResetArena, onResetDefaults, header = {} }) {
    const labels = {
      kicker: 'Test Mode',
      title: 'Snail Lab',
      copy: 'Stage changes, apply them explicitly, and keep tuning locally on this browser.',
      ...header
    };

    this.testPanelKicker.textContent = labels.kicker;
    this.testPanelTitle.textContent = labels.title;
    this.testPanelCopy.textContent = labels.copy;
    this.testPanel.classList.add('visible');
    this.app.classList.add('test-panel-visible');
    this.onTestApply = onApply;
    this.appliedTestValues = { ...values };
    this.pendingTestValues = { ...values };
    this.testResetArenaButton.onclick = onResetArena;
    this.testResetDefaultsButton.onclick = onResetDefaults;
    this.testApplyButton.onclick = () => {
      if (!this.hasPendingTestChanges()) {
        return;
      }

      this.onTestApply?.({ ...this.pendingTestValues });
    };
    this.renderTestControls(schema, values);
    this.updateTestPanelValues(values, { force: true });
  }

  hideTestPanel() {
    this.testPanel.classList.remove('visible');
    this.app.classList.remove('test-panel-visible');
    this.onTestApply = null;
    this.pendingTestValues = null;
    this.appliedTestValues = null;
  }

  showSimulatorPanel({
    state,
    schema = [],
    values = {},
    onRunBatch,
    onRestartVisual,
    onCopyJson,
    onApplyTuning,
    onResetTuningDefaults
  }) {
    this.simulatorPanel.classList.add('visible');
    this.app.classList.add('simulator-panel-visible');
    this.simulatorRunButton.onclick = () => {
      this.clearSimulatorCopyStatus();
      onRunBatch?.({
        seed: this.simulatorSeedInput.value,
        matchCount: Number(this.simulatorMatchCountInput.value)
      });
    };
    this.simulatorRestartVisualButton.onclick = onRestartVisual;
    this.simulatorCopyJsonButton.onclick = onCopyJson;
    this.onSimulatorTuningApply = onApplyTuning;
    this.appliedSimulatorTuningValues = { ...values };
    this.pendingSimulatorTuningValues = { ...values };
    this.simulatorTuningApplyButton.onclick = () => {
      if (!this.hasPendingSimulatorTuningChanges()) {
        return;
      }

      this.onSimulatorTuningApply?.({ ...this.pendingSimulatorTuningValues });
    };
    this.simulatorTuningDefaultsButton.onclick = onResetTuningDefaults;
    this.renderSimulatorTuningControls(schema, values);
    this.updateSimulatorTuningValues(values, { force: true });
    this.updateSimulatorPanelStatus(state, { forceInputs: true });
  }

  hideSimulatorPanel() {
    this.simulatorPanel.classList.remove('visible');
    this.app.classList.remove('simulator-panel-visible');
    this.simulatorRunButton.onclick = null;
    this.simulatorRestartVisualButton.onclick = null;
    this.simulatorCopyJsonButton.onclick = null;
    this.simulatorTuningApplyButton.onclick = null;
    this.simulatorTuningDefaultsButton.onclick = null;
    this.onSimulatorTuningApply = null;
    this.pendingSimulatorTuningValues = null;
    this.appliedSimulatorTuningValues = null;
    this.clearSimulatorCopyStatus();
  }

  updateSimulatorPanelStatus(state, { forceInputs = false } = {}) {
    if (!state) {
      this.simulatorStatus.textContent = 'Simulator inactive';
      this.simulatorMetrics.innerHTML = '';
      return;
    }

    if (forceInputs || document.activeElement !== this.simulatorSeedInput) {
      this.simulatorSeedInput.value = `${state.seed}`;
    }
    if (forceInputs || document.activeElement !== this.simulatorMatchCountInput) {
      this.simulatorMatchCountInput.value = `${state.matchCount}`;
    }

    const progress = state.progress ?? { completed: 0, total: state.matchCount, finished: false };
    const visual = state.visualPhase === 'ended'
      ? `visual ended · winner ${state.visualWinnerSlot ?? 'draw'}`
      : `visual ${state.visualPhase}`;
    this.simulatorStatus.textContent = state.batchState === 'running'
      ? `batch ${progress.completed}/${progress.total} · seed ${state.seed}`
      : `batch complete · ${visual} · ${state.visualDurationSeconds}s`;
    this.simulatorRunButton.disabled = state.batchState === 'running';
    this.simulatorCopyJsonButton.disabled = !state.report || state.report.completed === 0;
    this.updateSimulatorTuningValues(state.tuningValues);
    this.updateSimulatorTuningStatus(state);
    this.renderSimulatorMetrics(state.report);
  }

  renderSimulatorMetrics(report) {
    this.simulatorMetrics.innerHTML = '';
    if (!report || report.completed === 0) {
      const empty = document.createElement('div');
      empty.className = 'simulator-metric simulator-metric--wide';
      empty.textContent = 'No batch results yet.';
      this.simulatorMetrics.appendChild(empty);
      return;
    }

    const summary = report.summary;
    const rows = [
      ['Human Wins', `${Math.round(summary.humanWinRate * 100)}%`],
      ['Bot Wins', `${Math.round(summary.botWinRate * 100)}%`],
      ['Draw/Timeout', `${Math.round(summary.drawRate * 100)}%`],
      ['Avg Time', `${summary.averageDurationSeconds}s`],
      ['Human Damage', summary.averageHumanDamage],
      ['Bot Damage', summary.averageBotDamage],
      ['Human Hits', summary.averageHumanDamageEvents],
      ['Bot Hits', summary.averageBotDamageEvents],
      ['Human Trail', `${summary.averageHumanTrailSeconds}s`],
      ['Bot Trail', `${summary.averageBotTrailSeconds}s`],
      ['Human HP', summary.averageHumanRemainingHp],
      ['Bot HP', summary.averageBotRemainingHp]
    ];

    for (const [label, value] of rows) {
      const item = document.createElement('div');
      item.className = 'simulator-metric';
      const labelElement = document.createElement('span');
      labelElement.textContent = label;
      const valueElement = document.createElement('strong');
      valueElement.textContent = `${value}`;
      item.append(labelElement, valueElement);
      this.simulatorMetrics.appendChild(item);
    }

    if ((report.scenarios?.length ?? 0) <= 1) {
      return;
    }

    const scenarioHeader = document.createElement('div');
    scenarioHeader.className = 'simulator-metric simulator-metric--wide';
    const scenarioHeaderLabel = document.createElement('span');
    scenarioHeaderLabel.textContent = 'Scenario Search';
    const scenarioHeaderValue = document.createElement('strong');
    scenarioHeaderValue.textContent = `${report.scenarios.length} cases`;
    scenarioHeader.append(scenarioHeaderLabel, scenarioHeaderValue);
    this.simulatorMetrics.appendChild(scenarioHeader);

    for (const scenarioReport of report.scenarios) {
      const scenario = scenarioReport.scenario;
      const scenarioSummary = scenarioReport.summary;
      const item = document.createElement('div');
      item.className = 'simulator-metric simulator-metric--wide';
      const labelElement = document.createElement('span');
      labelElement.textContent = scenario.label;
      const valueElement = document.createElement('strong');
      valueElement.textContent = [
        `H ${Math.round(scenarioSummary.humanWinRate * 100)}%`,
        `B ${Math.round(scenarioSummary.botWinRate * 100)}%`,
        `${scenarioSummary.averageDurationSeconds}s`
      ].join(' · ');
      item.append(labelElement, valueElement);
      this.simulatorMetrics.appendChild(item);
    }
  }

  setSimulatorCopyStatus(message) {
    this.simulatorCopyStatus.textContent = message;
  }

  clearSimulatorCopyStatus() {
    this.simulatorCopyStatus.textContent = '';
  }

  renderSimulatorTuningControls(schema, values) {
    this.fullSimulatorTuningControlSchema = schema;
    const visibleSchema = schema.filter((entry) => isTuningEntryVisible(entry, values));
    const nextSchemaKey = JSON.stringify(visibleSchema.map((entry) => entry.id));
    const currentSchemaKey = JSON.stringify(this.simulatorTuningControlSchema.map((entry) => entry.id));
    if (nextSchemaKey === currentSchemaKey && this.simulatorTuningControlRefs.size > 0) {
      return;
    }

    this.simulatorTuningControls.innerHTML = '';
    this.simulatorTuningControlRefs.clear();
    this.simulatorTuningControlSchema = visibleSchema;

    const groups = new Map();
    for (const entry of visibleSchema) {
      if (!groups.has(entry.section)) {
        groups.set(entry.section, []);
      }

      groups.get(entry.section).push(entry);
    }

    for (const [section, entries] of groups.entries()) {
      const details = document.createElement('details');
      details.className = 'test-panel__section';
      details.open = section === 'Terrain' || section === 'Movement' || section === 'Stalk Controls';

      const summary = document.createElement('summary');
      summary.textContent = section;
      details.appendChild(summary);

      const sectionBody = document.createElement('div');
      sectionBody.className = 'test-panel__section-body';
      details.appendChild(sectionBody);

      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'test-control';

        const header = document.createElement('div');
        header.className = 'test-control__header';

        const label = document.createElement('label');
        label.className = 'test-control__label';
        label.textContent = entry.label;
        label.htmlFor = `simulator-tuning-control-${entry.id}`;

        const valueElement = document.createElement('span');
        valueElement.className = 'test-control__value';
        valueElement.textContent = formatTuningValue(entry, values?.[entry.id] ?? entry.defaultValue);

        header.append(label, valueElement);

        const input = this.createSimulatorTuningInput(entry, values?.[entry.id] ?? entry.defaultValue);
        input.addEventListener('input', (event) => {
          this.handleSimulatorTuningInput(entry, event.currentTarget.value, valueElement);
        });
        input.addEventListener('change', (event) => {
          this.handleSimulatorTuningInput(entry, event.currentTarget.value, valueElement);
        });

        row.append(header, input);
        sectionBody.appendChild(row);
        this.simulatorTuningControlRefs.set(entry.id, { input, valueElement, entry });
      }

      this.simulatorTuningControls.appendChild(details);
    }
  }

  updateSimulatorTuningValues(values, { force = false } = {}) {
    if (!values) {
      return;
    }

    const wasDirty = this.hasPendingSimulatorTuningChanges();
    this.appliedSimulatorTuningValues = { ...values };
    if (force || !wasDirty) {
      this.pendingSimulatorTuningValues = { ...values };
      this.renderSimulatorTuningControls(
        this.fullSimulatorTuningControlSchema.length > 0
          ? this.fullSimulatorTuningControlSchema
          : this.simulatorTuningControlSchema,
        this.pendingSimulatorTuningValues
      );
      this.syncRenderedSimulatorTuningValues(this.pendingSimulatorTuningValues);
    }

    this.updateSimulatorTuningButtons();
  }

  syncRenderedSimulatorTuningValues(values) {
    if (!values) {
      return;
    }

    for (const [id, refs] of this.simulatorTuningControlRefs.entries()) {
      const nextValue = values?.[id];
      if (nextValue === undefined) {
        continue;
      }

      refs.input.value = `${nextValue}`;
      refs.valueElement.textContent = formatTuningValue(refs.entry, nextValue);
    }
  }

  updateSimulatorTuningStatus(state) {
    if (!this.simulatorTuningStatus) {
      return;
    }

    const storageStatus = state?.tuningStoredLocally ? 'saved locally' : 'not persisted';
    const pendingStatus = this.hasPendingSimulatorTuningChanges()
      ? `${this.countPendingSimulatorTuningChanges()} pending`
      : 'applied';
    this.simulatorTuningStatus.textContent = `match knobs ${pendingStatus} · ${storageStatus}`;
    this.updateSimulatorTuningButtons();
  }

  hasPendingSimulatorTuningChanges() {
    if (!this.pendingSimulatorTuningValues || !this.appliedSimulatorTuningValues) {
      return false;
    }

    return Object.keys(this.pendingSimulatorTuningValues).some((key) => (
      this.pendingSimulatorTuningValues[key] !== this.appliedSimulatorTuningValues[key]
    ));
  }

  countPendingSimulatorTuningChanges() {
    if (!this.pendingSimulatorTuningValues || !this.appliedSimulatorTuningValues) {
      return 0;
    }

    let count = 0;
    for (const key of Object.keys(this.pendingSimulatorTuningValues)) {
      if (this.pendingSimulatorTuningValues[key] !== this.appliedSimulatorTuningValues[key]) {
        count += 1;
      }
    }

    return count;
  }

  updateSimulatorTuningButtons() {
    if (!this.simulatorTuningApplyButton) {
      return;
    }

    const dirty = this.hasPendingSimulatorTuningChanges();
    this.simulatorTuningApplyButton.disabled = !dirty;
    this.simulatorTuningApplyButton.textContent = dirty
      ? `Apply Knobs (${this.countPendingSimulatorTuningChanges()})`
      : 'Apply Knobs';
  }

  createSimulatorTuningInput(entry, value) {
    if (entry.kind === 'choice') {
      const select = document.createElement('select');
      select.className = 'test-control__input test-control__select';
      select.id = `simulator-tuning-control-${entry.id}`;
      for (const option of entry.options ?? []) {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        select.appendChild(optionElement);
      }
      select.value = `${value}`;
      return select;
    }

    const input = document.createElement('input');
    input.className = 'test-control__input test-control__slider';
    input.id = `simulator-tuning-control-${entry.id}`;
    input.type = 'range';
    input.min = `${entry.min}`;
    input.max = `${entry.max}`;
    input.step = `${entry.step}`;
    input.value = `${value}`;
    return input;
  }

  handleSimulatorTuningInput(entry, rawValue, valueElement) {
    if (!this.pendingSimulatorTuningValues) {
      this.pendingSimulatorTuningValues = {};
    }

    const nextValue = entry.kind === 'choice' ? rawValue : Number(rawValue);
    this.pendingSimulatorTuningValues[entry.id] = nextValue;
    valueElement.textContent = formatTuningValue(entry, nextValue);
    this.renderSimulatorTuningControls(this.fullSimulatorTuningControlSchema, this.pendingSimulatorTuningValues);
    this.syncRenderedSimulatorTuningValues(this.pendingSimulatorTuningValues);
    this.updateSimulatorTuningButtons();
  }

  renderTestControls(schema, values) {
    this.fullTestControlSchema = schema;
    const visibleSchema = schema.filter((entry) => isTuningEntryVisible(entry, values));
    const nextSchemaKey = JSON.stringify(visibleSchema.map((entry) => entry.id));
    const currentSchemaKey = JSON.stringify(this.testControlSchema.map((entry) => entry.id));
    if (nextSchemaKey === currentSchemaKey && this.testControlRefs.size > 0) {
      return;
    }

    this.testControls.innerHTML = '';
    this.testControlRefs.clear();
    this.testControlSchema = visibleSchema;

    const groups = new Map();
    for (const entry of visibleSchema) {
      if (!groups.has(entry.section)) {
        groups.set(entry.section, []);
      }

      groups.get(entry.section).push(entry);
    }

    for (const [section, entries] of groups.entries()) {
      const details = document.createElement('details');
      details.className = 'test-panel__section';
      details.open = true;

      const summary = document.createElement('summary');
      summary.textContent = section;
      details.appendChild(summary);

      const sectionBody = document.createElement('div');
      sectionBody.className = 'test-panel__section-body';
      details.appendChild(sectionBody);

      for (const entry of entries) {
        const row = document.createElement('div');
        row.className = 'test-control';

        const header = document.createElement('div');
        header.className = 'test-control__header';

        const label = document.createElement('label');
        label.className = 'test-control__label';
        label.textContent = entry.label;
        label.htmlFor = `test-control-${entry.id}`;

        const valueElement = document.createElement('span');
        valueElement.className = 'test-control__value';
        valueElement.textContent = formatTuningValue(entry, values?.[entry.id] ?? entry.defaultValue);

        header.append(label, valueElement);

        const input = this.createTestControlInput(entry, values?.[entry.id] ?? entry.defaultValue);
        input.addEventListener('input', (event) => {
          this.handleTestControlInput(entry, event.currentTarget.value, valueElement);
        });
        input.addEventListener('change', (event) => {
          this.handleTestControlInput(entry, event.currentTarget.value, valueElement);
        });

        row.append(header, input);
        sectionBody.appendChild(row);
        this.testControlRefs.set(entry.id, { input, valueElement, entry });
      }

      this.testControls.appendChild(details);
    }
  }

  updateTestPanelValues(values, { force = false } = {}) {
    if (!values) {
      return;
    }

    this.appliedTestValues = { ...values };
    if (force || !this.hasPendingTestChanges()) {
      this.pendingTestValues = { ...values };
    }

    this.renderTestControls(this.fullTestControlSchema.length > 0 ? this.fullTestControlSchema : this.testControlSchema, this.pendingTestValues);
    this.syncRenderedTestValues(this.pendingTestValues);
    this.updateTestButtons();
  }

  syncRenderedTestValues(values) {
    if (!values) {
      return;
    }

    for (const [id, refs] of this.testControlRefs.entries()) {
      const nextValue = values?.[id];
      if (nextValue === undefined) {
        continue;
      }

      refs.input.value = `${nextValue}`;
      refs.valueElement.textContent = formatTuningValue(refs.entry, nextValue);
    }
  }

  updateTestPanelStatus(state) {
    if (!state) {
      this.testStatus.textContent = 'Local tuning inactive';
      this.updateTestButtons();
      return;
    }

    const playerStatus = state.playerAlive ? 'player alive' : 'player dead';
    const botLabel = state.entityLabel ?? (state.totalBots === 1 ? 'bot' : 'bots');
    const storageStatus = state.storedLocally ? 'saved locally' : 'not persisted';
    const pendingStatus = this.hasPendingTestChanges()
      ? `${this.countPendingTestChanges()} pending`
      : 'applied';
    this.testStatus.textContent = `${playerStatus} · ${state.livingBots}/${state.totalBots} ${botLabel} active · ${pendingStatus} · ${storageStatus}`;
    this.updateTestButtons();
  }

  hasPendingTestChanges() {
    if (!this.pendingTestValues || !this.appliedTestValues) {
      return false;
    }

    return Object.keys(this.pendingTestValues).some((key) => this.pendingTestValues[key] !== this.appliedTestValues[key]);
  }

  countPendingTestChanges() {
    if (!this.pendingTestValues || !this.appliedTestValues) {
      return 0;
    }

    let count = 0;
    for (const key of Object.keys(this.pendingTestValues)) {
      if (this.pendingTestValues[key] !== this.appliedTestValues[key]) {
        count += 1;
      }
    }

    return count;
  }

  updateTestButtons() {
    if (!this.testApplyButton) {
      return;
    }

    const dirty = this.hasPendingTestChanges();
    this.testApplyButton.disabled = !dirty;
    this.testApplyButton.textContent = dirty
      ? `Apply (${this.countPendingTestChanges()})`
      : 'Apply';
  }

  setMusicState(isPlaying) {
    this.musicButton.textContent = isPlaying ? 'Music On' : 'Music Off';
    this.musicButton.classList.toggle('active', isPlaying);
  }

  updateStalkIndicators(stalks) {
    this.drawStalkIndicator(this.leftStalkIndicator, stalks?.left ?? null);
    this.drawStalkIndicator(this.rightStalkIndicator, stalks?.right ?? null);
  }

  drawStalkIndicator(canvas, stalkState) {
    ensureIndicatorResolution(canvas);
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    const { centerX, centerY, radius } = drawTopDownPlane(ctx, width, height);

    ctx.font = `${Math.max(11, width * 0.07)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(235, 224, 200, 0.72)';
    ctx.fillText('target', width * 0.08, height * 0.12);
    ctx.fillStyle = 'rgba(143, 211, 255, 0.85)';
    ctx.fillText('current', width * 0.08, height * 0.2);

    if (!stalkState) {
      const neutralPoint = { x: 0, y: 0, z: 1 };
      drawPlaneVector(ctx, neutralPoint, 'rgba(232, 184, 48, 0.22)', radius, centerX, centerY);
      drawPlaneVector(ctx, neutralPoint, 'rgba(143, 211, 255, 0.22)', radius, centerX, centerY);
      drawHeightGauge(ctx, neutralPoint, neutralPoint, width, height);
      return;
    }

    const targetPoint = stalkState.targetPoint ?? getScaledPoint(stalkState.targetVector, stalkState.targetReach ?? 1);
    const currentPoint = stalkState.currentPoint ?? getScaledPoint(stalkState.currentVector, stalkState.currentReach ?? 1);
    drawPlaneVector(ctx, targetPoint, INDICATOR_TARGET_COLOR, radius, centerX, centerY);
    drawPlaneVector(ctx, currentPoint, INDICATOR_CURRENT_COLOR, radius, centerX, centerY);
    drawHeightGauge(ctx, targetPoint, currentPoint, width, height);
    drawImpactGauge(ctx, stalkState.impactPower, width, centerX, centerY, radius);
  }

  createTestControlInput(entry, value) {
    if (entry.kind === 'choice') {
      const select = document.createElement('select');
      select.className = 'test-control__input test-control__select';
      select.id = `test-control-${entry.id}`;
      for (const option of entry.options ?? []) {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        select.appendChild(optionElement);
      }
      select.value = `${value}`;
      return select;
    }

    const input = document.createElement('input');
    input.className = 'test-control__input test-control__slider';
    input.id = `test-control-${entry.id}`;
    input.type = 'range';
    input.min = `${entry.min}`;
    input.max = `${entry.max}`;
    input.step = `${entry.step}`;
    input.value = `${value}`;
    return input;
  }

  handleTestControlInput(entry, rawValue, valueElement) {
    if (!this.pendingTestValues) {
      this.pendingTestValues = {};
    }

    const nextValue = entry.kind === 'choice' ? rawValue : Number(rawValue);
    this.pendingTestValues[entry.id] = nextValue;
    valueElement.textContent = formatTuningValue(entry, nextValue);
    this.renderTestControls(this.fullTestControlSchema, this.pendingTestValues);
    this.syncRenderedTestValues(this.pendingTestValues);
    this.updateTestButtons();
  }

  showMessage({ variant, title, body, actions = [] }) {
    this.gameMessage.innerHTML = '';
    this.gameMessage.className = 'visible';
    if (variant) {
      this.gameMessage.classList.add(`game-message--${variant}`);
    }

    const titleElement = document.createElement('h2');
    titleElement.textContent = title;

    const bodyElement = document.createElement('p');
    bodyElement.textContent = body;

    this.gameMessage.append(titleElement, bodyElement);

    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'restart-button';
      button.textContent = action.label;
      button.addEventListener('click', action.onClick);
      this.gameMessage.appendChild(button);
    }
  }

  clearMessage() {
    this.gameMessage.className = '';
    this.gameMessage.innerHTML = '';
  }

  showGameOverMessage(playerWon) {
    this.showMessage({
      variant: playerWon ? 'victory' : 'defeat',
      title: playerWon ? 'SNAILED' : 'SALTED',
      body: playerWon
        ? 'The other guy got SNAILED.'
        : 'SALTED.',
      actions: [
        {
          label: 'Restart',
          onClick: () => {
            window.location.reload();
          }
        }
      ]
    });
  }
}
