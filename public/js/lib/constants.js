export const STAGES = [
  { id: 'planned', label: 'Planned', hint: 'An idea with a week' },
  { id: 'scripted', label: 'Scripted', hint: 'Script written and tested' },
  { id: 'recorded', label: 'Recorded', hint: 'Screen and voice recorded' },
  { id: 'edited', label: 'Edited', hint: 'Final cut exported' },
  { id: 'thumbnail', label: 'Thumbnail', hint: 'Title and thumbnail done' },
  { id: 'scheduled', label: 'Scheduled', hint: 'Uploaded and set to publish' },
  { id: 'published', label: 'Published', hint: 'Live on YouTube' },
];
export const stageIndex = (id) => STAGES.findIndex((s) => s.id === id);
export const stageLabel = (id) => (STAGES[stageIndex(id)] || STAGES[0]).label;

export const FORMATS = ['Long', 'Short', 'Series', 'Community', 'Setup'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const PUBLISH_DAYS = [
  { v: 1, label: 'Wednesday' }, { v: 2, label: 'Thursday' }, { v: 3, label: 'Friday' },
  { v: 4, label: 'Saturday' }, { v: 5, label: 'Sunday' }, { v: 6, label: 'Monday' },
];

// One colour per series so a video is recognisable at a glance.
export function seriesColor(series) {
  const t = (series || '').toLowerCase();
  if (t.startsWith('ai')) return 'var(--s-ai)';
  if (t.startsWith('computer')) return 'var(--s-pc)';
  if (t.startsWith('google')) return 'var(--s-gw)';
  if (t.startsWith('web')) return 'var(--s-web)';
  if (t.startsWith('community')) return 'var(--s-com)';
  return 'var(--mist)';
}
