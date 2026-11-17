// 样稿用的示例数据：不是 Yank 真的学习记录。形状照正式站：
//   星   { id, title, aliases, region, seed, links: [{ to, why, by }], by, createdAt }（/api/stars）
//   另外带上画亮度要用的：explains（挂着的讲解）、takes（理解记录）、cardsStable、wrong（错题数）。
// 每颗星的 gist 是起点的第一句话。只有「导数」写了完整的起点、讲解和两次理解记录，用来看星的页面长什么样。

const T0 = Date.UTC(2026, 10, 11, 3); // 2026-11-11 12:00 东京
const DAY = 86400000;

// [名字, 板块, 起点第一句, { 讲解条数, 每次讲给她听的分数, 问答卡稳了, 错题数, 谁开的, 连线 [指向谁, 为什么, 谁连的] }]
const RAW = [
  [
    '导数',
    '数学 · 微积分',
    '函数在一点的瞬时变化率：割线斜率在两点靠拢时的极限。',
    { explains: 4, scores: [2, 4], by: 'yank', aliases: ['求导', '微商'] },
  ],
  [
    '切线与割线',
    '数学 · 微积分',
    '割线过曲线上两点；两点靠拢到重合时，割线的极限位置就是切线。',
    { explains: 2, links: [['导数', '推导导数时引出']] },
  ],
  [
    '极限',
    '数学 · 微积分',
    '自变量趋近某个值时，函数值无限接近的那个数。',
    { explains: 2, scores: [3], links: [['导数', '定义导数时用到']] },
  ],
  [
    '牛顿第二定律',
    '经典物理',
    '物体的加速度与合力成正比、与质量成反比：F = ma。',
    {
      explains: 3,
      scores: [4, 5],
      stable: true,
      by: 'yank',
      links: [['导数', 'Yank 把加速度和导数连在一起讲']],
    },
  ],
  [
    '链式法则',
    '数学 · 微积分',
    '复合函数的导数等于外层的导数乘内层的导数。',
    { explains: 2, scores: [4], stable: true, links: [['导数', '问复合函数怎么求导时引出']] },
  ],
  [
    '吉布斯自由能',
    '物理化学',
    'G = H − TS；恒温恒压下 ΔG < 0 的过程能自发进行。',
    { explains: 5, scores: [2, 3, 4], by: 'yank' },
  ],
  [
    '定积分',
    '数学 · 微积分',
    '把区间切成小片、每片的面积相加，切得无限细时的极限。',
    { explains: 3, scores: [3, 5], by: 'yank' },
  ],
  [
    '熵',
    '物理化学',
    '体系微观状态数的度量：S = k ln W。',
    { explains: 2, scores: [3], links: [['吉布斯自由能', '问 TS 这一项是什么时引出']] },
  ],
  [
    'SN2 反应',
    '有机化学',
    '亲核试剂从离去基团的背面进攻，一步完成，碳的构型翻转。',
    { explains: 4, scores: [3, 3], wrong: 2, by: 'yank' },
  ],
  [
    '微积分基本定理',
    '数学 · 微积分',
    '定积分等于原函数在区间两端的差；求导和积分互为逆运算。',
    {
      explains: 2,
      scores: [2],
      wrong: 1,
      links: [
        ['定积分', '问定积分怎么算时引出'],
        ['导数', 'Yank 把这两个连在一起讲'],
      ],
    },
  ],
  [
    '电子排布',
    '无机化学',
    '电子按能量从低到高填入轨道，写成 1s² 2s² 2p⁶ … 的样子。',
    { explains: 3, scores: [4], by: 'yank' },
  ],
  [
    '亲核试剂',
    '有机化学',
    '带孤对电子或负电荷、去进攻缺电子的碳的物种。',
    { explains: 2, links: [['SN2 反应', '讲 SN2 的机理时引出']] },
  ],
  [
    '平衡常数',
    '物理化学',
    '平衡时生成物与反应物的活度按计量数取幂后的比；ΔG° = −RT ln K。',
    {
      explains: 3,
      scores: [4],
      stable: true,
      links: [['吉布斯自由能', '问 ΔG 和反应能走多远的关系时引出']],
    },
  ],
  [
    '洪特规则',
    '无机化学',
    '能量相同的轨道先各填一个电子、自旋相同，填满一轮再配对。',
    { explains: 1, scores: [5], stable: true, links: [['电子排布', '排 2p 轨道时引出']] },
  ],
  [
    '动量',
    '经典物理',
    '质量乘速度；合外力为零时，系统的总动量不变。',
    { explains: 2, scores: [4], links: [['牛顿第二定律', '把 F = ma 写成动量的变化率时引出']] },
  ],
  [
    'e 与自然对数',
    '数学 · 微积分',
    'e 是让 eˣ 的导数等于它自己的那个底数；ln 是 eˣ 的反函数。',
    {
      explains: 2,
      scores: [4],
      links: [
        ['导数', '问 eˣ 的导数为什么是它自己时引出'],
        ['平衡常数', '问 ln K 里的 ln 从哪来时引出'],
      ],
    },
  ],
  [
    '手性',
    '有机化学',
    '分子和它的镜像不能重合。',
    { explains: 2, scores: [4], links: [['SN2 反应', '讲构型翻转时引出']] },
  ],
  [
    '简谐振动',
    '经典物理',
    '回复力与位移成正比、方向相反时的往复运动。',
    {
      explains: 2,
      scores: [2],
      wrong: 1,
      links: [['牛顿第二定律', '用 F = ma 列弹簧振子的方程时引出']],
    },
  ],
  [
    '向量',
    '数学 · 线性代数',
    '有大小和方向的量；可以相加，也可以乘一个数。',
    { explains: 2, by: 'yank' },
  ],
  [
    '能斯特方程',
    '物理化学',
    'E = E° − (RT/nF) ln Q：电极电势随浓度变化。',
    {
      explains: 3,
      wrong: 1,
      links: [
        ['吉布斯自由能', '从 ΔG = −nFE 推出来时引出'],
        ['平衡常数', 'Yank 把 Q 和 K 连在一起讲'],
      ],
    },
  ],
  [
    '复数',
    '数学 · 其他',
    '形如 a + bi 的数，i² = −1；可以看成平面上的一个点。',
    { explains: 2, scores: [3], by: 'yank' },
  ],
  [
    '功与动能',
    '经典物理',
    '合力对物体做的功等于它动能的变化。',
    {
      explains: 1,
      links: [
        ['牛顿第二定律', '沿路径把 F = ma 积起来时引出'],
        ['定积分', '变力做功要用积分'],
      ],
    },
  ],
  [
    '偏导数',
    '数学 · 微积分',
    '多元函数只让一个自变量变、其余的固定时的变化率。',
    { explains: 1, links: [['导数', '从一元推广到多元时引出']] },
  ],
  [
    '电负性',
    '无机化学',
    '原子在化学键里吸引共用电子的能力。',
    { explains: 1, links: [['电子排布', '问为什么氟最能拉电子时引出']] },
  ],
  [
    '一维势阱',
    '物理化学',
    '粒子被关在一段区间里，能量只能取一级一级分开的值。',
    { explains: 2, scores: [3], by: 'yank' },
  ],
  [
    '离去基团',
    '有机化学',
    '带着一对成键电子离开的基团；离开以后越稳定，越容易走。',
    { links: [['SN2 反应', '讲 SN2 的机理时引出']] },
  ],
  [
    '矩阵乘法',
    '数学 · 线性代数',
    '把一个线性变换接在另一个后面；一般不能交换顺序。',
    { links: [['向量', '问矩阵对向量做了什么时引出']] },
  ],
  [
    '化学势',
    '物理化学',
    '恒温恒压下多加一摩尔某种组分，体系吉布斯自由能的变化。',
    {
      links: [
        ['吉布斯自由能', '讲混合物的自由能时引出'],
        ['偏导数', '化学势是 G 对物质的量的偏导数'],
      ],
    },
  ],
  [
    '库仑定律',
    '经典物理',
    '两个点电荷之间的力与电荷量的乘积成正比，与距离的平方成反比。',
    { by: 'yank' },
  ],
  [
    '欧拉公式',
    '数学 · 其他',
    'e^{iθ} = cos θ + i sin θ。',
    {
      explains: 1,
      links: [
        ['复数', '问复数的指数形式时引出'],
        ['e 与自然对数', 'Yank 连的', 'yank'],
      ],
    },
  ],
  [
    '泰勒展开',
    '数学 · 微积分',
    '用一点处的各阶导数拼出一个多项式，在这点附近逼近原来的函数。',
    { links: [['导数', '问高阶导数有什么用时引出']] },
  ],
  [
    '晶格能',
    '无机化学',
    '气态离子结合成一摩尔离子晶体时放出的能量。',
    { links: [['库仑定律', '解释晶格能为什么有大有小时引出']] },
  ],
  [
    '波函数',
    '物理化学',
    '它的模的平方给出在某处找到粒子的概率密度。',
    { links: [['一维势阱', '解势阱里的薛定谔方程时引出']] },
  ],
  [
    '电势',
    '经典物理',
    '电荷在电场中某点的电势能与它的电荷量之比。',
    { links: [['库仑定律', '问把电荷搬过来要做多少功时引出']] },
  ],
  [
    '行列式',
    '数学 · 线性代数',
    '线性变换把面积（或体积）放大的倍数，带正负号。',
    { links: [['矩阵乘法', '问矩阵能不能求逆时引出']] },
  ],
  ['共振', '有机化学', '一个结构式画不全时，用几个极限式一起表示真实的电子分布。', { by: 'yank' }],
];

const bornAt = (i) => Math.round(T0 + i * DAY * 2.3);
const idOf = (i) => 's-' + String(bornAt(i) + i * 4321).padStart(13, '0');
const ids = new Map(RAW.map(([title], i) => [title, idOf(i)]));

// 「导数」的完整内容：起点（积木）、挂着的讲解、两次理解记录和对比。
const DERIVATIVE = {
  seed: [
    {
      type: 'text',
      md: '函数在一点的**瞬时变化率**。取曲线上两点连一条割线，让两点靠拢，割线斜率的极限就是这一点的导数，也就是切线的斜率。',
    },
    {
      type: 'formula',
      id: 'derivative',
      where: [
        { sym: 'h', mean: '自变量的改变量' },
        { sym: 'f(x+h) − f(x)', mean: '函数值的改变量' },
      ],
    },
    {
      type: 'plot',
      id: 'parabola',
      note: 'y = x²。灰线是过 x = 1 和 x = 2 的割线，亮线是 x = 1 处的切线，斜率 2。',
    },
  ],
  explains: [
    { title: '为什么要取极限，不能直接让 h = 0', at: T0 + DAY * 0.4 },
    { title: '切线斜率和瞬时速度是不是一回事', at: T0 + DAY * 0.4 },
    { title: '幂函数的求导公式怎么推出来', at: T0 + DAY * 3 },
    { title: '导数等于 0 的点一定是最高点或最低点吗', at: T0 + DAY * 6 },
  ],
  takes: [
    {
      at: T0 + DAY * 1,
      score: 2,
      said: '导数就是斜率，Δy 除以 Δx。算的时候把 x 的次数拿下来乘到前面，次数再减一。',
      comment: '公式背下来了，意思没讲出来。',
      points: [
        { kind: 'right', text: '幂函数的求导法则记对了。' },
        {
          kind: 'wrong',
          text: '「Δy 除以 Δx」是割线的斜率，不是导数。导数是它在 Δx 趋于 0 时的极限。',
        },
        { kind: 'vague', text: '「就是斜率」没说是哪条线、在哪一点的斜率。' },
        { kind: 'missing', text: '没提极限，也没提瞬时变化率。' },
      ],
    },
    {
      at: T0 + DAY * 7,
      score: 4,
      said: '导数是函数在一点上的瞬时变化率。先在曲线上取两点连割线，斜率是 Δy/Δx；让两点靠拢，割线斜率的极限就是切线的斜率，这个极限就是导数。',
      comment: '这次讲到了极限，割线和切线也分清了。',
      points: [
        { kind: 'right', text: '说出了「瞬时变化率」和「割线斜率的极限」。' },
        { kind: 'right', text: '割线到切线的过程讲对了。' },
        { kind: 'vague', text: '没说这个极限什么时候不存在（比如尖点）。' },
      ],
      compare: {
        fixed: ['不再把 Δy/Δx 直接当成导数'],
        better: ['讲出了极限', '分清了割线和切线'],
        forgot: ['幂函数的求导法则这次没提'],
        still: [],
      },
    },
  ],
};

export const STARS = RAW.map(([title, region, gist, o = {}], i) => {
  const full = title === '导数' ? DERIVATIVE : null,
    createdAt = bornAt(i);
  return {
    id: ids.get(title),
    title,
    aliases: o.aliases || [],
    region,
    gist,
    seed: full?.seed || [{ type: 'text', md: gist }],
    links: (o.links || []).map(([to, why, by = 'kiko']) => ({
      to: ids.get(to),
      why,
      by,
      at: createdAt,
    })),
    by: o.by || 'kiko',
    createdAt,
    explains:
      full?.explains ||
      Array.from({ length: o.explains || 0 }, (_, n) => ({
        title: '',
        at: createdAt + (n + 1) * DAY,
      })),
    takes:
      full?.takes ||
      (o.scores || []).map((score, n) => ({
        at: createdAt + (n * 6 + 2) * DAY,
        score,
        said: '',
        points: [],
      })),
    cardsStable: !!o.stable,
    wrong: o.wrong || 0,
  };
});

// 四个时刻。前面的时刻星少，星上的记录也少（按日期截掉后来才有的）。
export const STAGES = [
  { id: 'empty', name: '一开始', note: '只有板块，没有星', count: 0, until: T0 },
  { id: 'first', name: '第一颗星', note: '开了「导数」', count: 1, until: T0 + DAY * 0.2 },
  { id: 'days', name: '聊了十天', note: '长出四颗，讲过两次', count: 5, until: T0 + DAY * 10 },
  {
    id: 'grown',
    name: '几个月以后',
    note: `${RAW.length} 颗星`,
    count: RAW.length,
    until: Infinity,
  },
];
export function stageStars(stageId) {
  const stage = STAGES.find((s) => s.id === stageId) || STAGES.at(-1);
  return STARS.slice(0, stage.count).map((s) => {
    const takes = s.takes.filter((t) => t.at <= stage.until);
    return {
      ...s,
      explains: s.explains.filter((e) => e.at <= stage.until),
      takes,
      cardsStable: s.cardsStable && takes.length === s.takes.length,
      wrong: stage.until === Infinity ? s.wrong : 0,
    };
  });
}
