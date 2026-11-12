// Declarative scientific and display coordinates; no chapter-specific renderer.
export const MATH_RECIPES = {
  math: {
    id: 'math',
    title: '导数与切线斜率',
    description:
      '象牙曲线为 y=x²，黄绿直线为所选点的真实切线。显示横轴 0.95、纵轴 0.8 的独立比例，数值斜率仍为 2a。',
    category: 'mathematics',
    probe: {
      name: 'a',
      label: '切点 a',
      min: -1.3,
      max: 1.3,
      step: 0.05,
      default: 0.8,
    },
    view: {
      x: [-1.3, 1.3],
      y: [-1, 1.15],
    },
    frame: false,
    readout: 'a={a} · f(a)={a*a} · f′(a)={2*a}',
    outputs: {
      a: 'a',
      value: 'a*a',
      slope: '2*a',
      tangentIntercept: '-a*a',
      displayScale: [0.95, 0.8],
    },
    parts: [
      {
        part: 'spatial',
        op: 'foot',
        args: [],
      },
      {
        part: 'spatial',
        op: 'rearSupport',
        args: [[0, -0.95, 0.08], 0.02, 'baseTop'],
      },
      {
        part: 'spatial',
        op: 'axes',
        args: [[0, -0.95, -0.06], [-1.5, 1.5], [-1.1, 1.18], 0.475],
      },
      {
        part: 'path',
        point: ['.95*x', '.8*x*x-.95', 0.08],
        from: -1.5,
        to: 1.5,
        segments: 80,
        width: 0.037,
        color: 'ivory',
        depth: 0.12,
        role: 'curve',
      },
      {
        part: 'path',
        point: ['.95*x', '.8*(a*a+2*a*(x-a))-.95', 0.17],
        from: 'max(-1.5,a-.65)',
        to: 'min(1.5,a+.65)',
        segments: 28,
        width: 0.022,
        color: 'lime',
        depth: 0.045,
        role: 'tangent',
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['.95*a', -0.95, 0],
          ['.95*a', '.8*a*a-.95', 0],
          0.01,
          {
            literal: 'ice',
          },
          0.014,
          {
            literal: 'projection',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'ring',
        args: [['.95*a', '.8*a*a-.95', 0.22]],
      },
    ],
    checks: [
      {
        question: 'math:1',
        expr: '2*3',
      },
      {
        question: 'math:2',
        expr: '2*2+.1',
      },
    ],
  },
  'math-integral': {
    id: 'math-integral',
    title: '定积分：从小片累积到总量',
    description:
      '固定 y=x²、区间 [0,1]。每片宽 1/n，高度取区间中点；矩形顶边逐渐贴近象牙曲线。这是中点和，不是右端点和。',
    category: 'mathematics',
    probe: {
      name: 'n',
      label: '中点矩形数 n',
      min: 4,
      max: 32,
      step: 1,
      default: 8,
    },
    view: {
      x: [-1.3, 1.3],
      y: [-1, 1.15],
    },
    frame: false,
    readout: 'n={n} · 中点和 {1/3-1/(12*n*n)|7} · 精确值 1/3 · 误差 {-1/(12*n*n)|6}',
    outputs: {
      n: 'n',
      sum: '1/3-1/(12*n*n)',
      exact: '1/3',
      rectangles: {
        sample: {
          var: 'i',
          from: 0,
          to: 'n-1',
        },
        value: {
          left: 'i/n',
          right: '(i+1)/n',
          midpoint: '(i+.5)/n',
          height: '((i+.5)/n)^2',
          area: '((i+.5)/n)^2/n',
        },
      },
    },
    parts: [
      {
        part: 'spatial',
        op: 'foot',
        args: [],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [0, -1.012, 0.015],
          [2.65, 0.024, 0.115],
          {
            literal: '#b9c0c2',
          },
          [0, 0, 0],
          {
            literal: 'hardware-metal',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'rearSupport',
        args: [[-1.12, -1.024, 0.015], -0.0425, 'baseTop'],
      },
      {
        part: 'spatial',
        op: 'rearSupport',
        args: [[1.12, -1.024, 0.015], -0.0425, 'baseTop'],
      },
      {
        part: 'spatial',
        op: 'axes',
        args: [[-1.3, -1, -0.1], [-1.42, 1.42], [-1.08, 1.15], 0.26],
      },
      {
        part: 'path',
        point: ['-1.3+2.6*x', '-1+2*x*x', 0.2],
        from: 0,
        to: 1,
        segments: 72,
        width: 0.028,
        color: 'ivory',
        depth: 0.055,
        role: 'curve',
      },
      {
        part: 'group',
        repeat: {
          var: 'i',
          from: 0,
          to: 31,
        },
        parts: [
          {
            part: 'spatial',
            op: 'box',
            args: [
              ['-1.3+2.6*(i+.5)/n', '-1+((i+.5)/n)^2', 0.015],
              ['2.6/n', '2*((i+.5)/n)^2', 0.095],
              {
                literal: 'titanium',
              },
              [0, 0, 0],
              {
                literal: 'midpoint-rectangle',
              },
            ],
            show: 'i<n',
            colors: ['titanium', 'ceramic'],
            colorIndex: 'i-2*floor(i/2)',
          },
          {
            part: 'spatial',
            op: 'box',
            args: [
              ['-1.3+2.6*(i+.5)/n', '-1+2*((i+.5)/n)^2', 0.075],
              ['2.6/n', 0.008, 0.025],
              {
                literal: 'lime',
              },
              [0, 0, 0],
              {
                literal: 'rectangle-top',
              },
            ],
            show: 'i<n',
          },
          {
            part: 'spatial',
            op: 'box',
            args: [
              ['-1.3+2.6*(i+.5)/n', -1.045, 0.09],
              [0.009, 0.046, 0.035],
              {
                literal: 'ivory',
              },
              [0, 0, 0],
              {
                literal: 'midpoint-tick',
              },
            ],
            show: 'i<n',
          },
        ],
      },
    ],
    checks: [
      {
        question: 'math-integral:1',
        expr: '3^2',
      },
      {
        question: 'math-integral:2',
        expr: '1^2+2^2',
      },
      {
        question: 'math-integral:4',
        expr: '2*3',
      },
    ],
  },
  'math-explog': {
    id: 'math-explog',
    title: '指数、对数与链式法则',
    description:
      '象牙曲线 y=eˣ，冷灰曲线 y=ln x；相同横纵比例使两者关于 y=x 对称。连线两端交换坐标，ln x 仅在 x>0 显示。',
    category: 'mathematics',
    probe: {
      name: 't',
      label: '指数输入 t',
      min: -1.1,
      max: 1,
      step: 0.05,
      default: 0.4,
    },
    view: {
      x: [-1.3, 1.3],
      y: [-1, 1.15],
    },
    frame: false,
    readout: 'e^{t}={exp(t)} · ln({exp(t)})={t}',
    outputs: {
      t: 't',
      exponential: ['t', 'exp(t)'],
      inverse: ['exp(t)', 't'],
      displayScale: 0.7,
    },
    parts: [
      {
        part: 'spatial',
        op: 'foot',
        args: [-1.48],
      },
      {
        part: 'spatial',
        op: 'rearSupport',
        args: [['.7*(-1.2)-.48', '.7*(exp(-1.2))-.48', 0.1], 0.0525, 'baseTop'],
      },
      {
        part: 'spatial',
        op: 'rearSupport',
        args: [['.7*(exp(-1.2))-.48', '.7*(-1.2)-.48', 0.04], 0.0025, 'baseTop'],
      },
      {
        part: 'spatial',
        op: 'axes',
        args: [['.7*(0)-.48', '.7*(0)-.48', -0.06], [-1.4, 1.65], [-1.4, 1.65], 0.35],
      },
      {
        part: 'path',
        point: ['.7*(x)-.48', '.7*(exp(x))-.48', 0.1],
        from: -1.2,
        to: 1.1,
        segments: 64,
        width: 0.032,
        color: 'ivory',
        depth: 0.095,
        role: 'curve',
      },
      {
        part: 'path',
        point: ['.7*(exp(x))-.48', '.7*(x)-.48', 0.04],
        from: -1.2,
        to: 1.1,
        segments: 64,
        width: 0.029,
        color: 'ice',
        depth: 0.075,
        role: 'curve',
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['.7*(s)-.48', '.7*(s)-.48', -0.03],
          ['.7*(s+4.25/16*.46)-.48', '.7*(s+4.25/16*.46)-.48', -0.03],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'reflection-axis',
          },
        ],
        repeat: {
          var: 'i',
          from: 0,
          to: 15,
        },
        let: {
          s: '-1.2+i*4.25/16',
        },
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['.7*(t+(exp(t)-t)*i/10)-.48', '.7*(exp(t)+(t-exp(t))*i/10)-.48', 0.22],
          ['.7*(t+(exp(t)-t)*(i+.5)/10)-.48', '.7*(exp(t)+(t-exp(t))*(i+.5)/10)-.48', 0.22],
          0.009,
          {
            literal: 'lime',
          },
          0.015,
          {
            literal: 'inverse-pair',
          },
        ],
        repeat: {
          var: 'i',
          from: 0,
          to: 9,
        },
      },
      {
        part: 'spatial',
        op: 'ring',
        args: [
          ['.7*(t)-.48', '.7*(exp(t))-.48', 0.22],
          0.05,
          {
            literal: 'lime',
          },
          10,
        ],
      },
      {
        part: 'spatial',
        op: 'ring',
        args: [
          ['.7*(exp(t))-.48', '.7*(t)-.48', 0.22],
          0.05,
          {
            literal: 'lime',
          },
          10,
        ],
      },
    ],
    checks: [
      {
        question: 'math-explog:0',
        expr: 'log10(.001)',
      },
      {
        question: 'math-explog:1',
        expr: '-2*exp(0)',
      },
      {
        question: 'math-explog:3',
        expr: 'ln(4)/20',
      },
      {
        question: 'math-explog:4',
        expr: 'ln(exp(3)/e)',
      },
    ],
  },
  'math-partials': {
    id: 'math-partials',
    title: '偏导数与全微分',
    description:
      '真实曲面 f=x²y；以 (2,3,12) 为显示中心。横向=2(x−2)，纵深=2(y−3)，高度=0.12(f−12)。切面为 12+12(x−2)+4(y−3)；固定 y、固定 x 的截线分别为黄绿与冷灰。',
    category: 'mathematics',
    probe: {
      name: 't',
      label: '例题步长 t（dx=0.1t，dy=−0.2t）',
      min: 0,
      max: 1,
      step: 0.05,
      default: 1,
    },
    view: {
      x: [-1.3, 1.3],
      y: [-1, 1.15],
    },
    frame: false,
    readout: 't={t} · df={df} · Δf={delta} · 高估 {df-delta}',
    outputs: {
      fraction: 't',
      x: 'px',
      y: 'py',
      value: 'px^2*py',
      base: 12,
      fx: 12,
      fy: 4,
      df: 'df',
      delta: 'delta',
      error: 'df-delta',
      displayScale: [2, 0.12, 2],
      displayOrigin: [2, 12, 3],
      samples: {
        sample: {
          var: 'j',
          from: 0,
          to: 8,
        },
        value: {
          sample: {
            var: 'i',
            from: 0,
            to: 16,
          },
          value: {
            x: '1.45+1.1*i/16',
            y: '2.5+j/8',
            f: '(1.45+1.1*i/16)^2*(2.5+j/8)',
          },
        },
        flat: true,
      },
    },
    parts: [
      {
        part: 'spatial',
        op: 'foot',
        args: [],
      },
      {
        part: 'spatial',
        op: 'depthRail',
        args: [-1.03125],
      },
      {
        part: 'spatial',
        op: 'surfaceSupport',
        args: [
          [-1.03125, -0.778634765625, -1.0],
          'atan2(.12*(1.51875^2-1.45^2)*2.5,2*(1.51875-1.45))',
          -1.28,
        ],
      },
      {
        part: 'spatial',
        op: 'surfaceSupport',
        args: [
          [-1.03125, -0.514088671875, 1.0],
          'atan2(.12*(1.51875^2-1.45^2)*3.5,2*(1.51875-1.45))',
          -1.28,
        ],
      },
      {
        part: 'spatial',
        op: 'depthRail',
        args: [1.03125],
      },
      {
        part: 'spatial',
        op: 'surfaceSupport',
        args: [
          [1.03125, 0.45886523437499993, -1.0],
          'atan2(.12*(2.55^2-2.48125^2)*2.5,2*(2.55-2.48125))',
          -1.28,
        ],
      },
      {
        part: 'spatial',
        op: 'surfaceSupport',
        args: [
          [1.03125, 1.218411328125, 1.0],
          'atan2(.12*(2.55^2-2.48125^2)*3.5,2*(2.55-2.48125))',
          -1.28,
        ],
      },
      {
        part: 'path',
        point: ['2*(x-2)', '.12*((x)^2*(y)-12)', '2*(y-3)'],
        from: 1.45,
        to: 2.55,
        segments: 16,
        width: 0.024,
        color: 'ivory',
        depth: 0.15,
        role: 'partial-surface',
        repeat: {
          var: 'j',
          from: 0,
          to: 8,
        },
        let: {
          y: '2.5+j/8',
        },
        colors: ['ivory', 'ceramic'],
        colorIndex: 'j-2*floor(j/2)',
      },
      {
        part: 'path',
        point: ['2*(x-2)', '.12*((x)^2*(3)-12)', '2*(3-3)'],
        from: 1.45,
        to: 2.55,
        segments: 18,
        width: 0.038,
        color: 'lime',
        depth: 0.026,
        role: 'fixed-y-section',
      },
      {
        part: 'path',
        point: ['2*(2-2)', '.12*((2)^2*(x)-12)', '2*(x-3)'],
        from: 2.5,
        to: 3.5,
        segments: 12,
        width: 0.038,
        color: 'ice',
        depth: 0.026,
        role: 'fixed-x-section',
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['2*(1.6-2)', '.12*(12+12*(1.6-2)+4*(2.65-3)-12)', '2*(2.65-3)'],
          ['2*(2.4-2)', '.12*(12+12*(2.4-2)+4*(2.65-3)-12)', '2*(2.65-3)'],
          0.008,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [
            '2*(1.6-2)',
            '.12*(12+12*(1.6-2)+4*(2.7666666666666666-3)-12)',
            '2*(2.7666666666666666-3)',
          ],
          [
            '2*(2.4-2)',
            '.12*(12+12*(2.4-2)+4*(2.7666666666666666-3)-12)',
            '2*(2.7666666666666666-3)',
          ],
          0.008,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [
            '2*(1.6-2)',
            '.12*(12+12*(1.6-2)+4*(2.8833333333333333-3)-12)',
            '2*(2.8833333333333333-3)',
          ],
          [
            '2*(2.4-2)',
            '.12*(12+12*(2.4-2)+4*(2.8833333333333333-3)-12)',
            '2*(2.8833333333333333-3)',
          ],
          0.008,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['2*(1.6-2)', '.12*(12+12*(1.6-2)+4*(3.0-3)-12)', '2*(3.0-3)'],
          ['2*(2.4-2)', '.12*(12+12*(2.4-2)+4*(3.0-3)-12)', '2*(3.0-3)'],
          0.008,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [
            '2*(1.6-2)',
            '.12*(12+12*(1.6-2)+4*(3.1166666666666667-3)-12)',
            '2*(3.1166666666666667-3)',
          ],
          [
            '2*(2.4-2)',
            '.12*(12+12*(2.4-2)+4*(3.1166666666666667-3)-12)',
            '2*(3.1166666666666667-3)',
          ],
          0.008,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [
            '2*(1.6-2)',
            '.12*(12+12*(1.6-2)+4*(3.2333333333333334-3)-12)',
            '2*(3.2333333333333334-3)',
          ],
          [
            '2*(2.4-2)',
            '.12*(12+12*(2.4-2)+4*(3.2333333333333334-3)-12)',
            '2*(3.2333333333333334-3)',
          ],
          0.008,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [
            '2*(1.6-2)',
            '.12*(12+12*(1.6-2)+4*(3.3499999999999996-3)-12)',
            '2*(3.3499999999999996-3)',
          ],
          [
            '2*(2.4-2)',
            '.12*(12+12*(2.4-2)+4*(3.3499999999999996-3)-12)',
            '2*(3.3499999999999996-3)',
          ],
          0.008,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['2*(1.6-2)', '.12*(12+12*(1.6-2)+4*(2.65-3)-12)', '2*(2.65-3)'],
          ['2*(1.6-2)', '.12*(12+12*(1.6-2)+4*(3.35-3)-12)', '2*(3.35-3)'],
          0.012,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['2*(2.4-2)', '.12*(12+12*(2.4-2)+4*(2.65-3)-12)', '2*(2.65-3)'],
          ['2*(2.4-2)', '.12*(12+12*(2.4-2)+4*(3.35-3)-12)', '2*(3.35-3)'],
          0.012,
          {
            literal: 'titanium',
          },
          0.018,
          {
            literal: 'tangent-plane',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['2*(2-2)', '.12*((2)^2*(3)-12)', '2*(3-3)'],
          ['2*(px-2)', '.12*(12+df-12)', '2*(py-3)'],
          0.025,
          {
            literal: 'lime',
          },
          0.033,
          {
            literal: 'differential',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['2*(px-2)', '.12*(12+df-12)', '2*(py-3)'],
          ['2*(px-2)', '.12*((px)^2*(py)-12)', '2*(py-3)'],
          0.034,
          {
            literal: 'ice',
          },
          0.034,
          {
            literal: 'remainder',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          ['2*(px-2)', '.12*((px)^2*(py)-12)', '2*(py-3)'],
          [0.055, 0.055, 0.055],
          {
            literal: 'ivory',
          },
          [0, 0, 'pi/4'],
          {
            literal: 'exact-value',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          ['2*(2-2)', '.12*((2)^2*(3)-12)', '2*(3-3)'],
          [0.06, 0.06, 0.06],
          {
            literal: 'lime',
          },
          [0, 0, 'pi/4'],
          {
            literal: 'expansion-point',
          },
        ],
      },
    ],
    checks: [
      {
        question: 'math-partials:0',
        expr: '2*2*3',
      },
      {
        question: 'math-partials:1',
        expr: '12*.1+4*(-.2)',
      },
      {
        question: 'math-partials:2',
        expr: '2.1^2*2.8-12',
      },
    ],
    derived: {
      px: '2+.1*t',
      py: '3-.2*t',
      df: '12*(px-2)+4*(py-3)',
      delta: 'px^2*py-12',
    },
    camera: {
      lessonPull: 2.35,
      elevation: 1.4,
      yaw: -0.38,
    },
    mode: 'tangent',
    readingNotes: {
      example: '阅读注：这里的“原点处”指本例起始点 (2,3)，并非坐标原点。',
    },
    caseStudy: {
      title: 'f = x²y · 从 (2, 3) 出发',
      section: 'example',
      questions: [1, 2],
      controls: [
        {
          name: 'dx',
          label: 'x 的改变量 dx',
          min: -0.3,
          max: 0.3,
          step: 0.001,
          default: 0.1,
        },
        {
          name: 'dy',
          label: 'y 的改变量 dy',
          min: -0.3,
          max: 0.3,
          step: 0.001,
          default: -0.2,
        },
      ],
      values: {
        differential: '12*dx+4*dy',
        exact: '(2+dx)^2*(3+dy)-12',
        error: '12*dx+4*dy-((2+dx)^2*(3+dy)-12)',
      },
      labels: {
        differential: '一阶估计 df',
        exact: '精确变化 Δf',
        error: '估计 − 精确',
      },
      explanation: 'df = 12 × {dx} + 4 × ({dy})；精确值由两个状态的函数值相减。',
      scaleAction: {
        label: '步长减半',
        factor: 0.5,
      },
      note: '移动数值不会改变上方几何示意，也不会替你填写答案。',
    },
  },
  'math-complex': {
    id: 'math-complex',
    title: '复数、模平方与概率归一化',
    description:
      '左侧象牙箭头 z₁=a+i，黄绿箭头 z₁/√S；冷灰箭头 z₂/√S，固定 z₂=1。右侧两柱以同一 0–1 刻度显示正交结果概率，不表示波的叠加。',
    category: 'mathematics',
    probe: {
      name: 'a',
      label: '实部 a（虚部固定为 1）',
      min: -2,
      max: 2,
      step: 0.05,
      default: 1,
    },
    view: {
      x: [-1.3, 1.3],
      y: [-1, 1.15],
    },
    frame: false,
    readout: '|z₁|²={weight1} · S={total} · P₁={weight1/total} · P₂={1/total} · 和=1',
    outputs: {
      a: 'a',
      b: 1,
      weight1: 'weight1',
      weight2: 1,
      total: 'total',
      amplitude1: ['a/sqrt(total)', '1/sqrt(total)'],
      amplitude2: ['1/sqrt(total)', 0],
      probabilities: ['weight1/total', '1/total'],
    },
    parts: [
      {
        part: 'spatial',
        op: 'foot',
        args: [],
      },
      {
        part: 'spatial',
        op: 'rearSupport',
        args: [['-.5+.52*(0)', '-.15+.52*(-1)', -0.015], -0.0265, 'baseTop'],
      },
      {
        part: 'spatial',
        op: 'axes',
        args: [['-.5+.52*(0)', '-.15+.52*(0)', -0.06], [-1.62, 0.65], [-0.88, 0.97], 0.26],
      },
      {
        part: 'path',
        point: ['-.5+.52*(cos(x))', '-.15+.52*(sin(x))', -0.015],
        from: 0,
        to: '2*pi',
        segments: 64,
        width: 0.012,
        color: 'titanium',
        depth: 0.023,
        role: 'unit-circle',
      },
      {
        part: 'spatial',
        op: 'arrow',
        args: [
          ['-.5+.52*(0)', '-.15+.52*(0)', 0.14],
          ['-.5+.52*(a)', '-.15+.52*(1)', 0.14],
          0.033,
          {
            literal: 'ivory',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'arrow',
        args: [
          ['-.5+.52*(0)', '-.15+.52*(0)', 0.24],
          ['-.5+.52*(a/sqrt(total))', '-.15+.52*(1/sqrt(total))', 0.24],
          0.027,
          {
            literal: 'lime',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['-.5+.52*(a)', '-.15+.52*(0)', 0.09],
          ['-.5+.52*(a)', '-.15+.52*(1)', 0.09],
          0.009,
          {
            literal: 'ice',
          },
          0.013,
          {
            literal: 'imaginary-component',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          ['-.5+.52*(0)', '-.15+.52*(1)', 0.09],
          ['-.5+.52*(a)', '-.15+.52*(1)', 0.09],
          0.009,
          {
            literal: 'ice',
          },
          0.013,
          {
            literal: 'real-component',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'arrow',
        args: [
          ['-.5+.52*(0)', '-.15+.52*(0)', 0.3],
          ['-.5+.52*(1/sqrt(total))', '-.15+.52*(0)', 0.3],
          0.022,
          {
            literal: 'ice',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'ring',
        args: [
          ['-.5+.52*(a)', '-.15+.52*(1)', 0.2],
          0.047,
          {
            literal: 'ivory',
          },
          10,
        ],
      },
      {
        part: 'spatial',
        op: 'probabilityChannel',
        args: [0.94, -0.98, 1.72, 'baseTop'],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [0.94, -0.12, -0.06],
          [0.3, 1.72, 0.045],
          {
            literal: 'dark',
          },
          [0, 0, 0],
          {
            literal: 'probability-scale',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [0.94, '-.98+1.72*(weight1/total)/2', 0.04],
          [0.25, '1.72*(weight1/total)', 0.12],
          {
            literal: 'lime',
          },
          [0, 0, 0],
          {
            literal: 'probability-bar',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [0.94, '-.98+1.72*(weight1/total)', 0.11],
          [0.28, 0.012, 0.045],
          {
            literal: 'ivory',
          },
          [0, 0, 0],
          {
            literal: 'probability-cap',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [0.75, -0.98, 0.05],
          [0.7999999999999999, -0.98, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [0.75, -0.55, 0.05],
          [0.7999999999999999, -0.55, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [0.75, -0.12, 0.05],
          [0.7999999999999999, -0.12, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [0.75, 0.31000000000000005, 0.05],
          [0.7999999999999999, 0.31000000000000005, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [0.75, 0.74, 0.05],
          [0.7999999999999999, 0.74, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [0.94, -1.08, 0.08],
          [0.18, 0.035, 0.1],
          {
            literal: 'lime',
          },
          [0, 0, 0],
          {
            literal: 'outcome-key',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'probabilityChannel',
        args: [1.4, -0.98, 1.72, 'baseTop'],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [1.4, -0.12, -0.06],
          [0.3, 1.72, 0.045],
          {
            literal: 'dark',
          },
          [0, 0, 0],
          {
            literal: 'probability-scale',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [1.4, '-.98+1.72*(1/total)/2', 0.04],
          [0.25, '1.72*(1/total)', 0.12],
          {
            literal: 'ice',
          },
          [0, 0, 0],
          {
            literal: 'probability-bar',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [1.4, '-.98+1.72*(1/total)', 0.11],
          [0.28, 0.012, 0.045],
          {
            literal: 'ivory',
          },
          [0, 0, 0],
          {
            literal: 'probability-cap',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [1.21, -0.98, 0.05],
          [1.2599999999999998, -0.98, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [1.21, -0.55, 0.05],
          [1.2599999999999998, -0.55, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [1.21, -0.12, 0.05],
          [1.2599999999999998, -0.12, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [1.21, 0.31000000000000005, 0.05],
          [1.2599999999999998, 0.31000000000000005, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'line',
        args: [
          [1.21, 0.74, 0.05],
          [1.2599999999999998, 0.74, 0.05],
          0.009,
          {
            literal: 'titanium',
          },
          0.015,
          {
            literal: 'probability-tick',
          },
        ],
      },
      {
        part: 'spatial',
        op: 'box',
        args: [
          [1.4, -1.08, 0.08],
          [0.18, 0.035, 0.1],
          {
            literal: 'ice',
          },
          [0, 0, 0],
          {
            literal: 'outcome-key',
          },
        ],
      },
    ],
    checks: [
      {
        question: 'math-complex:0',
        expr: '3^2+4^2',
      },
    ],
    derived: {
      weight1: 'a*a+1',
      total: 'weight1+1',
    },
  },
};
