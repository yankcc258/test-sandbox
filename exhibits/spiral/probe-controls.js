// Reuse the same controls in the course observer and the specimen gallery.
// Keep input nodes during a drag so focus and pointer capture survive rendering.
export function mountProbeControls(root, onChange, prefix = 'probe') {
  let signature = '',
    nodes = [],
    current = null,
    named = false;
  return {
    update(model, value) {
      const m = model.metadata;
      named = !!m.controls;
      current = named ? model.data.parameters : (value ?? m.probeDefault);
      const controls =
        m.interactive === false
          ? []
          : m.controls || [
              {
                name: 'value',
                label: m.probeLabel,
                min: m.probeMin,
                max: m.probeMax,
                step: m.probeStep,
                default: m.probeDefault,
                value: current,
              },
            ];
      const next = JSON.stringify(controls.map(({ value, ...schema }) => schema));
      if (next !== signature) {
        signature = next;
        nodes = controls.map((control, index) => {
          const row = document.createElement('div');
          row.className = 'probe-control';
          const heading = document.createElement('div');
          heading.className = 'probe-heading';
          const label = document.createElement('label');
          const output = document.createElement('output');
          const input = document.createElement('input');
          input.type = 'range';
          input.className = 'probe-input';
          input.id = index ? `${prefix}-${control.name}` : prefix;
          label.htmlFor = input.id;
          label.textContent = control.label;
          output.setAttribute('for', input.id);
          output.className = 'probe-value';
          for (const key of ['min', 'max', 'step']) input[key] = control[key];
          input.oninput = () =>
            onChange(
              named ? { ...current, [control.name]: Number(input.value) } : Number(input.value),
            );
          heading.append(label, output);
          const limits = document.createElement('div');
          limits.className = 'probe-limits';
          limits.setAttribute('aria-hidden', 'true');
          for (const bound of [control.min, control.max]) {
            const span = document.createElement('span');
            span.textContent = bound;
            limits.append(span);
          }
          row.append(heading, input, limits);
          return { row, input, output };
        });
        root.replaceChildren(...nodes.map(({ row }) => row));
      }
      root.hidden = !controls.length;
      controls.forEach((control, i) => {
        const value = named ? current[control.name] : current;
        nodes[i].input.value = value;
        nodes[i].input.setAttribute('aria-valuetext', `${control.label} ${value}`);
        nodes[i].output.textContent = Number(Number(value).toFixed(6));
      });
    },
  };
}
