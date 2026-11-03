import { COURSE, gradeAnswer } from './course-data.js?v=32';

// Page-local drafts and latest checked answers. No persistence or API calls.
export function createCourseSession() {
  const drafts = new Map(),
    results = new Map();
  return {
    setDraft(id, value) {
      drafts.set(id, Array.isArray(value) ? [...value] : value);
      results.delete(id);
    },
    check(question) {
      const canonical = COURSE.questions.find((item) => item.id === question.id);
      const result = gradeAnswer(canonical, drafts.get(question.id) ?? '');
      if (result.status !== 'invalid') results.set(question.id, result);
      return result;
    },
    summary() {
      return {
        checked: results.size,
        correct: [...results.values()].filter((r) => r.correct).length,
        total: COURSE.questions.length,
      };
    },
    reset() {
      drafts.clear();
      results.clear();
    },
  };
}

export function compareExample(dx, dy) {
  if (![dx, dy].every(Number.isFinite)) throw new TypeError('Finite increments required');
  const differential = 12 * dx + 4 * dy;
  const exact = (2 + dx) ** 2 * (3 + dy) - 12;
  return { differential, exact, error: differential - exact };
}
