// Pinned, read-only course snapshot from the main site. No account, API, or storage.
// Original prose and question order are preserved; reading-note is the sole editorial addition.
export const COURSE = {
  id: 'math-partials',
  title: '偏导数与全微分：为热力学建立语言',
  subtitle: '区分固定变量、沿路径变化和有限改变量，连接多元函数与状态方程。',
  subject: '数学',
  duration: 35,
  source: {
    commit: '05be1e3f63e4a81f3e4b52ca37c06d43aeb38b4c',
    path: 'src/foundation-chapters.js',
    url: 'https://github.com/yankcc258/yank-study-lab/blob/05be1e3f63e4a81f3e4b52ca37c06d43aeb38b4c/src/foundation-chapters.js',
  },
  reference:
    'https://openstax.org/books/calculus-volume-3/pages/4-4-tangent-planes-and-linear-approximations',
  prerequisites: [
    '导数：x² 的导数为 2x；求导前先确定自变量。',
    '多元函数：f(x,y) 的值同时取决于 x 与 y。',
  ],
  prerequisiteIds: ['math'],
  goal: '计算偏导和全微分，用一阶近似估算变化，并通过精确值判断近似误差。',
  terms: [
    ['偏导数', '偏導関数', 'partial derivative'],
    ['全微分', '全微分', 'total differential'],
    ['状态方程', '状態方程式', 'equation of state'],
  ],
  precheck: {
    prompt: 'f(x)=x²，在 x=2 处 f′(x) 等于多少？',
    answer: '4',
  },
  sections: [
    {
      id: 'prerequisites',
      title: '学习目标与先修',
      html: '<h3>本章目标</h3><p>计算偏导和全微分，用一阶近似估算变化，并通过精确值判断近似误差。</p><h3>先修知识</h3><ul><li>导数：x² 的导数为 2x；求导前先确定自变量。</li><li>多元函数：f(x,y) 的值同时取决于 x 与 y。</li></ul><h3>先修检查</h3><p>f(x)=x²，在 x=2 处 f′(x) 等于多少？</p><details><summary>查看答案</summary><p>4</p></details>',
    },
    {
      id: 'concept',
      title: '偏导与全微分',
      html: '<p>气体压强随温度和体积同时变化。“升温时压强怎么变”必须先说明体积是否固定。偏导下标就在记录这个条件。</p><p>偏导数是在其他独立变量固定时对一个变量求导。可微函数的全微分描述局部线性变化；有限改变量 Δf 通常还包含高阶项。</p><p class="formula">df = (∂f/∂x)ᵧ dx + (∂f/∂y)ₓ dy</p><p>练习中的 x、y 无量纲。应用于 P=nRT/V 时，n 固定，T 用 K、V 用 m³，R=8.314 J/(mol·K)，P 用 Pa。</p>',
    },
    {
      id: 'steps',
      title: '逐步推导',
      html: '<ol><li>取 f=x²y。求 (∂f/∂x)ᵧ 时把 y 当常数，得到 2xy。</li><li>求 (∂f/∂y)ₓ 时把 x² 当常数，得到 x²。于是 df=2xy dx+x² dy。</li><li>有限变化很小时使用 Δf≈df；两者并不一般相等。沿路径 y=y(x) 时，df/dx=2xy+x²dy/dx，不能忘记 y 也在变化。</li><li>固定 n 的理想气体有 dP=(nR/V)dT−(nRT/V²)dV。固定 V 时只剩第一项；固定 T 时只剩第二项。每项都必须具有压强单位。</li></ol>',
    },
    {
      id: 'example',
      title: '例题：一阶估计与精确变化',
      html: '<ol><li>f=x²y，从 (2,3) 变到 (2.1,2.8)：dx=0.1，dy=−0.2。</li><li>原点处 ∂f/∂x=12，∂f/∂y=4；df=12×0.1+4×(−0.2)=0.4。</li><li>精确变化为 Δf=2.1²×2.8−2²×3=0.348；一阶估计高了 0.052。</li><li>差别来自被省略的高阶项；不是把偏导计算错了。缩小步长，再检查误差是否缩小。</li></ol><p class="reading-note">阅读注：这里的“原点处”指本例起始点 (2,3)，并非坐标原点。</p>',
    },
    {
      id: 'extension',
      title: '理解与路径拓展',
      html: '<h3>从基础理解</h3><p>一次只让一个输入变化，得到偏导；把不同输入的一阶影响相加，得到全微分。</p><h3>沿路径变化</h3><p>沿 y=x，f=x³，所以 df/dx=3x²。用链式法则也得到 2x·x+x²·1=3x²；仅用偏导会漏掉一项。</p>',
    },
    {
      id: 'review',
      title: '易错点与小结',
      html: '<h3>易错点</h3><p>Δf 是两个状态的精确差，df 是微分；不能把“偏导时固定 y”误解为“沿所有路径 y 都固定”。</p><h3>本章小结</h3><p>写清固定变量 → 求各偏导 → 代入同一展开点 → 估算变化 → 检查近似。</p><h3>观察与练习</h3><p>独立算一遍例题；再把 dx、dy 同时减半，比较一阶估计与精确变化。</p>',
    },
    {
      id: 'terms',
      title: '术语对照',
      html: '<table class="course-terms"><thead><tr><th scope="col">中文</th><th scope="col">日文</th><th scope="col">英文</th></tr></thead><tbody><tr><td>偏导数</td><td>偏導関数</td><td>partial derivative</td></tr><tr><td>全微分</td><td>全微分</td><td>total differential</td></tr><tr><td>状态方程</td><td>状態方程式</td><td>equation of state</td></tr></tbody></table>',
    },
    {
      id: 'references',
      title: '来源与范本说明',
      html: '<p>本章正文与五道题保留自主站同名课程。本页为沙盒范本，练习结果仅保留在当前页面，不写入正式学习记录。</p><p><a href="https://openstax.org/books/calculus-volume-3/pages/4-4-tangent-planes-and-linear-approximations" target="_blank" rel="noopener noreferrer">原课程参考：OpenStax · Tangent Planes and Linear Approximations</a></p><p><a href="https://github.com/yankcc258/yank-study-lab/blob/05be1e3f63e4a81f3e4b52ca37c06d43aeb38b4c/src/foundation-chapters.js" target="_blank" rel="noopener noreferrer">查看主站课程来源 · 05be1e3</a></p>',
    },
  ],
  questions: [
    {
      id: 'math-partials:0',
      index: 0,
      type: 'number',
      prompt: 'f=x²y，在 (2,3) 处，固定 y 的偏导数是多少？',
      answer: 12,
      explanation: '∂f/∂x=2xy=12。',
      hints: ['把 y 当常数。', '先求导再代入。'],
      unit: '',
      skill: '偏导计算',
      reinforce: '不看解析，说明你使用的关系、适用条件和结果的检查方法。',
      reinforceAnswer: '∂f/∂x=2xy=12。',
    },
    {
      id: 'math-partials:1',
      index: 1,
      type: 'number',
      prompt: '同一函数从 (2,3) 出发，dx=0.1、dy=−0.2，df 是多少？',
      answer: 0.4,
      explanation: 'df=12×0.1+4×(−0.2)=0.4。',
      hints: ['两个输入的贡献相加。', 'y 的变化为负。'],
      unit: '',
      skill: '一阶估计',
      reinforce: '不看解析，说明你使用的关系、适用条件和结果的检查方法。',
      reinforceAnswer: 'df=12×0.1+4×(−0.2)=0.4。',
    },
    {
      id: 'math-partials:2',
      index: 2,
      type: 'number',
      prompt: 'f=x²y，从 (2,3) 到 (2.1,2.8)，精确的 Δf 是多少？',
      answer: 0.348,
      explanation: 'Δf=2.1²×2.8−12=0.348，不是微分估计 0.4。',
      hints: ['分别计算终态与初态函数值。', '不要用一阶估计代替精确差值。'],
      unit: '',
      skill: '检验近似',
      reinforce: '不看解析，说明你使用的关系、适用条件和结果的检查方法。',
      reinforceAnswer: 'Δf=2.1²×2.8−12=0.348，不是微分估计 0.4。',
    },
    {
      id: 'math-partials:3',
      index: 3,
      type: 'number',
      prompt: '沿路径 y=x，f=x²y 在 x=2 处的全导数 df/dx 是多少？',
      answer: 12,
      explanation: '沿路径 f=x³，导数为 3x²=12；链式法则给出相同结果。',
      hints: ['y 也随 x 改变。', '先代入路径，再求导。'],
      unit: '',
      skill: '路径上的变化',
      reinforce: '不看解析，说明你使用的关系、适用条件和结果的检查方法。',
      reinforceAnswer: '沿路径 f=x³，导数为 3x²=12；链式法则给出相同结果。',
    },
    {
      id: 'math-partials:4',
      index: 4,
      type: 'multi',
      prompt: '对固定物质的量的理想气体，哪些结论正确？',
      choices: [
        '定容升温时压强增大',
        '定温膨胀时压强减小',
        '任何有限变化都满足 ΔP=dP',
        '求 (∂P/∂T)ᵥ 时应把 V 当作 T 的函数求导',
      ],
      answer: [0, 1],
      explanation: '(∂P/∂T)ᵥ=nR/V>0。 (∂P/∂V)ₜ=−nRT/V²<0。',
      choiceExplanations: [
        '(∂P/∂T)ᵥ=nR/V>0。',
        '(∂P/∂V)ₜ=−nRT/V²<0。',
        '微分用于局部线性变化，有限变化一般存在高阶项。',
        '下标 V 表示体积固定。',
      ],
      hints: ['先写出适用条件，再逐项检查。', '把结论与本节的定义或守恒关系对照。'],
      unit: '',
      skill: '数学迁移到状态方程',
      reinforce: '逐项指出错误选项错在哪里，并说明正确判断的依据。',
      reinforceAnswer:
        '(∂P/∂T)ᵥ=nR/V>0。 (∂P/∂V)ₜ=−nRT/V²<0。 微分用于局部线性变化，有限变化一般存在高阶项。 下标 V 表示体积固定。',
    },
  ],
};

export const MATH_CATALOG = [
  {
    id: 'math',
    title: '导数与切线斜率',
    available: false,
  },
  {
    id: 'math-integral',
    title: '定积分：从小片累积到总量',
    available: false,
  },
  {
    id: 'math-explog',
    title: '指数、对数与链式法则',
    available: false,
  },
  {
    id: 'math-partials',
    title: '偏导数与全微分：为热力学建立语言',
    available: true,
  },
  {
    id: 'math-complex',
    title: '复数、模平方与概率归一化',
    available: false,
  },
];

// Pure grading for this chapter's original four number questions and one
// multiple-choice question. The numeric tolerance matches the main site's
// grade(): max(1e-6, abs(answer) * 0.005). Nothing is recorded here.
export function gradeAnswer(question, input) {
  const invalid = (reason) => ({ status: 'invalid', correct: false, reason });
  if (!question || !COURSE.questions.includes(question)) return invalid('找不到本章题目。');

  if (question.type === 'number') {
    if (typeof input !== 'string' && typeof input !== 'number')
      return invalid('请输入普通小数或科学计数法数值。');
    const text = String(input)
      .trim()
      .replace(/[−﹣－]/g, '-');
    if (!text) return invalid('请先填写答案。');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text))
      return invalid('请输入普通小数或科学计数法数值，例如 0.4 或 4e-1。');
    const value = Number(text);
    if (!Number.isFinite(value)) return invalid('数值超出可计算范围。');
    const tolerance = Math.max(1e-6, Math.abs(question.answer) * 0.005);
    const correct = Math.abs(value - question.answer) <= tolerance + Number.EPSILON;
    return {
      status: correct ? 'correct' : 'wrong',
      correct,
      reason: correct
        ? '数值在允许误差内。'
        : '数值超出允许误差。检查公式与代入顺序，具体思路见下方解析。',
    };
  }

  if (question.type === 'multi' || question.type === 'single') {
    if (!Array.isArray(input) || !input.length) return invalid('请先选择答案。');
    if (
      input.some(
        (choice) => !Number.isInteger(choice) || choice < 0 || choice >= question.choices.length,
      )
    )
      return invalid('选项无效，请重新选择。');
    const selected = [...new Set(input)];
    if (question.type === 'single' && selected.length !== 1)
      return invalid('这道题只需选择一个选项。');
    const yes = selected.filter((choice) => question.answer.includes(choice)).length;
    const bad = selected.length - yes;
    const correct = yes === question.answer.length && bad === 0;
    return {
      status: correct ? 'correct' : yes && !bad ? 'partial' : 'wrong',
      correct,
      reason: correct
        ? '选择与规则答案一致。'
        : yes && !bad
          ? '已选选项正确，但遗漏了其他正确选项。'
          : '包含不成立的选项，请结合下方逐项分析。',
    };
  }
  return invalid('此题型暂不支持判定。');
}
