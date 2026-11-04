// 观察模型的「配方」（露娜，2026-11-04）。一章一份，纯数据，积木和公式写法见 specimen-kit.js。
// 每份配方的 checks 会由 scripts/check-specimen-kit.mjs 拿这一章的原题答案核对：
//   question：原题 id；expr：用配方里的常数和公式算出来的值；probe：核对时滑杆停在哪里。
// 只核对数值题，单选、多选和填空不在这里。
export const RECIPES = {
  kinetics: {
    id: 'kinetics',
    title: '一级反应动力学',
    description:
      '例题的 c₀=0.100 mol/L。曲线是 c(t)=c₀e^(−kt)，下面的薄片是每 10 s 一片的浓度；黄绿竖线是半衰期 t½=ln2/k，横虚线是 c₀/2。拖动 k：k 越大，曲线掉得越快、半衰期越短；初始浓度不影响半衰期。',
    constants: { c0: 0.1 },
    functions: { c: [['t'], 'c0 * exp(-k * t)'] },
    probe: {
      name: 'k',
      label: '速率常数 k（s⁻¹）',
      min: 0.005,
      max: 0.08,
      step: 0.001,
      default: 0.02,
    },
    view: { x: [0, 150], y: [0, 0.11] },
    parts: [
      { part: 'axes', ticks: { x: 25, y: 0.025 } },
      { part: 'bars', var: 't', fn: 'c(t)', from: 0, to: 150, count: 15 },
      {
        part: 'curve',
        var: 't',
        fn: 'c(t)',
        from: 0,
        to: 150,
        segments: 80,
        color: 'ivory',
        width: 0.032,
      },
      { part: 'hline', at: 'c0 / 2', dashes: 14, color: 'ice' },
      { part: 'vline', at: 'ln(2) / k', to: 'c0 / 2', when: 'ln(2) / k <= 150' },
      { part: 'point', x: 'ln(2) / k', y: 'c0 / 2', when: 'ln(2) / k <= 150' },
      { part: 'point', x: 50, y: 'c(50)', color: 'ice', radius: 0.045 },
    ],
    readout: 'k={k|3} s⁻¹ · t½={ln(2)/k|3} s · c(50 s)={c(50)|3} mol/L',
    checks: [
      { question: 'kinetics:1', probe: 0.02, expr: 'c(50)' },
      { question: 'kinetics:2', probe: 0.02, expr: 'ln(2) / k' },
    ],
  },
  'quantum-box': {
    id: 'quantum-box',
    title: '一维势阱：边界与能级',
    description:
      '电子在宽 L=1–2 nm 的箱中，Eₙ=0.376n²/L² eV（L 以 nm 计）。两侧是箱壁，横条是 n=1–5 的能级，黄绿是当前 n；能级上的曲线是 ψₙ=sin(nπx/L)，内部节点 n−1 个，用短竖线标出。增大 n：能级间隔增大；增大 L：箱壁移开，能级按 1/L² 降低。驻波振幅仅为示意，不代表能量。',
    constants: { E11: 0.376 },
    functions: { E: [['n', 'w'], 'E11 * n^2 / w^2'] },
    controls: [
      { name: 'N', label: '量子数 n', min: 1, max: 5, step: 1, default: 2 },
      { name: 'L', label: '箱宽 L（nm）', min: 1, max: 2, step: 0.05, default: 1 },
    ],
    legend: '横向 x：0–2 nm；纵向能量：0–10 eV。驻波叠在当前能级上，振幅仅为示意。',
    view: { x: [-0.12, 2.12], y: [0, 10] },
    parts: [
      { part: 'wall', at: 0 },
      { part: 'wall', at: 'L' },
      {
        part: 'hline',
        repeat: { var: 'n', from: 1, to: 5 },
        at: 'E(n, L)',
        from: 0,
        to: 'L',
        highlight: 'n == N',
      },
      // 当前能级上的驻波，振幅 0.55 eV 只为看得见，不代表能量
      {
        part: 'curve',
        var: 'x',
        fn: 'E(N, L) + 0.55 * sin(N * pi * x / L)',
        from: 0,
        to: 'L',
        segments: 90,
        color: 'lime',
        width: 0.024,
        z: 0.2,
      },
      // 内部节点：x = jL/N，j=1…N−1
      {
        part: 'vline',
        repeat: { var: 'j', from: 1, to: 4 },
        when: 'j <= N - 1',
        at: 'j * L / N',
        to: 'E(N, L)',
        dashes: 6,
        color: 'ice',
      },
    ],
    readout:
      'n={N} · L={L} nm · Eₙ={E(N, L)|4} eV · Eₙ/E₁={N^2} · 内部节点 {N - 1} 个 · 到下一级 {E(N + 1, L) - E(N, L)|4} eV',
    checks: [
      { question: 'quantum-box:0', probe: 3, expr: 'E(3, L) / E(1, L)' },
      { question: 'quantum-box:1', probe: 2, expr: 'E(2, L) - E(1, L)' },
      { question: 'quantum-box:2', probe: 1, expr: 'E(1, 2 * L) / E(1, L)' },
      { question: 'quantum-box:4', probe: 4, expr: 'N - 1' },
    ],
  },
  'electro-nernst': {
    id: 'electro-nernst',
    title: '能斯特方程与化学平衡',
    description:
      '锌铜反应 Zn + Cu²⁺ → Zn²⁺ + Cu，298.15 K、n=2、E°=1.10 V。以浓度/c°近似活度，Q=c(Zn²⁺)/c(Cu²⁺)。调两种离子浓度，取样环沿电势直线移动；箭头显示相对 E° 的升降。本范围内 E 始终为正，不把 Q=1 当作平衡；不含内阻与过电势。',
    legend: '横轴 lg Q：−3–3；纵轴 E：1.00–1.20 V。冷色虚线为 E°=1.10 V，黄绿环为当前组成。',
    constants: { E0: 1.1, n: 2, coefficient: 0.05916, F: 96485 },
    functions: { E: [['q'], 'E0 - coefficient / n * q'], G: [['v'], '-n * F * v / 1000'] },
    controls: [
      { name: 'logZn', label: 'lg(c(Zn²⁺) / mol·L⁻¹)', min: -4, max: -1, step: 0.1, default: -1 },
      { name: 'logCu', label: 'lg(c(Cu²⁺) / mol·L⁻¹)', min: -4, max: -1, step: 0.1, default: -3 },
    ],
    view: { x: [-3, 3], y: [1, 1.2] },
    parts: [
      { part: 'axes', ticks: { x: 1, y: 0.05 } },
      { part: 'curve', var: 'q', fn: 'E(q)', from: -3, to: 3, segments: 72, color: 'ivory' },
      { part: 'hline', at: 'E0', dashes: 16, color: 'ice' },
      { part: 'vline', at: 'logZn - logCu', to: 'E(logZn - logCu)', dashes: 12, color: 'ice' },
      { part: 'arrow', from: ['logZn - logCu', 'E0'], to: ['logZn - logCu', 'E(logZn - logCu)'] },
      { part: 'point', x: 'logZn - logCu', y: 'E(logZn - logCu)', radius: 0.07 },
    ],
    readout:
      'c(Zn²⁺)={10^logZn|3} · c(Cu²⁺)={10^logCu|3} mol/L · Q={10^(logZn-logCu)|4} · E={E(logZn-logCu)|6} V · ΔG={G(E(logZn-logCu))|5} kJ/mol',
    checks: [
      { question: 'electro-nernst:0', probe: { logZn: -1, logCu: -3 }, expr: 'E(logZn-logCu)' },
      { question: 'electro-nernst:2', expr: 'G(1)' },
      { question: 'electro-nernst:4', expr: 'E(1)-E(0)' },
    ],
  },
};
