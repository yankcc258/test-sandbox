// Geometry consumes counts and normalized positions, never subject names.
export function sectorAt(index, count, sectors) {
  if (count < 1 || sectors < 1) return -1;
  return Math.min(sectors - 1, Math.max(0, Math.floor((index / count) * sectors)));
}
export function sectorCenter(index, count) {
  return count > 0 ? (Math.max(0, Math.min(count - 1, index)) + 0.5) / count : 0.5;
}
export function layoutSectors(disciplines) {
  const step = (2 * Math.PI) / Math.max(1, disciplines.length);
  return disciplines.map((d, i) => {
    const start = i * step + step * 0.08,
      end = (i + 1) * step - step * 0.08;
    const count = Math.max(1, d.planned?.length || d.tracks?.length || 0);
    return {
      id: d.id,
      start,
      end,
      directions: Array.from(
        { length: count },
        (_, j) => start + ((end - start) * (j + 0.5)) / count,
      ),
    };
  });
}
