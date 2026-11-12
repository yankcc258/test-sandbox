// Small, deterministic fixtures shared by the scientific observation models.
// They attach to the display geometry; they never redefine scientific samples.
const H = {
  titanium: '#b9c0c2',
  edge: '#8e9a9c',
  core: '#4a5555',
  ceramic: '#d6d3ca',
  recess: '#263131',
  rubber: '#252c2b',
};

export function createModelDetails(model) {
  const piece = (position, scale, color, role, rotation = [0, 0, 0], part) => {
    const pose = model.box(position, scale, color, rotation, role);
    if (part) pose.part = part;
    return pose;
  };
  const metal = (p, s, color = H.titanium, rotation, part) =>
    piece(p, s, color, 'hardware-metal', rotation, part);
  const ceramic = (p, s, rotation, part) =>
    piece(p, s, H.ceramic, 'hardware-ceramic', rotation, part);
  const rubber = (p, s) => piece(p, s, H.rubber, 'hardware-rubber', undefined, 'ground-pad');
  // Faces are deliberately shallow, with a separate dark driver slot. Their
  // two surfaces meet; no floating decal or coplanar face is needed.
  const screw = (point, axis = 'y', size = 0.028) => {
    const index = axis === 'y' ? 1 : 2;
    const depth = 0.009;
    const head = [...point],
      slot = [...point],
      headSize = [size, size, size],
      slotSize = [size * 0.62, size * 0.13, size * 0.13];
    head[index] += depth / 2;
    slot[index] += depth + 0.0008;
    headSize[index] = depth;
    slotSize[index] = 0.0016;
    piece(head, headSize, H.titanium, 'hardware-fastener');
    piece(slot, slotSize, H.recess, 'hardware-recess');
  };

  function foot(level = -1.28) {
    metal([0, level, -0.09], [2.92, 0.052, 0.23], H.core);
    metal([0, level + 0.038, -0.09], [2.74, 0.024, 0.18]);
    ceramic([0, level + 0.05, -0.075], [2.34, 0.012, 0.105]);
    piece([0, level + 0.041, 0.005], [2.5, 0.008, 0.012], H.recess, 'hardware-recess');
    metal([0, level - 0.005, 0.034], [2.78, 0.03, 0.018], H.edge);
    metal([0, level - 0.035, -0.09], [2.82, 0.018, 0.2], H.edge);
    for (const x of [-1.44, 1.44]) {
      metal([x, level, -0.09], [0.055, 0.065, 0.255]);
      screw([x, level + 0.0325, -0.09], 'y', 0.025);
    }
    for (const x of [-1.22, 1.22]) {
      metal([x, level - 0.083, -0.09], [0.31, 0.048, 0.44], H.edge);
      rubber([x, level - 0.113, -0.09], [0.255, 0.012, 0.365]);
      metal([x, level - 0.046, -0.09], [0.13, 0.045, 0.19]);
      metal([x, level - 0.025, -0.09], [0.205, 0.018, 0.225], H.core);
      for (const z of [-0.265, 0.085]) screw([x, level - 0.059, z]);
    }
    return { top: level + 0.056, contactY: level - 0.119 };
  }

  // A rear standoff meets a curve's actual back face. The front remains clear
  // for the equation, tangent, marker, and construction lines.
  function rearSupport(point, backFace, baseTop, backZ = -0.15) {
    const [x, y] = point;
    const rear = backFace - 0.012;
    metal([x, baseTop + 0.012, backZ], [0.2, 0.024, 0.16], H.edge);
    for (const side of [-1, 1]) screw([x + side * 0.072, baseTop + 0.024, backZ]);
    model.line(
      [x, baseTop + 0.024, backZ],
      [x, y, backZ],
      0.034,
      H.titanium,
      0.046,
      'hardware-metal',
    );
    metal([x, baseTop + 0.058, backZ], [0.085, 0.046, 0.09]);
    metal([x, y - 0.035, backZ], [0.068, 0.07, 0.072], H.edge);
    model.line([x, y, backZ], [x, y, rear], 0.037, H.titanium, 0.044, 'hardware-metal');
    ceramic([x, y, backFace - 0.006], [0.095, 0.06, 0.012]);
    screw([x, y - 0.035, backZ + 0.036], 'z', 0.023);
  }

  // Lower rails follow the depth of the partial surface. Small end feet share
  // the base's contact height, so the spatial specimen has a stable footprint.
  function depthRail(x, level = -1.28) {
    metal([x, level - 0.025, 0], [0.11, 0.05, 2.18], H.edge);
    for (const z of [-0.99, 0.99]) {
      metal([x, level - 0.083, z], [0.19, 0.048, 0.24], H.edge);
      metal([x, level - 0.0545, z], [0.115, 0.025, 0.16]);
      rubber([x, level - 0.113, z], [0.155, 0.012, 0.205]);
    }
  }

  // `point` is the middle of one actual straight scan segment, and angle its
  // slope. The ceramic saddle follows that segment's lower face precisely.
  function surfaceSupport(point, angle, railTop) {
    const normal = [-Math.sin(angle), Math.cos(angle), 0];
    const pad = point.map((v, i) => v - normal[i] * 0.021);
    const plate = point.map((v, i) => v - normal[i] * 0.039);
    const stem = point.map((v, i) => v - normal[i] * 0.048);
    const rotation = [0, 0, angle];
    const contact = ceramic(pad, [0.12, 0.018, 0.12], rotation, 'surface-contact');
    contact.contactPoint = [...point];
    metal(plate, [0.145, 0.018, 0.135], H.edge, rotation);
    const mountY = railTop + 0.024;
    model.line([stem[0], mountY, stem[2]], stem, 0.033, H.titanium, 0.043, 'hardware-metal');
    metal([stem[0], stem[1] - 0.024, stem[2]], [0.064, 0.048, 0.069]);
    metal([stem[0], railTop + 0.012, stem[2]], [0.155, 0.024, 0.17], H.edge);
    for (const side of [-1, 1]) screw([stem[0], mountY, stem[2] + side * 0.059], 'y', 0.024);
  }

  function probabilityChannel(x, bottom, height, baseTop) {
    const z = -0.098;
    for (const side of [-1, 1])
      metal([x + side * 0.177, bottom + height / 2, z], [0.025, height + 0.08, 0.048], H.edge);
    for (const y of [bottom - 0.025, bottom + height + 0.025]) {
      metal([x, y, z], [0.38, 0.035, 0.055]);
      for (const side of [-1, 1]) screw([x + side * 0.168, y, z + 0.0275], 'z', 0.024);
    }
    model.line([x, baseTop, z], [x, bottom - 0.0425, z], 0.055, H.titanium, 0.08, 'hardware-metal');
    metal([x, baseTop + 0.024, z], [0.17, 0.048, 0.145], H.edge);
  }

  return { foot, rearSupport, depthRail, surfaceSupport, probabilityChannel };
}
