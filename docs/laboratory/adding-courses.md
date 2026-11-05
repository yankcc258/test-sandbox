# 新增学科和章节 · v40

学习区只从 `laboratory/course-data.js` 取课程、学科、方向与判题结果。沙盒默认读取固定的 `course-snapshot.js`；第二步接入正式站时替换适配层的数据来源，不搬快照、不修改下面的场景和界面。

## 新学科、新方向

在数据源的 `disciplines` 添加一条记录，沿用已有字段：`id`、`name`、`en`、`description`、`tracks` 和 `planned`。`tracks` 是已有方向 ID 的列表；`planned` 是用于显示的方向名称。方向数据放在 `tracks`，每条包含 `id`、`title`、`units` 等现有字段，`units` 按顺序列章节 ID。

学科 ID 必须唯一，方向引用必须存在。场景根据学科数量分配螺旋扇区、定位入口和绘制测量环；方向刻度读取该学科的 `planned`（没有时读取 `tracks`）。默认选中数据中的第一个学科，没有按名称或固定六个学科排布。目录按学科和方向数据生成。

## 新章节

1. 在课程数据中增加完整记录，复制现有课程的字段结构：标题、学科、方向、正文各节、先修、术语与题目等。`id` 不重复，`track` 必须归属于某个学科。
2. 将章节 ID 加入对应方向的 `units`，这决定目录顺序。若有推导，按章节 ID 放进 `depth`。沙盒来源记录在 `courseFiles`；正式站接入后由适配层提供来源。
3. 保留正式题目格式：`type`、`text`、`options`、`answer`、`solution`、`hint` 等。适配层给题目生成 `${courseId}:${index}`，保留 `options`，同时提供界面使用的 `choices` 别名。不要更换既有 ID 或题目顺序。
4. 没有观察配方也能进入正文和练习，观察区自动显示中性档案标本。有机三章在 3.0 中采用这一方式。

这些改动都属于数据，不需要改 `scene.js`、`archive.js`、`course-workspace.js`、动画或判题代码。`createCourseData(snapshot, recipes)` 是同一适配器的可测试工厂；正式页面使用它返回的默认 `courseData`。

## 可选观察配方

在 `specimen-recipes.js` 的 `RECIPES` 注册与章节同名的配方。数学五章的数据在 `math-recipes.js`，也合入同一个注册表。配方必须是可序列化的数据，不能放渲染函数。

基本写法沿用 [标本积木与配方](specimen-kit.md)：`id`、`title`、`description`、`controls`（或单参数 `probe`）、`view`、`parts`、`readout`、`checks`。每个配方必须提供至少一个原题数值核对；模型公式不等于原题模型时，明确两者的关系与限制。

```js
checks: [{ question: 'new-chapter:1', expr: '2*x', probe: { x: 3 } }];
```

新增的通用配置：

| 字段           | 用途                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `camera`       | `lessonPull` 是进入正文时镜头拉近量；`elevation` 是观察阶段抬高量；`yaw` 是初始转角。省略则使用通用默认值。 |
| `mode`         | 可选的观察状态，例如 `tangent`。                                                                            |
| `readingNotes` | 以正文节 ID 为键的阅读注，纯文本，经过转义后显示。                                                          |
| `caseStudy`    | 独立数值算例：标题、控件、公式、输出标签、解释、关联正文节与题目索引。不会代填答案。                        |
| `derived`      | 按顺序计算的命名公式，可供后续几何与读数引用。                                                              |
| `outputs`      | 返回可测试的科学数据。支持数组、对象和 `sample` 采样，不影响题目成绩。                                      |

`caseStudy` 例子：

```js
caseStudy: {
  title: '匀速运动', section: 'example', questions: [1],
  controls: [{ name: 't', label: '时间 / s', min: 0, max: 10, step: 0.1, default: 2 }],
  values: { distance: '3*t' }, labels: { distance: '路程 / m' },
  explanation: '速度 3 m/s，时间 {t} s。',
  note: '仅为独立算例，不自动填写练习答案。'
}
```

算例参数按章节保存在页面内存中，返回章节时保留；刷新清空。可选 `scaleAction: { label: '时间减半', factor: 0.5 }`，结果会夹紧到控件范围。

## 三维积木与固定构件槽位

现有二维科学坐标积木继续兼容。数学迁移增加：

- `path`：`point: [x表达式, y表达式, z表达式]`、`from`、`to`、`segments`，自变量默认 `x`。可表示参数曲线、曲面扫描条和切平面。
- `spatial`：显式显示坐标积木，`op` 仅允许 `foot / axes / box / line / ring / arrow / rearSupport / depthRail / surfaceSupport / probabilityChannel`。参数在 `args`；公式为字符串，文字角色和颜色写 `{ literal: 'ivory' }`。没有动态执行 JavaScript。
- `group`：嵌套的 `parts`，可整体重复。`repeat: { var, from, to, step }` 为有限范围；`let` 定义局部公式。`show` 为零时保留槽位并隐藏，避免同章调参破坏组装对应关系。
- `frame: false` 允许配方自行描述底座与支撑；普通配方省略它，仍获得原有标准框架。总预算仍是 288 个槽位。

坐标、尺寸、公式边界、控件全范围和原题核对都必须通过检查。新的科学结构如果超出现有积木能力，应先设计通用积木并补验证；不能在界面中写某个章节 ID 的特殊分支。

## 判题与正式数据接入边界

调用 `courseData.gradeAnswer(question, input)`，它是唯一对外判题入口；第二步将其适配到正式站 `grade(q, a)`。课程对象的题目保留原题索引和选项，不能再复制一套判题逻辑进 UI。

`mountCourseWorkspace({ onResult })` 或 `createCourseSessions({ onResult })` 提供统一回调：

```js
// 有效提交一次触发一次；invalid 输入不触发。
{
  type: ('answer', courseId, questionId, index, input, result, time);
}
// 只有已读状态实际改变才触发；read=false 是明确撤销已读。
{
  type: ('read', courseId, read, time);
}
```

事件的答案数组、结果对象与内部状态隔离。第二步由宿主把结果映射到正式 `state.read / state.attempts` 并调用 `save()`。沙盒默认不接回调，不写存储或后端。本页“重置作答”不发删除正式记录的事件。`onProgress` 仍只用于通知目录刷新，不代替结果回调。

## 检查与验收

运行 `npm run check`。其中 `check-extension.mjs` 用 1–10 个虚拟新学科和新章节验证真实数据适配、目录、进入课程状态、配方／档案两条路径、统一判题及回调隔离。

浏览器回归脚本为 `scripts/check-extension-browser.cjs`。先在仓库根目录起 HTTP 服务，再在装有 Playwright 和 Chrome 的环境运行该脚本；可用 `PLAYWRIGHT_MODULE` 指定已安装的 Playwright 模块路径，`LAB_BASE_URL` 指定实验室地址，`LAB_SHOTS` 指定截图目录。测试通过网络路由仅替换课程数据，不替换应用代码，实际检查 1–10 学科、课程、算例、手机与无 WebGL 回退。

在桌面、390×844 和 320×568 检查目录、阅读、作答、返回、键盘和关闭动效。浏览器响应式检查不等于实体手机性能验收。第一步完成后仍由 Yank 验收；确认后才冻结并进入正式站接入。
