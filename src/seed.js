// The starting plan: 41 videos and the idea bank, copied from the Excel planner.
// Plain require() calls with fixed names, so hosts that bundle only the files they can see (Vercel) include them.
const FILES = {
  'checklist.json': () => require('../data/checklist.json'),
  'playbook.json': () => require('../data/playbook.json'),
  'routine.json': () => require('../data/routine.json'),
  'script.json': () => require('../data/script.json'),
  'seed-ideas.json': () => require('../data/seed-ideas.json'),
  'seed-videos.json': () => require('../data/seed-videos.json'),
};
const read = (name) => JSON.parse(JSON.stringify(FILES[name]()));

function loadSeed() {
  const videos = read('seed-videos.json').map((v, i) => ({
    position: i + 1,
    series: v.series,
    title: v.title,
    key_points: v.key_points,
  }));
  const ideas = read('seed-ideas.json').map((i) => ({
    series: i.series,
    idea: i.idea,
    format: i.format,
    priority: i.priority,
    why: i.why || '',
  }));
  return { videos, ideas };
}

function loadTemplates() {
  return {
    routine: read('routine.json'),
    checklist: read('checklist.json'),
    script: read('script.json'),
    playbook: read('playbook.json'),
  };
}

module.exports = { loadSeed, loadTemplates };
