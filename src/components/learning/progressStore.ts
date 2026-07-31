export type ProgressState = {
  completedLessons: string[];
  bookmarks: string[];
  lastVisited?: string;
  completedLabs: string[];
  interviewAttempted: string[];
  weakTopics: string[];
  troubleshootingCompleted: string[];
};

const KEY = 'nvidia-sa-academy.progress.v1';
export const emptyProgress: ProgressState = {
  completedLessons: [], bookmarks: [], completedLabs: [], interviewAttempted: [], weakTopics: [], troubleshootingCompleted: [],
};

export const progressStore = {
  load(): ProgressState {
    if (typeof window === 'undefined') return emptyProgress;
    try { return {...emptyProgress, ...JSON.parse(localStorage.getItem(KEY) || '{}')}; }
    catch { return emptyProgress; }
  },
  save(state: ProgressState) {
    if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('academy-progress'));
  },
  toggle<K extends keyof ProgressState>(key: K, value: string) {
    const state = this.load();
    const current = state[key];
    if (!Array.isArray(current)) return state;
    const values = current as string[];
    (state[key] as string[]) = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
    this.save(state);
    return state;
  },
  add<K extends keyof ProgressState>(key: K, value: string) {
    const state = this.load();
    const current = state[key];
    if (Array.isArray(current) && !(current as string[]).includes(value)) {
      (state[key] as string[]) = [...(current as string[]), value];
      this.save(state);
    }
    return state;
  },
  visit(route: string) {
    const state = this.load();
    state.lastVisited = route;
    this.save(state);
  },
};
