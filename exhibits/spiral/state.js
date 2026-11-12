import { DISCIPLINES } from './course-data.js?v=1';
export const initialState = (disciplines = DISCIPLINES) => ({
  stage: 'overview',
  discipline: disciplines[0]?.id ?? null,
  mode: 'surface',
  probe: 0.35,
  chapter: null,
});
export function reduceState(state, action) {
  switch (action.type) {
    case 'activate':
      return {
        ...state,
        stage:
          state.stage === 'overview' ? 'focus' : state.stage === 'focus' ? 'observe' : state.stage,
      };
    case 'observe':
      return { ...state, stage: 'observe' };
    case 'discipline':
      return {
        ...state,
        discipline: action.id,
        chapter: null,
        stage:
          state.stage === 'overview' ? 'focus' : state.stage === 'lesson' ? 'observe' : state.stage,
      };
    case 'select':
      return {
        ...state,
        stage: 'observe',
        discipline: action.chapter.discipline ?? state.discipline,
        chapter: action.chapter.id,
        probe: action.probe ?? state.probe,
      };
    case 'clear':
      return { ...state, stage: 'observe', chapter: null };
    case 'back':
      return {
        ...state,
        stage: state.stage === 'lesson' ? 'observe' : 'overview',
        chapter: state.stage === 'lesson' ? state.chapter : null,
      };
    case 'chapter':
      return {
        ...state,
        stage: 'lesson',
        discipline: action.chapter.discipline ?? state.discipline,
        mode: action.chapter.mode,
        chapter: action.chapter.id,
        probe: action.probe ?? state.probe,
      };
    case 'mode':
      return ['surface', 'tangent', 'section'].includes(action.mode)
        ? { ...state, mode: action.mode }
        : state;
    case 'probe':
      return Number.isFinite(action.value) ||
        (action.value &&
          typeof action.value === 'object' &&
          !Array.isArray(action.value) &&
          Object.keys(action.value).length > 0 &&
          Object.values(action.value).every(Number.isFinite))
        ? { ...state, probe: typeof action.value === 'object' ? { ...action.value } : action.value }
        : state;
    default:
      return state;
  }
}
export function sceneTargets(stage) {
  return {
    focus: stage === 'focus' ? 1 : 0,
    spread: stage === 'observe' || stage === 'lesson' ? 1 : 0,
  };
}
export function approach(value, target, seconds, rate = 6) {
  const result =
    value + (target - value) * (1 - Math.exp(-Math.max(0, Math.min(seconds, 0.06)) * rate));
  return Math.abs(result - target) < 0.0005 ? target : result;
}
export function tokyoMood(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  return hour >= 6 && hour < 16 ? 'day' : hour >= 16 && hour < 19 ? 'dusk' : 'night';
}
