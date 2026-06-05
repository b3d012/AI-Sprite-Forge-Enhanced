export class RuntimeAlignmentController {
  constructor(frames = [], options = {}) {
    this.anchor = options.anchor || { x: 128, y: 255, type: 'foot' };
    this.frames = frames.map((frame, index) => ({
      ...frame,
      index: frame.index ?? index,
      nudge: {
        x: frame.nudge?.x || 0,
        y: frame.nudge?.y || 0
      }
    }));
    this.selectedFrameId = this.frames[0]?.id || null;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
  }

  setFrames(frames) {
    this.frames = frames.map((frame, index) => ({
      ...frame,
      index: frame.index ?? index,
      nudge: {
        x: frame.nudge?.x || 0,
        y: frame.nudge?.y || 0
      }
    }));
    if (!this.frames.some((frame) => frame.id === this.selectedFrameId)) {
      this.selectedFrameId = this.frames[0]?.id || null;
    }
    this.emitChange();
  }

  selectFrame(frameId) {
    this.selectedFrameId = frameId;
    this.emitChange();
  }

  getSelectedFrame() {
    return this.frames.find((frame) => frame.id === this.selectedFrameId) || null;
  }

  nudgeSelected(dx, dy) {
    const frame = this.getSelectedFrame();
    if (!frame) return null;
    frame.nudge.x += dx;
    frame.nudge.y += dy;
    this.emitChange();
    return frame;
  }

  resetSelected() {
    const frame = this.getSelectedFrame();
    if (!frame) return null;
    frame.nudge = { x: 0, y: 0 };
    this.emitChange();
    return frame;
  }

  copySelectedAlignmentToAll() {
    const frame = this.getSelectedFrame();
    if (!frame) return null;
    for (const item of this.frames) {
      item.nudge = { x: frame.nudge.x, y: frame.nudge.y };
    }
    this.emitChange();
    return this.frames;
  }

  resetAll() {
    for (const frame of this.frames) {
      frame.nudge = { x: 0, y: 0 };
    }
    this.emitChange();
  }

  getAlignedFrames() {
    return this.frames.map((frame) => ({
      ...frame,
      nudge: { x: frame.nudge.x, y: frame.nudge.y }
    }));
  }

  emitChange() {
    if (this.onChange) {
      this.onChange(this.getAlignedFrames(), this.getSelectedFrame());
    }
  }
}

