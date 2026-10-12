// The starting plan: 41 videos and the idea bank, copied from the Excel planner.
const fs = require('fs');
const path = require('path');

const read = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', name), 'utf8'));

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
