# 知序 · 视觉沙盒

[沙盒目录](https://yankcc258.github.io/test-sandbox/) · [实验室](https://yankcc258.github.io/test-sandbox/laboratory/?v=39) · [复习区](https://yankcc258.github.io/test-sandbox/recall.html?i=1&workbench=1) · [工作台](https://yankcc258.github.io/test-sandbox/workstation/) · [资料目录](https://yankcc258.github.io/test-sandbox/docs/)

知序的视觉与交互试验场。只有示例数据和课程快照，不连接正式站的账号、接口或学习记录；部分成果已接入正式站，但这里不是正式站的副本。

**当前重点**：知序 3.0 收尾，计划和进度表在正式仓库 [`docs/v3-plan.md`](https://github.com/yankcc258/yank-study-lab/blob/main/docs/v3-plan.md)。第一步「沙盒学习区定稿」由特蕾莎负责，开工先看 [重新开工说明](docs/laboratory/next-steps.md#restart-2026-11-05)。新的视觉和艺术实验以后放到新网站，不再加进沙盒。

## 三个区域

知序像一栋楼：2F 工作台、1F 实验室、B1 复习区，区域之间坐同一条竖井。

| 区域           | 入口                                                       | 代码                     | 说明                                   |
| -------------- | ---------------------------------------------------------- | ------------------------ | -------------------------------------- |
| 1F 实验室      | [laboratory/](laboratory/?v=39)                            | `laboratory/`            | [docs/laboratory/](docs/laboratory/)   |
| B1 复习区      | [recall.html](recall.html?i=1&workbench=1)                 | `recall.html`、`recall/` | [docs/recall/](docs/recall/)           |
| 2F 工作台      | [workstation/](workstation/)                               | `workstation/`           | [docs/workstation/](docs/workstation/) |
| 星空           | [preview/starfield/](preview/starfield/?from=catalog&v=29) | `preview/starfield/`     | [docs/starfield/](docs/starfield/)     |
| 小样与历史原型 | [preview/](preview/)                                       | `preview/`               | [docs/history/](docs/history/)         |

## 接手先读

| 在做什么                         | 先读                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 实验室（大螺旋、课程、观察模型） | [实验室交接记录](docs/laboratory/laboratory-observation.md)（特蕾莎，每轮更新）                                                                       |
| 给其他学科加观察模型             | [标本积木与配方](docs/laboratory/specimen-kit.md)                                                                                                     |
| 实验室的方向讨论                 | [学科空间与流星组装讨论稿](docs/laboratory/laboratory-proposal.md) · [流星组装小样](docs/laboratory/meteor-assembly.md)                               |
| 复习区                           | [七个系统的解剖与信号](docs/recall/spine-anatomy.md) · [记忆生命体设定](docs/recall/living-specimen.md)                                               |
| 工作台                           | [工作台范本](docs/workstation/workstation-prototype.md) · [竖井、纸飞机与平板](docs/workstation/region-motion.md) · [希可](docs/workstation/seeko.md) |
| 以前每一版改了什么               | [更新记录 v23–v36](docs/history/changelog.md) · [v17 之前](docs/history/review-sandbox-v17.md)                                                        |

协作方式：直接在 `main` 上迭代，推送前先同步远端，保留别人的并行修改。改了别人负责的文件，在对应交接里写一句改了什么。

## 最新决定

- 工作台与实验室、脊柱共用深石墨、象牙白、钛金属、深色玻璃和细线排版。
- 采用克制的科研机构方向；有机与无机的结合集中在研究对象，房间保持理性、可用的结构。
- 原三种画风和固定布局线稿不再约束当前方案；历史稿仍保留并标记。
- 主站原电子环绕开场保留。沙盒新开场已移除，不重新接入。
- 未经单独安排，不把整个沙盒搬进正式站。

## 目录结构

```
index.html          沙盒目录
recall.html         复习区页面（地址不变）
recall/             复习区的脚本、样式和脊柱模型（原来散在根目录的 recall-*.js/css 和 models/）
laboratory/         实验室：大螺旋、课程快照、观察模型、标本积木与配方
workstation/        工作台：三维桌面、平板、纸飞机、希可的小窝
preview/            星空、流星小样和冻结的历史原型
sandbox/            几个区域共用的：竖井过渡、希可、目录样式、旧链接跳转
assets/  vendor/    原创资源、字体、模型文件，以及带许可证的依赖（three.js）
scripts/            检查脚本、模型构建；smoke/ 是早期调试脚本
docs/               按区域分的说明和截图：laboratory/ recall/ workstation/ starfield/ history/
```

旧的 `/?i=1&v=13`、`/?workbench=1&i=1&v=17`、`/?region=lab`、`/?motion=0` 继续进入复习范本并保留参数。裸地址打开目录。冻结预览路径均保留。

## 本地运行与检查

在仓库根目录执行：

```sh
python -m http.server 8080 --bind 127.0.0.1
npm run check
```

访问 http://127.0.0.1:8080/ 。不能直接双击 HTML，场景使用 ES 模块。

- `check:workstation`：东京时段边界、计时暂停续计、旧链接路由、材料试样与薄壳闭合性、平面法线、屏幕 UV、接触轮廓及云层密度边界。
- `check:links`：当前页面、样式与模块的本地资源链路。
- `check:motion`：区域竖井三段时间线两端闭合、换页前竖井完全不透明，以及纸飞机的阶段与高度。
- `check:starfield`：飞行像素预算、资源预取并发与失败处理、真实 Worker 天象结果、跨东京午夜一致性，以及入场就绪／超时／关闭动效。
- `check:laboratory`：数学几何、运动与流程状态，包含 17 章快照、85 题判题、章节隔离、目录状态、组装与五个数学观察对象检查；v35 补查沿环到入口、按到达时间分派、落位展开与同章参数增减。本轮完整检查与浏览器验证已通过，结果见 [v35 验证记录](docs/laboratory/laboratory-observation.md#validation-v35)，历史通过记录不代替本轮验收。
- `check:pulse`、`check:experience`、`check:terminal`：已有脊柱交互与几何检查；`check-anatomy` 是复习区七个系统的解剖读数。
- `check-specimen-kit`（在 `check:laboratory` 里）：标本积木的公式解析器，配方在滑杆全范围可生成，并用原题答案核对。
- `check:docs`：所有 Markdown 和 HTML 里的相对链接、图片都指向真实存在的文件；挪动文件以后跑一遍就知道哪里断了。
- `scripts/smoke/` 是早期调试脚本，部分断言过时，不作为当前验收结论。

工作台参数：`?motion=0` 关闭动效；`?light=day`、`dusk`、`night` 临时预览时段；`?view=fallback` 查看无 WebGL 回退。默认读取东京时间，始终保持深色外壳。

学科观察入口：`laboratory/?v=39`；增加 `&motion=0` 关闭场景动效，增加 `&view=fallback` 查看无 WebGL 降级。当前开放主站课程的只读快照，沙盒作答不写入正式学习记录。

## 来源与许可

- 原创代码与模型采用 MIT（见 LICENSE）。three.js r170 的 MIT 许可在 `vendor/three/LICENSE`，Inter 的 OFL 许可在 `assets/fonts/Inter-LICENSE.txt`。
- 初始脊柱版式参考 [rhine-lab-art](https://github.com/reverieach/rhine-lab-art) 的构思，未使用其未授权代码、模型、图像或标志。
- 工作台为原创程序几何、纹理与内容，莱茵生命仅作为美术气质参照。两幅墙画使用内置 imagegen 原创生成，[资产与完整提示词](workstation/art/README.md) 已归档。
- 星空贴图来源见 [NASA-imagery.md](preview/starfield/NASA-imagery.md)。

历史详情见 [v17 之前的完整记录](docs/history/review-sandbox-v17.md)。历史版本状态和接入意见，以用户最新决定为准。

个人工具截图及既有角色图来源见 [预览资产说明](workstation/previews/README.md)。
