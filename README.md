# 知序 · 视觉沙盒

[沙盒目录](https://yankcc258.github.io/test-sandbox/) · [工作台](https://yankcc258.github.io/test-sandbox/workstation/) · [历史原型](https://yankcc258.github.io/test-sandbox/preview/)

独立的视觉与交互试验场，不连接正式站接口或学习数据。**当前重点：v22 工作台七项个人工具截图预览**。部分脊柱成果已接入正式站，本仓库仍只提供示例体验，不能当作正式站的当前副本。

## 当前预览

| 入口                                      | 状态与范围                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| [工作台](workstation/)                    | 原创三维桌面、七项个人工具截图、专注试用、便笺、东京环境光。当前重点。 |
| [脊柱复习区](recall.html?i=1&workbench=1) | v17 容量方案；200 条可浏览术语，只有 8 个示例单词可实际练习。          |
| [长笔记](recall.html?i=2&workbench=1)     | 目录、长文、公式与宽表格范本。                                         |
| [实验室 ⇄ 脊柱](recall.html?region=lab)   | 原竖井过渡预览；实验室为旧版截图占位，正式站后来已有优化。             |
| [星空](preview/starfield/?from=catalog)   | 银河、行星与东京天象，不含学习功能。                                   |
| [历史与模型](preview/)                    | round-0、round-1、紧凑仪器屏与有机脊柱模型。                           |

工作台使用真实三维几何与 DOM 界面，没有把概念图作为整页背景。希可本体与个人工具正式接线留待后续。

**v23 动画（露娜）**：

- **区域竖井**：三个区域像一栋楼的三层（2F 工作台、1F 实验室、B1 复习区），从「前往区域」切换时坐同一条竖井，右侧有楼层表。
- **纸飞机**：点窗台上的纸飞机，它一路变成飞行者一号、双螺旋桨客机、喷气客机、航天飞机、运载火箭，最后飞进星空。这段飞行也是星空页的载入画面。
- **平板开机**：点平板，屏幕在真实的四个角里亮起，再展开成个人终端。

说明见 [docs/region-motion.md](docs/region-motion.md)，给 Codex 的工作台修改清单见 [docs/workstation-feedback.md](docs/workstation-feedback.md)。

## 最新决定

- 工作台与实验室、脊柱共用深石墨、象牙白、钛金属、深色玻璃和细线排版。
- 采用克制的科研机构方向；有机与无机的结合集中在研究对象，房间保持理性、可用的结构。
- 原三种画风和固定布局线稿不再约束当前方案；历史稿仍保留并标记。
- 主站原电子环绕开场保留。沙盒新开场已移除，不重新接入。
- 未经单独安排，不把整个沙盒搬进正式站。

接手先读 [工作台范本与 v22 预览说明](docs/workstation-prototype.md)，资料目录见 [docs/](docs/)。v22 在平板加入课表、番茄钟、餐盘、日历、每周论文、Seeko 和特蕾莎陪学的静态截图；可从休息位与手记进入相关预览。保留 v21 布局、器物细节与云层窗景，未接正式工具逻辑或数据。

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
- `check:pulse`、`check:experience`、`check:terminal`：已有脊柱交互与几何检查。
- `scripts/smoke/` 是早期调试脚本，部分断言过时，不作为当前验收结论。

工作台参数：`?motion=0` 关闭动效；`?light=day`、`dusk`、`night` 临时预览时段；`?view=fallback` 查看无 WebGL 回退。默认读取东京时间，始终保持深色外壳。

## 文件位置

| 路径                             | 用途                                               |
| -------------------------------- | -------------------------------------------------- |
| `index.html`、`sandbox/`         | 目录与旧链接兼容，不启动三维场景                   |
| `workstation/`                   | 工作台场景、物件、界面与环境光                     |
| `recall.html`、`recall-*.js/css` | 已有复习区，保留脚本路径                           |
| `preview/`                       | 星空、模型与冻结预览                               |
| `docs/`                          | 说明、截图、历史记录；旧 README 在 `docs/history/` |
| `assets/`、`models/`、`vendor/`  | 原创资源、模型与带许可的依赖                       |
| `scripts/`                       | 验证、模型构建与历史调试                           |

旧的 `/?i=1&v=13`、`/?workbench=1&i=1&v=17`、`/?region=lab`、`/?motion=0` 继续进入复习范本并保留参数。裸地址打开目录。冻结预览路径均保留。

## 来源与许可

- 原创代码与模型采用 MIT（见 LICENSE）。three.js r170 的 MIT 许可在 `vendor/three/LICENSE`，Inter 的 OFL 许可在 `assets/fonts/Inter-LICENSE.txt`。
- 初始脊柱版式参考 [rhine-lab-art](https://github.com/reverieach/rhine-lab-art) 的构思，未使用其未授权代码、模型、图像或标志。
- 工作台为原创程序几何、纹理与内容，莱茵生命仅作为美术气质参照。两幅墙画使用内置 imagegen 原创生成，[资产与完整提示词](workstation/art/README.md) 已归档。
- 星空贴图来源见 [NASA-imagery.md](preview/starfield/NASA-imagery.md)。

历史详情见 [v17 之前的完整记录](docs/history/review-sandbox-v17.md)。历史版本状态和接入意见，以用户最新决定为准。

个人工具截图及既有角色图来源见 [预览资产说明](workstation/previews/README.md)。
