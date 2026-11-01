# NASA 图像（`textures/`）

观星台的星体贴图和背景星图都来自 NASA 公开发布的图像。NASA 的图像一般不受版权保护，可以用于教育和个人用途；按 NASA 的媒体使用指南，使用时不得暗示 NASA 为本网站背书，也不使用 NASA 的徽标。

| 文件 | 内容 | 来源 |
| --- | --- | --- |
| `earth.jpg` | Blue Marble Next Generation，2004 年 5 月，地形与海底地形 | NASA Earth Observatory；取自 NASA WorldWind 项目 `NASAWorldWind/WebWorldWind` 的 `images/BMNG_world.topo.bathy.200405.3.2048x1024.jpg` |
| `earth-night.jpg` | Black Marble 2012 夜间灯光（VIIRS Day/Night Band） | NASA Earth Observatory / NOAA；取自 `NASAWorldWind/WebWorldWind` 的 `images/dnb_land_ocean_ice_2012.png` |
| `mars.jpg`、`jupiter.jpg`、`saturn.jpg`、`venus.jpg` | 行星全球贴图 | NASA 3D Resources（`nasa/NASA-3D-Resources` 的 `Images and Textures/`） |
| `stars.jpg` | Tycho Star Map 全天星图 | NASA 3D Resources（`Images and Textures/Tycho Star Map/`），NASA Goddard Scientific Visualization Studio |

处理：缩放到 1024–2048 像素宽并重新压缩为 JPEG；土星和金星降低了饱和度，星图提高了亮度。没有加入其他内容。

水星、太阳和月球（Luna）没有找到可用的 NASA 全球贴图来源（本环境访问不到 NASA 官网），目前是知序原创的程序生成材质。

使用指南：https://www.nasa.gov/nasa-brand-center/images-and-media
