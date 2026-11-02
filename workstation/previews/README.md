# 工作台个人工具截图 · v22

这是一组用于沙盒排布讨论的静态界面设计稿。工作台只加载 JPG，不嵌入或执行截图源页面；图内按钮、输入框、计数和对话均不能操作。

## 来源与内容边界

以 `yankcc258/yank-study-lab` 的 `56c527d` 为结构参考：

| 预览         | 参考模块                 | 内容                            |
| ------------ | ------------------------ | ------------------------------- |
| 课表与出席   | src/planner.js           | 周课表、出席、作业              |
| 番茄钟       | src/pomo.js              | 25 / 5 / 15 分钟与每 4 轮长休息 |
| 餐盘与锻炼   | src/health.js            | 餐次、饮水、活动                |
| 学习日历     | src/calendar.js          | 月视图与当天条目                |
| 每周论文     | src/papers.js            | 阅读方向、摘要、收藏            |
| Seeko · 希可 | src/seeko.js、src/pet.js | 学习、日程、聊天、衣柜          |
| 特蕾莎的陪学 | src/wolf.js              | 目录、阅读、思考题与答案        |

文字、记录及示例数值为本轮展示内容。论文标题只是版式占位，不冒充真实文献；陪学段落为原创示例。未复制用户的实际课程表、饮食健康资料或聊天记录。截图标注“界面预览 · 示例内容”。

角色图来自同一正式仓库的既有资产，保持原样：

- `assets/seeko-read.webp` ← `art/pet/maid/read.webp`
- `assets/theresa.png` ← `src/wolf-avatar.png`

## 重现截图

在仓库根目录启动静态 HTTP 服务，打开 `workstation/previews/source.html?tool=ID`。`ID` 为 schedule / pomodoro / meals / calendar / papers / seeko / theresa。

- 桌面：CSS 视口宽 1120 px，页面完整内容高度。
- 手机：CSS 视口宽 390 px，页面完整内容高度；布局在 600 px 切换。
- 2026-11-02 用 Chrome 浏览器直接截图，保存为 `ID-desktop.jpg` 与 `ID-mobile.jpg`。源文件为 source.html / source.css / source.js；引用本地 Inter 字体和上述角色图。
- 截图总览由 `../tools.js` 定义，运行时使用 picture 在 699 px 及以下选用手机图。仅打开选中的图片，不加载所有预览。

原有“专注试用”和“随手记”依旧是页面内可用的独立范本功能，和这些截图区分。
