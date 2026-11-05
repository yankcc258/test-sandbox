// 观察模型的「配方」（露娜，2026-11-04）。一章一份，纯数据，积木和公式写法见 specimen-kit.js。
// 每份配方的 checks 会由 scripts/check-specimen-kit.mjs 拿这一章的原题答案核对：
//   question：原题 id；expr：用配方里的常数和公式算出来的值；probe：核对时滑杆停在哪里。
// 只核对数值题，单选、多选和填空不在这里。
// 电子排布的配方由下面这个小函数生成（露娜，v39）：8 个亚层 × 每个轨道一条横线和上下两支自旋箭头，
// 手写会有几十块重复的积木。生成出来的仍然是普通配方数据，检查方式和其他章一样。
// 亚层按填充顺序排：[名称, 容量, 之前已填的电子数, 显示高度, 轨道数]。
const SUBSHELLS = [
  ['1s', 2, 0, 0.6, 1],
  ['2s', 2, 2, 1.5, 1],
  ['2p', 6, 4, 2.1, 3],
  ['3s', 2, 10, 3.0, 1],
  ['3p', 6, 12, 3.6, 3],
  ['4s', 2, 18, 4.4, 1],
  ['3d', 10, 20, 4.95, 5],
  ['4p', 6, 30, 5.6, 3],
];
// 阳离子从这里先拿走电子：主量子数大的先拿（4p、4s 先于 3d），同层 l 大的先拿
const REMOVAL = ['4p', '4s', '3d', '3p', '3s', '2p', '2s', '1s'];
function electronRecipe() {
  const functions = {};
  const key = (name) => name.replace(/^(\d)([spd])$/, '$2$1'); // 2p → p2，变量名不能以数字开头
  for (const [name, cap, start] of SUBSHELLS) {
    const k = key(name);
    // 按构造原理（Aufbau）填 N 个电子
    functions[`A${k}`] = [['N'], `min(${cap}, max(0, N - ${start}))`];
    // 中性原子：Cr（24）和 Cu（29）是 4s¹ 的例外，多出的一个电子在 3d
    const adjust =
      name === '4s'
        ? ' - ((z == 24) + (z == 29))'
        : name === '3d'
          ? ' + ((z == 24) + (z == 29))'
          : '';
    functions[`N${k}`] = [['z'], `A${k}(z)${adjust}`];
  }
  for (const [name] of SUBSHELLS) {
    const k = key(name),
      before = REMOVAL.slice(0, REMOVAL.indexOf(name)).map((x) => `N${key(x)}(z)`);
    const taken = `min(N${k}(z), max(0, c - (${before.length ? before.join(' + ') : '0'})))`;
    // 阳离子：中性原子的排布再按顺序拿走电子；阴离子：按构造原理多填；中性：带例外的排布
    functions[`o${k}`] = [
      ['z', 'c'],
      `c > 0 ? N${k}(z) - ${taken} : (c < 0 ? A${k}(z - c) : N${k}(z))`,
    ];
  }
  const parts = [{ part: 'arrow', from: [0.07, 0.15], to: [0.07, 6.15], color: 'titanium' }];
  for (const [name, , , y, g] of SUBSHELLS) {
    const k = key(name),
      occ = `o${k}(Z, q)`;
    for (let j = 0; j < g; j++) {
      const x = +(0.55 + (j - (g - 1) / 2) * 0.13).toFixed(3);
      parts.push(
        {
          part: 'hline',
          at: y,
          from: x - 0.05,
          to: x + 0.05,
          color: 'titanium',
          highlight: `${occ} > 0`,
          highlightColor: 'ivory',
        },
        // 洪特规则：先每个轨道放一个自旋向上的，再从第一个轨道开始配对
        {
          part: 'arrow',
          show: `${occ} > ${j}`,
          from: [x - 0.018, y + 0.07],
          to: [x - 0.018, y + 0.42],
          color: 'lime',
        },
        {
          part: 'arrow',
          show: `${occ} > ${g + j}`,
          from: [x + 0.018, y + 0.42],
          to: [x + 0.018, y + 0.07],
          color: 'ice',
        },
      );
    }
  }
  return {
    id: 'inorganic-periodicity',
    title: '电子排布、离子与周期性',
    description:
      '从下往上是按填充顺序排的亚层：1s、2s、2p、3s、3p、4s、3d、4p（只到 Z=36）。每条短横线是一个轨道，黄绿箭头是自旋向上、冷色箭头是自旋向下；按洪特规则先单独占据再配对。中性原子按构造原理填，Cr、Cu 按实际的 4s¹ 排布；阳离子先拿走主量子数最大的电子（所以 Fe²⁺ 是 [Ar]3d⁶，4s 先空）；阴离子按构造原理多填。',
    legend:
      '纵向只表示填充顺序上的能量高低，不是按比例的能量；被占据的轨道横线变亮。读数里按亚层顺序列出电子数。',
    constants: {},
    functions,
    controls: [
      { name: 'Z', label: '原子序数 Z', min: 1, max: 36, step: 1, default: 26 },
      { name: 'q', label: '电荷数 q（正为阳离子）', min: -2, max: 3, step: 1, default: 2 },
    ],
    view: { x: [0, 1], y: [0, 6.3] },
    parts,
    readout:
      'Z={Z} · 电荷 {q} · 电子数 {max(0, Z - q)} · 1s{os1(Z, q)} 2s{os2(Z, q)} 2p{op2(Z, q)} 3s{os3(Z, q)} 3p{op3(Z, q)} 3d{od3(Z, q)} 4s{os4(Z, q)} 4p{op4(Z, q)}',
    checks: [{ question: 'inorganic-periodicity:0', probe: { Z: 26, q: 3 }, expr: 'Z - q' }],
  };
}
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
  'quantum-wave': {
    id: 'quantum-wave',
    title: '波函数与位置概率',
    description:
      'L=1 nm 的箱中定态，横轴 u=x/L。冷色曲线为缩放波函数 √Lψ，象牙白曲线为缩放密度 Lρ；黄绿薄片只覆盖 0≤u≤b。波函数可为负，密度始终非负；区间概率来自密度积分，不能把曲线高度当概率。薄片为中点近似，读数使用解析积分，不表示粒子轨迹。',
    legend:
      '横轴 u：0–1；纵轴同时画 √Lψ 与 Lρ（均无量纲，范围 −1.6–2.2）。细横线为零；黄绿环标记 b 处密度，短刻线标记内部节点。',
    constants: { L: 1 },
    functions: {
      psi: [['u'], 'sqrt(2) * sin(N * pi * u)'],
      rho: [['u'], 'psi(u)^2'],
      P: [['u'], 'u - sin(2*N*pi*u)/(2*N*pi)'],
      uniformProbability: [['density', 'length'], 'density * length'],
    },
    controls: [
      { name: 'N', label: '量子数 n', min: 1, max: 4, step: 1, default: 1 },
      { name: 'b', label: '积分上限 b（x/L）', min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
    view: { x: [0, 1], y: [-1.6, 2.2] },
    parts: [
      { part: 'axes', ticks: { x: 0.25, y: 0.5 } },
      { part: 'hline', at: 0, color: 'titanium', role: 'axis' },
      {
        part: 'bars',
        var: 'u',
        fn: 'rho(u)',
        from: 0,
        to: 1,
        count: 32,
        until: 'b',
        baseline: 0,
        fill: 0.86,
        color: 'lime',
        role: 'probability-area',
      },
      {
        part: 'curve',
        var: 'u',
        fn: 'psi(u)',
        from: 0,
        to: 1,
        segments: 72,
        color: 'ice',
        width: 0.022,
        role: 'wave-amplitude',
      },
      {
        part: 'curve',
        var: 'u',
        fn: 'rho(u)',
        from: 0,
        to: 1,
        segments: 72,
        color: 'ivory',
        width: 0.028,
        z: 0.18,
        role: 'probability-density',
      },
      { part: 'vline', at: 'b', from: 0, to: 'rho(b)', dashes: 8 },
      { part: 'point', x: 'b', y: 'rho(b)', radius: 0.05 },
      {
        part: 'vline',
        repeat: { var: 'j', from: 1, to: 3 },
        when: 'j < N',
        at: 'j/N',
        from: -0.08,
        to: 0.08,
        dashes: 1,
        color: 'ice',
      },
    ],
    readout:
      'n={N} · b={b} · P(0≤u≤b)={P(b)|5} · √Lψ(b)={abs(psi(b))<1e-12 ? 0 : psi(b)|4} · Lρ(b)={rho(b)<1e-12 ? 0 : rho(b)|4} · 全箱概率 {P(1)}',
    checks: [
      { question: 'quantum-wave:1', probe: { N: 1, b: 0.5 }, expr: 'P(b)' },
      { question: 'quantum-wave:2', expr: 'uniformProbability(0.25, 2)' },
      { question: 'quantum-wave:4', probe: { N: 1, b: 0.5 }, expr: 'rho(b)' },
    ],
  },
  'physical-gibbs': {
    id: 'physical-gibbs',
    title: '自由能、反应商与平衡：判断方向并求组成',
    description:
      '沿用原例的理想体系 A⇌B，恒温 298 K、总量 1 mol。横轴为 B 的摩尔分数 y，A=1−y、Q=y/(1−y)。象牙白曲线是相对纯 A 的体系 G，当前点的斜率对应 ΔᵣG；冷色环标记最低点 y=K/(1+K)。箭头指出降低 G 的组成方向，不模拟反应速率。K 滑杆比较同温度下不同标准反应自由能的理想体系；改变当前组成不会改变 K。',
    legend:
      '横轴 y：0–1；纵轴相对 G：−6–0.3 kJ（总量固定 1 mol）。黄绿环为当前组成，冷色环为平衡组成。G 的零点可选，最低点的 G 不必为零；平衡时为零的是 ΔᵣG。',
    constants: { R: 8.314, T: 298 },
    functions: {
      mix: [['y'], 'y == 0 ? 0 : y * ln(y)'],
      G: [['y'], 'R*T/1000 * (mix(y) + mix(1-y) - y*ln(K))'],
      Q: [['y'], 'y/(1-y)'],
      reactionG: [['y'], 'R*T/1000 * ln(Q(y)/K)'],
      standardG: [['k'], '-R*T/1000 * ln(k)'],
      equilibriumB: [['total'], 'total*K/(1+K)'],
    },
    controls: [
      { name: 'y', label: '当前 B 的摩尔分数 y', min: 0.01, max: 0.99, step: 0.01, default: 0.5 },
      { name: 'K', label: '平衡常数 K（同温度体系对比）', min: 1, max: 10, step: 0.25, default: 4 },
    ],
    view: { x: [0, 1], y: [-6, 0.3] },
    parts: [
      { part: 'axes', ticks: { x: 0.2, y: 1 } },
      { part: 'hline', at: 0, dashes: 16, color: 'titanium' },
      {
        part: 'curve',
        var: 'x',
        fn: 'G(x)',
        from: 0,
        to: 1,
        segments: 96,
        color: 'ivory',
        width: 0.03,
        role: 'gibbs-energy',
      },
      { part: 'vline', at: 'equilibriumB(1)', to: 'G(equilibriumB(1))', dashes: 10, color: 'ice' },
      { part: 'point', x: 'equilibriumB(1)', y: 'G(equilibriumB(1))', radius: 0.07, color: 'ice' },
      { part: 'vline', at: 'y', to: 'G(y)', dashes: 8, color: 'lime' },
      { part: 'point', x: 'y', y: 'G(y)', radius: 0.045 },
      {
        part: 'arrow',
        from: ['y', 'G(y)+0.3'],
        to: ['y + (equilibriumB(1)>y ? 1 : -1)*min(0.12, abs(equilibriumB(1)-y))', 'G(y)+0.3'],
      },
    ],
    readout:
      'A={1-y|3} mol · B={y|3} mol · Q={Q(y)|4} · K={K} · ΔᵣG={abs(reactionG(y))<1e-10 ? 0 : reactionG(y)|5} kJ/mol · ΔᵣG°={standardG(K)|5} kJ/mol · 平衡 B={equilibriumB(1)|4} mol',
    checks: [
      { question: 'physical-gibbs:1', probe: { K: 4 }, expr: 'equilibriumB(1)' },
      { question: 'physical-gibbs:2', probe: { K: 4 }, expr: 'equilibriumB(1.5)' },
      { question: 'physical-gibbs:3', probe: { K: 10 }, expr: 'standardG(K)' },
    ],
  },
  // ---------- 露娜 v39：浓度、原电池与电解、电子排布、受力与功 ----------
  chem: {
    id: 'chem',
    title: '从粒子到物质的量浓度',
    description:
      'c=n/V：溶质的物质的量除以溶液的体积（定容后的总体积，不是加了多少水）。左边量杯里每个小方块代表 1 mmol NaCl（化学式单元），液面高度就是溶液体积；右边的柱子是浓度。只加水稀释时，粒子数不变、液面升高、柱子降低。M(NaCl)=58.44 g/mol，例题：250.0 mL、0.100 mol/L 需要 1.461 g。',
    legend: '量杯刻度每格 0.1 L（满 0.5 L）；每个小方块 = 1 mmol。浓度柱满格 2 mol/L。',
    constants: { M: 58.44, unit: 0.001, cmax: 2 },
    functions: { c: [['a', 'b'], 'a / b'], top: [['b'], '0.05 + b / 0.5 * 0.9'] },
    controls: [
      { name: 'n', label: '溶质 n（mol）', min: 0.005, max: 0.1, step: 0.005, default: 0.025 },
      { name: 'V', label: '溶液体积 V（L）', min: 0.05, max: 0.5, step: 0.05, default: 0.25 },
    ],
    view: { x: [0, 1], y: [0, 1.1] },
    parts: [
      { part: 'segment', from: [0.1, 0.03], to: [0.1, 1.02] },
      { part: 'segment', from: [0.64, 0.03], to: [0.64, 1.02] },
      { part: 'segment', from: [0.1, 0.03], to: [0.64, 0.03] },
      {
        part: 'segment',
        repeat: { var: 'i', from: 1, to: 5 },
        from: [0.1, '0.05 + i * 0.18'],
        to: [0.15, '0.05 + i * 0.18'],
        width: 0.01,
        color: 'ceramic',
      },
      { part: 'hline', at: 'top(V)', from: 0.1, to: 0.64, color: 'ice' },
      {
        part: 'particles',
        count: 'n / unit',
        max: 100,
        region: { x: [0.12, 0.62], y: [0.05, 'top(V)'] },
      },
      { part: 'segment', from: [0.75, 0.03], to: [0.75, 1.02] },
      { part: 'segment', from: [0.89, 0.03], to: [0.89, 1.02] },
      { part: 'segment', from: [0.75, 0.03], to: [0.89, 0.03] },
      {
        part: 'bars',
        var: 'x',
        fn: '0.05 + min(c(n, V), cmax) / cmax * 0.95',
        from: 0.76,
        to: 0.88,
        count: 1,
        baseline: 0.05,
        color: 'lime',
        fill: 0.9,
      },
      {
        part: 'segment',
        repeat: { var: 'j', from: 1, to: 4 },
        from: [0.89, '0.05 + j / 4 * 0.95'],
        to: [0.93, '0.05 + j / 4 * 0.95'],
        width: 0.01,
        color: 'ceramic',
      },
    ],
    readout:
      'n={n|3} mol · V={V|3} L · c={c(n, V)|3} mol/L · NaCl {n * M|4} g · {round(n / unit)} 粒（1 粒 = 1 mmol）',
    checks: [
      { question: 'chem:1', expr: '5.844 / M' },
      { question: 'chem:2', expr: 'c(0.05, 0.25)' },
    ],
  },
  'electro-cell': {
    id: 'electro-cell',
    title: '氧化还原、原电池与电解',
    description:
      '原电池：锌为阳极（氧化、负极），铜为阴极（还原、正极），E°cell=E°cathode−E°anode=0.34−(−0.76)=1.10 V；电子经导线从锌流到铜，盐桥里是离子迁移。图上画的是另一件事：理想电解沉积铜，Q=It，每 mol Cu 需要 2 mol 电子，m=ItM/(2F)。拖动电流和时间，薄片是到当前时刻为止已经沉积的铜。',
    legend:
      '横轴 t：0–3600 s；纵轴沉积铜质量：0–3.6 g。每片薄片 5 分钟。假定 100% 电流效率、铜离子充足；不由原电池电势推算电流。',
    constants: { F: 96485, MCu: 63.546, Ecat: 0.34, Ean: -0.76 },
    functions: { mass: [['i', 'u'], 'i * u / (2 * F) * MCu'] },
    controls: [
      { name: 'I', label: '电流 I（A）', min: 0.1, max: 3, step: 0.1, default: 1 },
      { name: 't', label: '时间 t（s）', min: 0, max: 3600, step: 10, default: 1930 },
    ],
    view: { x: [0, 3600], y: [0, 3.6] },
    parts: [
      { part: 'axes', ticks: { x: 600, y: 0.5 } },
      {
        part: 'bars',
        var: 'u',
        fn: 'mass(I, u)',
        from: 0,
        to: 3600,
        count: 12,
        until: 't',
        baseline: 0,
      },
      {
        part: 'curve',
        var: 'u',
        fn: 'mass(I, u)',
        from: 0,
        to: 3600,
        segments: 60,
        color: 'ivory',
      },
      { part: 'vline', at: 't', from: 0, to: 'mass(I, t)', dashes: 10, color: 'ice' },
      { part: 'point', x: 't', y: 'mass(I, t)', radius: 0.06 },
    ],
    readout:
      'I={I|2} A · t={t} s · Q={I * t|5} C · n(e⁻)={I * t / F|4} mol · n(Cu)={I * t / (2 * F)|4} mol · m={mass(I, t)|4} g · 锌铜电池 E°={Ecat - Ean|3} V',
    checks: [
      { question: 'electro-cell:1', expr: 'Ecat - Ean' },
      { question: 'electro-cell:2', expr: '192970 / (2 * F)' },
      { question: 'electro-cell:4', probe: { I: 1, t: 1000 }, expr: 'I * t' },
    ],
  },
  'inorganic-periodicity': electronRecipe(),
  'physics-energy': {
    id: 'physics-energy',
    title: '受力、功与能量：从模型到计算',
    description:
      '例题：2 kg 物块从静止出发，水平拉力 F，滑动摩擦恒为 2 N。上方是物块和两个力（箭头长短按力的大小）；下方三条线：拉力做的功 W拉=Fs、摩擦做的功 W摩=−fs（负）、动能变化 ΔK=W合=(F−f)s。动能来自拉力做的功减去摩擦耗掉的部分，不是全部拉力功。F≤2 N 时按物块不动处理。',
    legend:
      '横轴：位移 s，0–8 m；纵轴：能量（J）。象牙曲线 W拉，冷色曲线和薄片 W摩（负），黄绿曲线和薄片 ΔK；薄片画到当前位置。',
    constants: { m: 2, f: 2 },
    functions: {
      K: [['x'], 'F > f ? (F - f) * x : 0'],
      v: [['x'], 'sqrt(2 * K(x) / m)'],
    },
    controls: [
      { name: 'F', label: '拉力 F（N）', min: 1, max: 10, step: 0.5, default: 6 },
      { name: 's', label: '位移 s（m）', min: 0, max: 8, step: 0.1, default: 4 },
    ],
    view: { x: [-0.5, 8.5], y: [-25, 100] },
    parts: [
      { part: 'axes', ticks: { x: 1, y: 25 } },
      { part: 'hline', at: 0, from: 0, to: 8, color: 'ceramic' },
      {
        part: 'bars',
        var: 'x',
        fn: 'K(x)',
        from: 0,
        to: 8,
        count: 16,
        until: 's',
        baseline: 0,
        color: 'lime',
        fill: 0.7,
      },
      {
        part: 'bars',
        var: 'x',
        fn: '-f * x',
        from: 0,
        to: 8,
        count: 16,
        until: 's',
        baseline: 0,
        color: 'ice',
        fill: 0.7,
      },
      { part: 'curve', var: 'x', fn: 'F * x', from: 0, to: 8, segments: 32, color: 'ivory' },
      {
        part: 'curve',
        var: 'x',
        fn: 'K(x)',
        from: 0,
        to: 8,
        segments: 32,
        color: 'lime',
        width: 0.024,
      },
      {
        part: 'curve',
        var: 'x',
        fn: '-f * x',
        from: 0,
        to: 8,
        segments: 32,
        color: 'ice',
        width: 0.024,
      },
      { part: 'point', x: 's', y: 'K(s)', radius: 0.05 },
      { part: 'segment', from: [0, 79], to: [8.4, 79], color: 'ceramic' },
      { part: 'block', x: 's', y: 86, w: 0.8, h: 13 },
      { part: 'arrow', from: ['s + 0.42', 86], to: ['s + 0.42 + F * 0.14', 86], color: 'lime' },
      {
        part: 'arrow',
        show: 'F > f',
        from: ['s - 0.42', 86],
        to: ['s - 0.42 - f * 0.14', 86],
        color: 'ice',
      },
    ],
    readout:
      'F={F} N · f=2 N · m=2 kg · a={F > f ? (F - f) / m : 0|3} m/s² · 到 s={s} m：W拉={F * s|4} J · W摩={-f * s|4} J · ΔK={K(s)|4} J · v={v(s)|3} m/s',
    checks: [
      { question: 'physics-energy:0', probe: { F: 6 }, expr: '(F - f) / m' },
      { question: 'physics-energy:1', expr: '-f * 4' },
      { question: 'physics-energy:2', probe: { F: 6 }, expr: 'v(4)' },
      { question: 'physics-energy:3', expr: '0.5 * m * 4^2 / f' },
    ],
  },
};
