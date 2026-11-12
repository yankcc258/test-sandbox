# 戴森球内景蓝本

`concept-v1.png` 为 2026-11-12 使用内置 `image_gen` 工具生成的概念图，模式：全新生成 / stylized-concept，无参考图片、无透明背景。Yank 随后确认“这个太酷了，按照这个来进行蓝本吧”，选定为本展品基准。

原始生成文件保存在本机 Codex 的 `generated_images` 目录；此处复制选定原图，未覆盖原件。PNG 作为静态回退图和 WebGL 投射纹理使用。它是生成的艺术设想，不是实拍、NASA 影像、科学计算结果或三维模型渲染输出。

## 最终生成提示词

```text
Use case: stylized-concept. Asset type: one cinematic concept still for an immersive astronomy website, widescreen 16:9 composition. Primary subject: THE INTERIOR OF A DYSON SPHERE, a fictional stellar-scale engineered spherical shell enclosing a living star. The emotional priority is overwhelming architectural scale, solitude, awe, and the feeling of standing INSIDE a structure larger than worlds. Camera is at a tiny observation and maintenance platform attached to the inner shell, looking inward toward the star. A minute solitary observer at the near platform railing provides scale, extremely small, almost lost in the bottom edge. The near structure is cropped by the frame: an immense dark collector buttress / thick panel edge sweeps from the upper left across part of the view and occludes a portion of the stellar disk. The star is luminous amber-white, off-center, its surface alive with finely detailed granulation and vast plasma prominences, bright but with preserved highlight texture. Across the upper and right expanses, the concave inner surface of the SPHERICAL shell bends away into immense distance, densely assembled from staggered continent-sized collector plates, structural ribs, deep service trenches and layered apertures. Repeating geometry diminishes to an almost imperceptible texture toward the far side: nested scales, kilometers to astronomical distances. A viewer must immediately understand this is a vast spherical enclosure with a star INSIDE, not rings floating around a planet. Near collector surfaces feel unbelievably massive, dark graphite ceramic and brushed titanium, subtle aged seams, restrained icy blue service lights and physically coherent golden grazing reflections from the star. Preserve deep blacks and recognizable silhouette layers; use crisp local detail, soft far-distance separation, nuanced filmic HDR tonality, subtle optical bloom restricted to the star's bright edge, minimal flare. The little platform has no busy UI, no cockpit dashboard, no dominant human character. Premium realistic cinematic VFX environment concept art, IMAX-like scale and carefully composed negative space, asymmetric composition, no decorative sci-fi neon clutter. Avoid exterior views of a complete sphere, avoid a miniature Dyson ball sitting in space, avoid a solar-system diagram, avoid a Saturn-like ring, avoid concentric halo hoops, avoid a generic space station, avoid toy plastic, cartoon illustration, wireframe grids, oversaturated orange haze, blown-out white screen, gratuitous laser beams. No typography, no logos, no watermark. This is a new concept image, not a modification of previous black hole or nebula images.
```

提示词里的 HDR 描述指视觉风格。交付 PNG 是普通图像素材，本展品没有因此声称具备黑洞渲染器的浮点 HDR 管线。


## 第二版隐藏背景 · 2026-11-12

`interior-clean-v2.png`：以内置 `image_gen` 编辑 `concept-v1.png`，移除近处斜向构件、栈道、栏杆和人物，补全原先被遮挡的恒星与远处内壁。只在空间横移后露出的区域使用，原图仍为主体材质和无图形支持时的静态回退。保持原生成文件，本仓库保存独立副本。使用模式为编辑；输入仅为已确认原图；不透明输出。

最终编辑提示词：

```text
Edit the provided image to produce a clean background plate for a layered 3D camera projection. Preserve the exact camera, framing, exposure, amber palette, surface detail and ALL already-visible star and distant concave Dyson sphere interior panels, pixel alignment as closely as possible. Remove ONLY the enormous dark diagonal foreground buttress covering the left/top, and remove the bottom foreground observation balcony, railing and tiny human. Inpaint the removed areas by extending the existing solar disk and its orange-white plasma detail behind the diagonal buttress, and by extending the curved distant panel wall behind the balcony. The star stays at exactly its existing center and radius; the rightmost solar limb stays in the same position. Do not move, enlarge, shrink or redesign the star or the distant wall. No nearby architecture or humans remain. The dark area behind the removed upper-left buttress should be the more distant interior surface with restrained lighting, continuous with the concave interior at upper center. Do not add beams, floating rocks, ships, rings, other planets, text or UI. This is a technical clean plate for revealing just narrow areas during small camera shifts, not a new composition. Keep the wide aspect ratio of the reference. Opaque background.
```
