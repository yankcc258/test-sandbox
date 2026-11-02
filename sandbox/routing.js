// 保留 v13–v17 的根路径分享链接。裸地址现在展示沙盒目录。
export function legacyDestination(search) {
  const params = new URLSearchParams(search);
  if (params.get('region') === 'cabin' || params.get('region') === 'workstation')
    return 'workstation/';
  if (['i', 'region', 'motion', 'workbench'].some((key) => params.has(key))) return 'recall.html';
  const version = Number(params.get('v'));
  return params.has('v') && version > 0 && version <= 17 ? 'recall.html' : null;
}
