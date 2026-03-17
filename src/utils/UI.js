import { formatTuningValue, isTuningEntryVisible } from '../sim/Tuning.js';

const INDICATOR_TARGET_COLOR = '#e8b830';
const INDICATOR_CURRENT_COLOR = '#8fd3ff';
const INDICATOR_GRID_COLOR = 'rgba(210, 225, 255, 0.22)';
const INDICATOR_RIM_COLOR = 'rgba(232, 184, 48, 0.38)';
const DOME_FORWARD_TILT = 0.22;

function ensureIndicatorResolution(canvas) {
  const width = Math.max(1, Math.round(canvas.clientWidth * window.devicePixelRatio));
  const height = Math.max(1, Math.round(canvas.clientHeight * window.devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function rotatePoint(point) {
  const yaw = -0.72;
  const pitch = 0.78;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const x1 = point.x * cosYaw - point.z * sinYaw;
  const z1 = point.x * sinYaw + point.z * cosYaw;
  const y2 = point.y * cosPitch - z1 * sinPitch;
  const z2 = point.y * sinPitch + z1 * cosPitch;

  return { x: x1, y: y2, z: z2 };
}

function tiltPointForward(point) {
  const cosTilt = Math.cos(DOME_FORWARD_TILT);
  const sinTilt = Math.sin(DOME_FORWARD_TILT);
  return {
    x: point.x,
    y: point.y * cosTilt - point.z * sinTilt,
    z: point.y * sinTilt + point.z * cosTilt
  };
}

function projectPoint(point, radius, centerX, centerY) {
  const rotated = rotatePoint(tiltPointForward(point));
  const perspective = 1 / Math.max(0.35, 1.85 - rotated.z * 0.65);
  return {
    x: centerX + rotated.x * radius * perspective,
    y: centerY - rotated.y * radius * perspective
  };
}

function clampVectorToDome(vector = { x: 0, y: 1, z: 0 }) {
  const x = Number.isFinite(vector.x) ? vector.x : 0;
  const y = Number.isFinite(vector.y) ? vector.y : 1;
  const z = Number.isFinite(vector.z) ? vector.z : 0;
  const length = Math.hypot(x, y, z) || 1;
  let normalized = { x: x / length, y: y / length, z: z / length };

  if (normalized.y < 0.001) {
    const planarLength = Math.hypot(normalized.x, normalized.z) || 1;
    normalized = {
      x: normalized.x / planarLength,
      y: 0.001,
      z: normalized.z / planarLength
    };
  }

  const renormalizedLength = Math.hypot(normalized.x, normalized.y, normalized.z) || 1;
  return {
    x: normalized.x / renormalizedLength,
    y: normalized.y / renormalizedLength,
    z: normalized.z / renormalizedLength
  };
}

function drawWireDome(ctx, width, height) {
  const centerX = width / 2;
  const centerY = height * 0.7;
  const radius = Math.min(width, height) * 0.32;

  ctx.strokeStyle = INDICATOR_GRID_COLOR;
  ctx.lineWidth = Math.max(1, width * 0.008);

  for (const elevation of [0.2, 0.4, 0.6, 0.8]) {
    ctx.beginPath();
    for (let step = 0; step <= 48; step += 1) {
      const angle = (step / 48) * Math.PI * 2;
      const point = {
        x: Math.cos(angle) * Math.sqrt(1 - elevation * elevation),
        y: elevation,
        z: Math.sin(angle) * Math.sqrt(1 - elevation * elevation)
      };
      const projected = projectPoint(point, radius, centerX, centerY);
      if (step === 0) {
        ctx.moveTo(projected.x, projected.y);
      } else {
        ctx.lineTo(projected.x, projected.y);
      }
    }
    ctx.stroke();
  }

  for (const azimuth of [-0.9, -0.45, 0, 0.45, 0.9]) {
    ctx.beginPath();
    for (let step = 0; step <= 24; step += 1) {
      const elevationAngle = (step / 24) * (Math.PI / 2);
      const radiusAtElevation = Math.cos(elevationAngle);
      const point = {
        x: Math.sin(azimuth) * radiusAtElevation,
        y: Math.sin(elevationAngle),
        z: Math.cos(azimuth) * radiusAtElevation
      };
      const projected = projectPoint(point, radius, centerX, centerY);
      if (step === 0) {
        ctx.moveTo(projected.x, projected.y);
      } else {
        ctx.lineTo(projected.x, projected.y);
      }
    }
    ctx.stroke();
  }

  ctx.strokeStyle = INDICATOR_RIM_COLOR;
  ctx.beginPath();
  for (let step = 0; step <= 48; step += 1) {
    const angle = (step / 48) * Math.PI * 2;
    const projected = projectPoint({ x: Math.cos(angle), y: 0.001, z: Math.sin(angle) }, radius, centerX, centerY);
    if (step === 0) {
      ctx.moveTo(projected.x, projected.y);
    } else {
      ctx.lineTo(projected.x, projected.y);
    }
  }
  ctx.stroke();

  return { centerX, centerY, radius };
}

function drawVector(ctx, vector, color, radius, centerX, centerY) {
  const clamped = clampVectorToDome(vector);
  const origin = projectPoint({ x: 0, y: 0, z: 0 }, radius, centerX, centerY);
  const target = projectPoint(clamped, radius, centerX, centerY);

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
    this.startSinglePlayerButton = document.getElementById('start-singleplayer');
    this.startTestModeButton = document.getElementById('start-testmode');
    this.startMultiplayerButton = document.getElementById('start-multiplayer');
    this.musicButton = document.getElementById('music-toggle');
    this.gameMessage = document.getElementById('game-message');
    this.leftStalkIndicator = document.getElementById('left-stalk-indicator');
    this.rightStalkIndicator = document.getElementById('right-stalk-indicator');
    this.testPanel = document.getElementById('test-panel');
    this.testStatus = document.getElementById('test-status');
    this.testControls = document.getElementById('test-controls');
    this.testApplyButton = document.getElementById('test-apply');
    this.testResetArenaButton = document.getElementById('test-reset-arena');
    this.testResetDefaultsButton = document.getElementById('test-reset-defaults');
    this.testControlRefs = new Map();
    this.testControlSchema = [];
    this.fullTestControlSchema = [];
    this.pendingTestValues = null;
    this.appliedTestValues = null;
    this.onTestApply = null;

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

  updateHealthBar(fillElement, valueElement, currentHealth, maxHealth, healthyColor) {
    const percentage = (currentHealth / maxHealth) * 100;
    fillElement.style.width = `${percentage}%`;
    valueElement.textContent = `${currentHealth}/${maxHealth}`;

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

  setupModeButtons({ onSinglePlayer, onTestMode, onMultiplayer }) {
    this.startSinglePlayerButton.addEventListener('click', onSinglePlayer);
    this.startTestModeButton.addEventListener('click', onTestMode);
    this.startMultiplayerButton.addEventListener('click', onMultiplayer);
  }

  showStartMenu() {
    this.startMenu.classList.add('visible');
  }

  hideStartMenu() {
    this.startMenu.classList.remove('visible');
  }

  showTestPanel({ schema, values, onApply, onResetArena, onResetDefaults }) {
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
    const botLabel = state.totalBots === 1 ? 'bot' : 'bots';
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
    const { centerX, centerY, radius } = drawWireDome(ctx, width, height);

    ctx.font = `${Math.max(11, width * 0.07)}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(235, 224, 200, 0.72)';
    ctx.fillText('target', width * 0.08, height * 0.12);
    ctx.fillStyle = 'rgba(143, 211, 255, 0.85)';
    ctx.fillText('current', width * 0.08, height * 0.2);

    if (!stalkState) {
      drawVector(ctx, { x: 0, y: 1, z: 0 }, 'rgba(232, 184, 48, 0.22)', radius, centerX, centerY);
      drawVector(ctx, { x: 0, y: 1, z: 0 }, 'rgba(143, 211, 255, 0.22)', radius, centerX, centerY);
      return;
    }

    drawVector(ctx, stalkState.targetVector, INDICATOR_TARGET_COLOR, radius, centerX, centerY);
    drawVector(ctx, stalkState.currentVector, INDICATOR_CURRENT_COLOR, radius, centerX, centerY);
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
      title: playerWon ? 'Victory' : 'Defeat',
      body: playerWon
        ? 'Placeholder Pete is down.'
        : 'The enemy landed the final strike.',
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
