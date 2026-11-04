import { COURSE_SNAPSHOT } from './course-snapshot.js?v=36.1';

// Presentation adapter over a pinned main-site snapshot. No account or storage.
export const SOURCE_COMMIT = COURSE_SNAPSHOT.commit;
export const DISCIPLINES = COURSE_SNAPSHOT.disciplines;
export const TRACKS = COURSE_SNAPSHOT.tracks;
const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const inline = (value) => esc(value).replace(/&lt;(\/?(?:sub|sup))&gt;/g, '<$1>');
const paragraph = (value) => '<p>' + inline(value) + '</p>';
const list = (items, tag = 'ol') =>
  '<' +
  tag +
  '>' +
  items.map((item) => '<li>' + inline(item) + '</li>').join('') +
  '</' +
  tag +
  '>';
const sourceUrl = (path) =>
  'https://github.com/yankcc258/yank-study-lab/blob/' + SOURCE_COMMIT + '/' + path;
function sectionsFor(course) {
  const sections = [
    {
      id: 'prerequisites',
      title: '学习目标与先修',
      html:
        '<h3>本章目标</h3>' +
        paragraph(course.goal) +
        '<h3>先修知识</h3>' +
        list(course.prereq, 'ul') +
        '<h3>先修检查</h3>' +
        paragraph(course.check) +
        '<details><summary>查看答案</summary>' +
        paragraph(course.checkAnswer) +
        (course.checkExplain ? paragraph(course.checkExplain) : '') +
        '</details>',
    },
    {
      id: 'concept',
      title: '概念、公式与适用条件',
      html:
        paragraph(course.intro) +
        paragraph(course.definition) +
        '<p class="formula">' +
        inline(course.formula) +
        '</p>' +
        paragraph(course.units),
    },
    { id: 'steps', title: '逐步推导', html: list(course.steps) },
    { id: 'example', title: '完整例题', html: list(course.example) },
  ];
  if (course.id === 'math-partials')
    sections.find((s) => s.id === 'example').html +=
      '<p class="reading-note">阅读注：这里的“原点处”指本例起始点 (2,3)，并非坐标原点。</p>';
  const depth = COURSE_SNAPSHOT.depth[course.id];
  if (depth)
    sections.push(
      {
        id: 'derivation',
        title: '推导讲义',
        html:
          '<h3>' +
          inline(depth.question) +
          '</h3>' +
          paragraph(depth.setup) +
          '<ol>' +
          depth.steps
            .map(
              ([title, formula, why]) =>
                '<li><h4>' +
                inline(title) +
                '</h4><p class="formula">' +
                inline(formula) +
                '</p>' +
                paragraph(why) +
                '</li>',
            )
            .join('') +
          '</ol><h3>把这个难点说清楚</h3>' +
          paragraph(depth.why),
      },
      {
        id: 'worked',
        title: '推导应用',
        html: '<h3>' + inline(depth.worked.title) + '</h3>' + list(depth.worked.lines),
      },
      {
        id: 'checks',
        title: '停下来，自己推一步',
        html: depth.checks
          .map(
            ([question, answer]) =>
              paragraph(question) +
              '<details><summary>对照推理</summary>' +
              paragraph(answer) +
              '</details>',
          )
          .join(''),
      },
    );
  sections.push(
    {
      id: 'extension',
      title: '理解与拓展',
      html:
        '<h3>从基础理解</h3>' +
        paragraph(course.basic) +
        '<h3>进一步思考</h3>' +
        paragraph(course.extra),
    },
    {
      id: 'review',
      title: '易错点与小结',
      html:
        '<h3>易错点</h3>' +
        paragraph(course.mis) +
        '<h3>本章小结</h3>' +
        paragraph(course.summary) +
        '<h3>观察与练习</h3>' +
        paragraph(course.task),
    },
    {
      id: 'terms',
      title: '术语对照',
      html:
        '<table class="course-terms"><thead><tr><th scope="col">中文</th><th scope="col">日文</th><th scope="col">英文</th></tr></thead><tbody>' +
        course.terms
          .map(
            (row) => '<tr>' + row.map((term) => '<td>' + inline(term) + '</td>').join('') + '</tr>',
          )
          .join('') +
        '</tbody></table>',
    },
  );
  if (course.modelLegend)
    sections.push({
      id: 'model-reference',
      title: '原课程模型说明',
      html:
        '<p class="reading-note">以下为原课程配套模型的说明；本范本保留文字，尚未接入该模型。</p>' +
        paragraph(course.modelLegend),
    });
  const references = [
    '<p>本章正文与 ' +
      course.questions.length +
      ' 道题保留自主站同名课程。本页为沙盒范本，练习结果仅保留在当前页面，不写入正式学习记录。</p>',
  ];
  if (course.source)
    references.push(
      '<p><a href="' +
        esc(course.source) +
        '" target="_blank" rel="noopener noreferrer">原课程参考资料</a></p>',
    );
  references.push(
    '<p><a href="' +
      sourceUrl(COURSE_SNAPSHOT.courseFiles[course.id]) +
      '" target="_blank" rel="noopener noreferrer">查看主站课程来源 · ' +
      SOURCE_COMMIT.slice(0, 7) +
      '</a></p>',
  );
  if (depth)
    references.push(
      '<p>补充推导来源：<a href="' +
        sourceUrl('src/depth.js') +
        '" target="_blank" rel="noopener noreferrer">推导讲义</a> · <a href="' +
        sourceUrl('src/depth-science.js') +
        '" target="_blank" rel="noopener noreferrer">科学推导讲义</a></p>',
    );
  sections.push({ id: 'references', title: '来源与范本说明', html: references.join('') });
  return sections;
}
export const COURSES = COURSE_SNAPSHOT.courses.map((course) => ({
  id: course.id,
  title: course.title,
  subtitle: course.desc,
  subject: course.subject,
  duration: course.time,
  track: course.track,
  discipline: DISCIPLINES.find((d) => d.tracks.includes(course.track)).id,
  mode: course.id === 'math-partials' ? 'tangent' : 'surface',
  noModel: !!course.noModel,
  modelLegend: course.modelLegend || '',
  source: {
    commit: SOURCE_COMMIT,
    path: COURSE_SNAPSHOT.courseFiles[course.id],
    url: sourceUrl(COURSE_SNAPSHOT.courseFiles[course.id]),
  },
  reference: course.source || '',
  prerequisites: course.prereq,
  prerequisiteIds: course.prerequisiteIds,
  goal: course.goal,
  terms: course.terms,
  precheck: {
    prompt: course.check,
    answer: course.checkAnswer,
    ...(course.checkExplain ? { explanation: course.checkExplain } : {}),
  },
  sections: sectionsFor(course),
  questions: course.questions.map((q, index) => ({
    id: course.id + ':' + index,
    index,
    type: q.type,
    prompt: q.text,
    ...(q.options ? { choices: q.options } : {}),
    answer: q.answer,
    explanation: q.solution,
    ...(q.explain ? { choiceExplanations: q.explain } : {}),
    hints: q.hint,
    unit: q.unit || '',
    skill: q.skill,
    reinforce: q.reinforce,
    reinforceAnswer: q.reinforceAnswer,
  })),
}));
const courseById = new Map(COURSES.map((course) => [course.id, course]));
export function getCourse(id) {
  return courseById.get(id);
}
export const COURSE = getCourse('math-partials');
export const MATH_CATALOG = TRACKS.find((track) => track.id === 'math').units.map((id) => ({
  id,
  title: getCourse(id).title,
  available: true,
}));
const knownQuestions = new Set(COURSES.flatMap((course) => course.questions));
export function gradeAnswer(question, input) {
  const invalid = (reason) => ({ status: 'invalid', correct: false, reason });
  if (!knownQuestions.has(question)) return invalid('找不到本章题目。');
  if (question.type === 'single' || question.type === 'multi') {
    if (!Array.isArray(input) || !input.length) return invalid('请先选择答案。');
    if (
      input.some(
        (choice) => !Number.isInteger(choice) || choice < 0 || choice >= question.choices.length,
      )
    )
      return invalid('选项无效，请重新选择。');
    input = [...new Set(input)];
    if (question.type === 'single' && input.length !== 1)
      return invalid('这道题只需选择一个选项。');
  } else {
    if (typeof input !== 'string' && typeof input !== 'number') return invalid('请先填写答案。');
    if (!String(input).trim()) return invalid('请先填写答案。');
  }
  const result = grade(question, input);
  return { ...result, correct: result.status === 'correct' };
}

// The pure norm/numeric/polynomial/grade functions below are copied unchanged
// from src/app.js at SOURCE_COMMIT. They preserve unit conversions, tolerance,
// fill variants and symbolic polynomial comparison, with no account state.

function norm(v) {
  return String(v).normalize('NFKC').trim().replace(/\s+/g, '').replace(/−/g, '-');
}
function numeric(raw, unit) {
  let s = norm(raw).replace(/[×·]10\^?([+-]?\d+)/, 'e$1');
  const m = s.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(.*)$/i);
  if (!m) return { error: '无法读取数值。请使用普通小数或 1.2e-3 形式。' };
  const n = Number(m[1]),
    u = m[2].replace(/ℓ/g, 'L').replace(/l/g, 'L'),
    groups = {
      '': { '': 1 },
      mol: { '': 1, moL: 1, mmoL: 0.001 },
      'mol/L': { '': 1, 'moL/L': 1, 'mmoL/L': 0.001, 'moL/mL': 1000 },
      s: { '': 1, s: 1, min: 60 },
      L: { '': 1, L: 1, mL: 0.001 },
      V: { '': 1, V: 1, mV: 0.001 },
      C: { '': 1, C: 1 },
      eV: { '': 1, eV: 1 },
      N: { '': 1, N: 1 },
      J: { '': 1, J: 1, kJ: 1000 },
      m: { '': 1, m: 1, cm: 0.01 },
      'm/s': { '': 1, 'm/s': 1, 'km/h': 1 / 3.6 },
      'm/s²': { '': 1, 'm/s²': 1, 'm/s^2': 1, 'm/s2': 1 },
      's⁻¹': { '': 1, 's-1': 1, 's^-1': 1, '1/s': 1 },
      'kJ/mol': { '': 1, 'kJ/moL': 1, 'J/moL': 0.001 },
    };
  let f = groups[unit]?.[u];
  if (f === undefined) return { error: '单位无法识别或量纲不匹配。请使用题目列出的单位。' };
  return Number.isFinite(n * f) ? { value: n * f } : { error: '数值超出可计算范围。' };
}
// Polynomial parser: symbolic coefficient arithmetic; no eval and no sample-based equivalence.
function polynomial(input) {
  let s = norm(input).replace(/²/g, '^2').replace(/³/g, '^3');
  if (s.length > 180) throw Error('表达式过长');
  const tokens = s.match(/(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?|x|[()+*/^\-]/gi) || [];
  if (tokens.join('') !== s) throw Error('包含不支持的符号或函数');
  let ts = [];
  tokens.forEach((t, i) => {
    let p = tokens[i - 1];
    if (i && /^(?:x|\)|\d)/.test(p) && /^(?:x|\()/.test(t)) ts.push('*');
    ts.push(t);
  });
  let k = 0,
    peek = () => ts[k],
    pop = () => ts[k++],
    trim = (a) => {
      while (a.length > 1 && Math.abs(a.at(-1)) < 1e-12) a.pop();
      if (a.length > 17 || a.some((x) => !Number.isFinite(x))) throw Error('多项式超出范围');
      return a;
    },
    add = (a, b, f = 1) =>
      trim(
        Array.from(
          { length: Math.max(a.length, b.length) },
          (_, i) => (a[i] || 0) + f * (b[i] || 0),
        ),
      ),
    mul = (a, b) => {
      let o = Array(a.length + b.length - 1).fill(0);
      a.forEach((x, i) => b.forEach((y, j) => (o[i + j] += x * y)));
      return trim(o);
    };
  function atom() {
    let t = pop();
    if (t === 'x') return [0, 1];
    if (t === '(') {
      let a = sum();
      if (pop() !== ')') throw Error('括号不匹配');
      return a;
    }
    if (t && /^\d|^\./.test(t)) return [Number(t)];
    throw Error('缺少数值或变量');
  }
  function power() {
    let a = atom();
    if (peek() === '^') {
      pop();
      let t = pop();
      if (!/^\d+$/.test(t || '') || +t > 8) throw Error('指数须为 0–8 整数');
      let o = [1];
      for (let j = 0; j < +t; j++) o = mul(o, a);
      a = o;
    }
    return a;
  }
  function unary() {
    if (peek() === '+') {
      pop();
      return unary();
    }
    if (peek() === '-') {
      pop();
      return unary().map((x) => -x);
    }
    return power();
  }
  function product() {
    let a = unary();
    while (['*', '/'].includes(peek())) {
      let op = pop(),
        b = unary();
      if (op === '*') a = mul(a, b);
      else {
        if (b.length !== 1 || b[0] === 0) throw Error('仅支持除以非零常数');
        a = a.map((x) => x / b[0]);
      }
    }
    return trim(a);
  }
  function sum() {
    let a = product();
    while (['+', '-'].includes(peek())) {
      let o = pop();
      a = add(a, product(), o === '+' ? 1 : -1);
    }
    return a;
  }
  let a = sum();
  if (k !== ts.length) throw Error('表达式格式不支持');
  return trim(a);
}
function grade(q, a) {
  if (q.type === 'single' || q.type === 'multi') {
    let yes = a.filter((x) => q.answer.includes(x)).length,
      bad = a.filter((x) => !q.answer.includes(x)).length,
      ok = yes === q.answer.length && !bad;
    return {
      status: ok ? 'correct' : yes && !bad ? 'partial' : 'wrong',
      reason: ok
        ? '选择与规则答案一致。'
        : yes && !bad
          ? '已选选项正确，但遗漏了其他正确选项。'
          : '包含不成立的选项，请结合下方逐项分析。',
    };
  }
  if (q.type === 'number') {
    let r = numeric(a, q.unit);
    if (r.error) return { status: 'unknown', reason: r.error };
    let tol = Math.max(1e-6, Math.abs(q.answer) * 0.005),
      ok = Math.abs(r.value - q.answer) <= tol + Number.EPSILON;
    return {
      status: ok ? 'correct' : 'wrong',
      reason: ok
        ? '单位换算后的数值在允许误差内。'
        : '数值超出允许误差。检查公式、单位与代入顺序；具体思路见下方解析。',
    };
  }
  if (q.type === 'fill') {
    let ok = q.answer.map(norm).includes(norm(a));
    return {
      status: ok ? 'correct' : 'unknown',
      reason: ok
        ? '答案与接受的标准表达一致。'
        : '暂未匹配到预置答案；自由措辞无法可靠判定，请对照标准答案。可改用题目列出的规范写法。',
    };
  }
  if (q.type === 'expression') {
    try {
      let p = polynomial(a),
        ok = p.length === q.answer.length && p.every((v, i) => Math.abs(v - q.answer[i]) < 1e-9);
      return {
        status: ok ? 'correct' : 'wrong',
        reason: ok
          ? '已化简为多项式，系数一致，在全部实数范围内恒等。'
          : '多项式化简后的系数不一致，因此不是同一个表达式。',
      };
    } catch (e) {
      return {
        status: 'unknown',
        reason: e.message + '。本题只检查指定的一元多项式，不猜测其他表达式。',
      };
    }
  }
  return { status: 'unknown', reason: '此题型暂未开放。' };
}
