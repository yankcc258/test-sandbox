// Original layout specimen, not an imported personal note or a completed study record.
export function createReadingWorkbench() {
  const root = document.createElement('div');
  root.className = 'wb wb-reading';
  const headings = [
    '记录目的与阅读顺序',
    '实验记录表',
    '计算与原始记录',
    '观察、解释与待验证项',
    '结论与适用边界',
    '下一次回想',
  ];
  root.innerHTML = `<nav class="wb-rail" aria-label="笔记目录"><div class="wb-rail-heading"><span>03 / ASSOCIATION</span><strong>关联路径</strong></div><div class="wb-tabs">${headings.map((t, i) => `<button type="button" data-section="${i}"><small>0${i + 1}</small><span>${t}</span></button>`).join('')}</div><p class="wb-rail-foot">长文阅读 · 排版样例</p></nav>
    <div class="wb-main" tabindex="0" aria-label="笔记正文"><article class="wb-article"><header><small class="wb-kicker">LAB NOTES / READING SPECIMEN</small><h3>实验记录与误差整理</h3><p class="wb-article-lead">把过程、观察和推论分开，给下一次回想留下足够的线索。</p><div class="wb-article-meta"><span>排版样例</span><span>6 个章节</span><span>含长文、表格与代码块</span></div></header>
    <section id="wb-note-0"><h4>01 / ${headings[0]}</h4><p>一份实验笔记需要同时回答两个问题：当时做了什么，以及现在怎样理解它。阅读时，先找到目标与条件，再沿记录回到每一次具体操作，最后检查结论是否被已有的观察支持。</p><p>这里是一份用于检验阅读空间的原创样例，表中的数值仅作排版占位，不代表实际实验结果。长段落、完整表格、公式和原始记录都保留在正文中，不必缩小字体，也不需要把每一段内容拆成独立玻璃卡片。</p><blockquote>先描述可以直接观察的内容，再写自己的解释。尚未验证的解释，保留为下一次要回答的问题。</blockquote><p>目录一直留在侧边。进入正文后，脊柱退到阅读空间之外，系统编号、材质和细线仍延续入口的视觉语言。返回时，再沿同一块玻璃屏回到原来的系统位置。</p></section>
    <section id="wb-note-1"><h4>02 / ${headings[1]}</h4><p>下面的表格用于检查较宽内容的承载方式。桌面优先完整显示；手机只让表格本身横向滚动，正文仍按屏幕宽度换行。</p><div class="wb-table-scroll" tabindex="0" aria-label="示例实验记录表，可横向滚动"><table><caption>表 1 · 排版示例，非实际实验数据</caption><thead><tr><th>记录编号</th><th>样品名称</th><th>记录值 A</th><th>记录值 B</th><th>环境与观察</th><th>后续处理</th></tr></thead><tbody>${[
      ['A-01', '样品一', '0.128', '0.132', '记录起始条件，保留仪器原始读数。', '待核对'],
      ['A-02', '样品二', '0.241', '0.238', '发现两次读数有差异，先记录现象。', '重新测量'],
      ['A-03', '样品三', '0.362', '0.360', '保存完整记录，与同组条件一起比较。', '整理记录'],
      ['A-04', '对照样品', '0.019', '0.021', '明确标注对照与样品的区别。', '保留对照'],
    ]
      .map((row) => `<tr>${row.map((t) => `<td>${t}</td>`).join('')}</tr>`)
      .join(
        '',
      )}</tbody></table></div><p>表格旁的解释应指出数据如何被使用。若某次记录出现异常，保留原始数值与处理理由，比直接覆盖成一个“更合理”的值更有助于之后的复核。</p></section>
    <section id="wb-note-2"><h4>03 / ${headings[2]}</h4><p>推导与计算需要足够的行宽，同时保持适合阅读的正文长度。短公式可以单独列出，长命令或文件路径放进独立的横向滚动区域。</p><div class="wb-equation" aria-label="平均值等于各次记录之和除以次数">x̄ = (x₁ + x₂ + ··· + xₙ) / n</div><p>公式附近写清楚符号、单位与记录来源。不要让读者为了找一个条件反复跳到另一页；辅助说明可以放在同一阅读面上，较长的原始材料则按需展开。</p><pre tabindex="0" aria-label="原始记录示例"><code>record:
  source: laboratory/notebooks/measurement-series/reference-sample/session-01/raw-observation-data.csv
  status: layout-example
  original_values: preserved
  next_step: compare_conditions_before_interpretation</code></pre><p>原始记录中的长路径会超出普通段落宽度，这是刻意保留的容量检验。它应当只在自己的区域滚动，不把整块工作台撑到视口之外。</p></section>
    <section id="wb-note-3"><h4>04 / ${headings[3]}</h4><p>同一个现象可能有不同解释。整理笔记时，可以按“观察到什么—怎样解释—还缺哪些证据”的顺序写成连续段落，让结论与证据之间的关系清楚可见。</p><p>例如，两次读数不同是观察；认为差异来自某个操作步骤是一种解释；需要核对操作记录或补充对照，则是后续验证。这里不替实验做判断，而是让尚未完成的判断有明确的位置。</p><ul><li>观察：保留发生时间、条件和直接记录。</li><li>解释：指出依据，同时写出可能的其他解释。</li><li>待验证：列出下一次需要比较的条件与资料。</li></ul><p>如果一个解释只能在特定条件下成立，将条件放在解释附近。后续复习时，可以先遮住解释，尝试仅凭记录重新组织思路，再与原文核对。</p></section>
    <section id="wb-note-4"><h4>05 / ${headings[4]}</h4><p>结论应该回到最初的记录目的。哪些问题已有支持，哪些仍有不确定性，分别写清楚。把范围限定在本次材料能够支持的程度，比把所有问题压缩成一句话更便于复习。</p><p>同一工作台也可以承载主站已有的笔记标签、属性、反向链接与原始 Markdown。这些辅助材料留在右侧栏，正文保持连续；窄屏时转为正文后的可展开资料区。</p><details class="wb-raw"><summary>查看补充记录与原始段落</summary><p>这一段用于验证折叠内容展开后，阅读区可以继续向下延伸。页头、目录与返回位置保持稳定，正文无需切换到另一套视觉风格。</p><p>本样例没有导入、编辑、出题或保存功能，也不会生成复习成果。</p></details></section>
    <section id="wb-note-5"><h4>06 / ${headings[5]}</h4><p>读完以后，用几个具体问题检查自己能否重建笔记的逻辑：</p><ol><li>这份记录最初要回答什么问题？</li><li>哪一条观察支撑了主要解释？</li><li>还缺什么证据，才可以排除另一种解释？</li><li>如果条件改变，哪些结论需要重新检查？</li></ol><p>在正式站接入时，原有的笔记检查、生成测验和引用来源仍使用主站逻辑；这一轮先确认长内容在同一材质和空间中可以舒适地读完。</p></section>
    </article></div>
    <aside class="wb-context"><small class="wb-kicker">DOCUMENT / 资料</small><h4>阅读附页</h4><dl><div><dt>类型</dt><dd>排版样例</dd></div><div><dt>系统</dt><dd>神经丛</dd></div><div><dt>内容</dt><dd>长文与宽表格</dd></div></dl><div class="wb-tags"><span>实验记录</span><span>误差整理</span><span>主动回忆</span></div><p class="wb-footnote">这里预留主站的标签、属性与反向链接，正文保持独立行宽。</p></aside>`;
  const main = root.querySelector('.wb-main');
  const mobileContext = document.createElement('details');
  mobileContext.className = 'wb-mobile-context';
  mobileContext.innerHTML =
    '<summary>资料与关联</summary>' + root.querySelector('.wb-context').innerHTML;
  main.append(mobileContext);
  root.querySelectorAll('[data-section]').forEach(
    (button) =>
      (button.onclick = () => {
        const section = root.querySelector(`#wb-note-${button.dataset.section}`);
        main.scrollTo({
          top:
            section.getBoundingClientRect().top -
            main.getBoundingClientRect().top +
            main.scrollTop -
            24,
          behavior: document.body.classList.contains('still') ? 'auto' : 'smooth',
        });
        root.querySelectorAll('[data-section]').forEach((b) => b.removeAttribute('aria-current'));
        button.setAttribute('aria-current', 'location');
      }),
  );
  return root;
}
