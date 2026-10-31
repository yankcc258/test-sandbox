// 本页的生命状态只来自示例练习；不把点击次数、心率或浏览入口算成学习成果。
export function createLifeState(total) {
  let completed = new Set(),
    active = false,
    started = false,
    record = null;
  return {
    begin() {
      if (!record) {
        active = true;
        started = true;
      }
    },
    pause() {
      active = false;
    },
    progress(keys) {
      for (const k of keys) if (Number.isInteger(k) && k >= 0 && k < total) completed.add(k);
    },
    finish(tally) {
      if (record || completed.size !== total) return false;
      active = false;
      record = { completed: total, tally: { ...tally }, at: new Date().toISOString() };
      return true;
    },
    reset() {
      completed = new Set();
      active = started = false;
      record = null;
    },
    get snapshot() {
      const done = completed.size;
      return {
        total,
        done,
        left: total - done,
        active,
        record,
        phase: record ? 'complete' : active ? 'active' : started ? 'paused' : 'pending',
        label: record ? '本轮完成' : active ? '巩固中' : started ? '已暂停' : '待复习',
      };
    },
  };
}

// 替换当前过渡而非排队，快速滚动时不会积压动画。
export function createSignal() {
  let current = null;
  return {
    start(kind, from, to, duration = 0.9) {
      current = { kind, from, to, duration, elapsed: 0 };
    },
    clear() {
      current = null;
    },
    step(dt, enabled = true) {
      if (!enabled) current = null;
      if (!current) return null;
      current.elapsed += Math.max(0, dt);
      const p = Math.min(1, current.elapsed / current.duration);
      if (p >= 1) {
        current = null;
        return null;
      }
      const ease = p * p * (3 - 2 * p);
      return {
        ...current,
        p,
        y: current.from + (current.to - current.from) * ease,
        strength: Math.sin(Math.PI * p),
      };
    },
  };
}
