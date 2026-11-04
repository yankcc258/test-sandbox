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
      '电子在 L=1 nm 的箱中，Eₙ=E₁n²，E₁≈0.376 eV。两侧是箱壁，横条是 n=1–5 的能级，黄绿是当前 n；能级上的曲线是 ψₙ=sin(nπx/L)，内部节点 n−1 个，用短竖线标出。拖动 n：能级间隔越来越大，不是等间距。',
    constants: { E11: 0.376, L: 1 },
    functions: { E: [['n', 'w'], 'E11 * n^2 / w^2'] },
    probe: { name: 'N', label: '量子数 n', min: 1, max: 5, step: 1, default: 2 },
    view: { x: [-0.12, 1.12], y: [0, 10] },
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
      'n={N} · Eₙ={E(N, L)|4} eV · Eₙ/E₁={N^2} · 内部节点 {N - 1} 个 · 到下一级 {E(N + 1, L) - E(N, L)|4} eV',
    checks: [
      { question: 'quantum-box:0', probe: 3, expr: 'E(3, L) / E(1, L)' },
      { question: 'quantum-box:1', probe: 2, expr: 'E(2, L) - E(1, L)' },
      { question: 'quantum-box:2', probe: 1, expr: 'E(1, 2 * L) / E(1, L)' },
      { question: 'quantum-box:4', probe: 4, expr: 'N - 1' },
    ],
  },
};
