// Safety systems — built before any game, active during every activity:
//   1. DOUBLE VISION / STOP on B or Y (upper face button, either controller):
//      pauses, logs with current contrast, backs the staircase off 0.10.
//   2. Forced break prompt every breakIntervalMinutes of active play.
//   3. Hard session cap at sessionMinutes; continuing requires explicit
//      confirmation, re-asked every 5 minutes after that.
import config from './config.js';
import { staircase } from './staircase.js';
import { store } from './store.js';

const RECHECK_AFTER_CAP_MIN = 5;

export class Safety {
  constructor(ui, onEndSessionRequested) {
    this.ui = ui;
    this.onEndSessionRequested = onEndSessionRequested;
    this.paused = false;
    this.abortActivity = false;
    this.activityName = null;
    this.activeMs = 0; // active play time, excludes pauses/panels
    this._lastBreakMs = 0;
    this._capConfirmedThroughMs = config.sessionMinutes * 60_000;
    this._stopWasPressed = false;
    this._pendingFlows = [];
    this._flowRunning = false;
    this._lastTickSave = 0;
  }

  setActivity(name) {
    this.activityName = name;
    this.abortActivity = false;
    if (name) store.addActivity(name);
  }

  activeMinutes() {
    return this.activeMs / 60_000;
  }

  update(dt, session) {
    this._pollStopButton(session);

    // run at most one queued safety flow, only when no other panel is open
    if (!this._flowRunning && this._pendingFlows.length && !this.ui.busy) {
      const flow = this._pendingFlows.shift();
      this._flowRunning = true;
      flow().finally(() => {
        this._flowRunning = false;
      });
    }

    if (!this.activityName || this.paused || this.ui.busy) return;
    this.activeMs += dt * 1000;

    if (Date.now() - this._lastTickSave > 10_000) {
      this._lastTickSave = Date.now();
      store.tick(this.activeMinutes());
    }

    if (this.activeMs - this._lastBreakMs >= config.breakIntervalMinutes * 60_000) {
      this._lastBreakMs = this.activeMs;
      this._queue(() => this._breakFlow());
    } else if (this.activeMs >= this._capConfirmedThroughMs) {
      this._capConfirmedThroughMs = this.activeMs + RECHECK_AFTER_CAP_MIN * 60_000;
      this._queue(() => this._capFlow());
    }
  }

  _queue(flow) {
    this.paused = true;
    this._pendingFlows.push(flow);
  }

  _pollStopButton(session) {
    let pressed = false;
    if (session) {
      for (const src of session.inputSources) {
        // buttons[5] is B (right controller) / Y (left controller) on Quest
        if (src.gamepad?.buttons?.[5]?.pressed) pressed = true;
      }
    }
    if (window.__vtStopFlag) {
      pressed = true;
      window.__vtStopFlag = false;
    }
    if (pressed && !this._stopWasPressed) this.triggerStop();
    this._stopWasPressed = pressed;
  }

  // DOUBLE VISION / STOP — callable from button poll and from debug hook.
  triggerStop() {
    const before = staircase.contrast();
    const after = staircase.backOff('double-vision-stop', {
      activity: this.activityName,
      contrastBefore: before,
    });
    store.logEvent('double-vision', { activity: this.activityName, contrastBefore: before, contrastAfter: after });
    this._queue(() =>
      this.ui
        .panel(
          `DOUBLE VISION logged.\nStrong-eye contrast lowered: ${before.toFixed(2)} → ${after.toFixed(2)}.\nIf double vision keeps happening, stop training and tell your eye doctor.`,
          [
            { id: 'resume', label: 'Resume' },
            { id: 'end', label: 'End session', color: '#b03030' },
          ],
        )
        .then((id) => {
          this.paused = false;
          if (id === 'end') this._endRequested();
        }),
    );
  }

  async _breakFlow() {
    const SECONDS = 20;
    const done = this.ui.panel(
      `Break time — you've played ${Math.round(this.activeMinutes())} minutes.\nLook at something far away and rest your eyes.`,
      [{ id: 'resume', label: `Rest… ${SECONDS}s`, disabled: true }],
    );
    const panel = this.ui.activePanel();
    const btn = panel.btnMeshes[0];
    for (let s = SECONDS - 1; s >= 0; s--) {
      await new Promise((r) => setTimeout(r, 1000));
      if (s > 0) {
        btn.userData.redraw(`Rest… ${s}s`, { bg: '#555555', fg: '#999999' });
      } else {
        btn.userData.label = 'Resume';
        btn.userData.redraw('Resume');
        btn.userData.enable();
      }
    }
    await done;
    this.paused = false;
  }

  async _capFlow() {
    const id = await this.ui.panel(
      `Session cap reached: ${Math.round(this.activeMinutes())} of ${config.sessionMinutes} minutes.\nStopping here is the plan. Continue anyway?`,
      [
        { id: 'end', label: 'End session', color: '#b03030' },
        { id: 'continue', label: 'Continue (5 more min)' },
      ],
    );
    this.paused = false;
    if (id === 'end') this._endRequested();
  }

  _endRequested() {
    this.abortActivity = true;
    this.onEndSessionRequested();
  }
}
