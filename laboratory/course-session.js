import { getCourse, gradeAnswer } from './course-data.js?v=36';

const copyDraft = (value) => (Array.isArray(value) ? [...value] : value);

// Each instance belongs to one pinned course. Reading is an explicit action,
// independent of grading. Everything is discarded when the page is reloaded.
export function createCourseSession(courseId = 'math-partials') {
  const course = getCourse(typeof courseId === 'string' ? courseId : courseId?.id);
  if (!course) throw new RangeError('Unknown course');
  const questions = new Map(course.questions.map((question) => [question.id, question]));
  const drafts = new Map();
  const results = new Map();
  let read = false;

  function summary() {
    return {
      checked: results.size,
      correct: [...results.values()].filter((result) => result.correct).length,
      total: course.questions.length,
    };
  }

  return {
    setDraft(id, value) {
      if (!questions.has(id)) return false;
      drafts.set(id, copyDraft(value));
      results.delete(id);
      return true;
    },
    getDraft(id) {
      return copyDraft(drafts.get(id));
    },
    getResult(id) {
      const result = results.get(id);
      return result ? { ...result } : undefined;
    },
    check(question) {
      const id = typeof question === 'string' ? question : question?.id;
      const canonical = questions.get(id);
      const result = gradeAnswer(canonical, copyDraft(drafts.get(id) ?? ''));
      if (canonical && result.status !== 'invalid') results.set(id, { ...result });
      return { ...result };
    },
    summary,
    progress() {
      return {
        read,
        ...summary(),
        results: course.questions.map(
          (question) => results.get(question.id)?.status ?? 'unanswered',
        ),
      };
    },
    setRead(value) {
      const next = Boolean(value);
      const changed = next !== read;
      read = next;
      return changed;
    },
    reset() {
      // Practice reset does not silently revoke the independent reading mark.
      drafts.clear();
      results.clear();
    },
  };
}

// Directory and workspace share this page-local registry. Returning snapshots
// prevents a consumer from changing another course's progress or visit history.
export function createCourseSessions({ now = () => Date.now() } = {}) {
  const sessions = new Map();
  const visits = [];
  function get(id) {
    if (!getCourse(id)) return null;
    if (!sessions.has(id)) sessions.set(id, createCourseSession(id));
    return sessions.get(id);
  }
  return {
    get,
    getProgress(id) {
      return get(id)?.progress() ?? { read: false, checked: 0, correct: 0, total: 0, results: [] };
    },
    getVisits(id) {
      return visits
        .filter((visit) => id === undefined || visit.id === id)
        .map((visit) => ({ ...visit }))
        .reverse();
    },
    recordVisit(id, action) {
      if (!getCourse(id) || !['details', 'study'].includes(action)) return null;
      const visit = { id, action, time: now() };
      visits.push(visit);
      return { ...visit };
    },
  };
}

export function compareExample(dx, dy) {
  if (![dx, dy].every(Number.isFinite)) throw new TypeError('Finite increments required');
  const differential = 12 * dx + 4 * dy;
  const exact = (2 + dx) ** 2 * (3 + dy) - 12;
  return { differential, exact, error: differential - exact };
}
