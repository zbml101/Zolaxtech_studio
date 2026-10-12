import { h } from '../lib/dom.js';
import { lsGet, lsSet } from '../lib/dom.js';
import { state } from '../store.js';

const SECTIONS = [['pipeline', 'Production pipeline'], ['mic', 'Mic test'], ['speaking', 'Speaking'], ['script', 'Script template'], ['rules', 'Rules'], ['tools', 'Tools']];
let section = lsGet('zx-playbook', 'pipeline');
let ruleType = 'All';

const strip = (t) => t.replace(/^\d+\.\s*/, '');

function steps(list) { return h('ol', { class: 'steps' }, list.map((t) => h('li', null, h('span', null, strip(t))))); }

export function renderPlaybook() {
  const pb = state.templates.playbook;
  let content;
  if (section === 'pipeline') content = h('section', { class: 'panel stack' }, h('h2', null, 'From recording to upload'), steps(pb.pipeline),
    pb.folders ? h('p', { class: 'muted small' }, 'Folder pattern: ', h('code', null, pb.folders)) : null);
  else if (section === 'mic') content = h('section', { class: 'panel stack' }, h('h2', null, 'Set up and test your USB microphone'), steps(pb.mic));
  else if (section === 'speaking') content = h('section', { class: 'panel stack' }, h('h2', null, 'Speaking while you record'), steps(pb.speaking));
  else if (section === 'script') content = h('section', { class: 'panel stack' }, h('h2', null, 'Script template'),
    h('p', { class: 'muted' }, 'Every script has the same nine parts. Open a video and use its Script tab.'),
    h('div', null, state.templates.script.parts.map((p) => h('div', { class: 'rule' }, h('div', { class: 'row between' }, h('strong', null, p.title), h('span', { class: 'muted small' }, `about ${p.minutes} min`)), h('span', { class: 'muted' }, p.hint)))),
    pb.titlePattern ? h('p', { class: 'small' }, h('strong', null, pb.titlePattern.label + ': '), pb.titlePattern.text) : null);
  else if (section === 'rules') {
    const types = ['All', ...new Set(pb.rules.map((r) => r.type))];
    content = h('section', { class: 'panel' },
      h('div', { class: 'chips', style: { marginBottom: '8px' } }, types.map((t) => h('button', { class: `chip${ruleType === t ? ' on' : ''}`, onclick: () => { ruleType = t; window.__rerender(); } }, t))),
      pb.rules.filter((r) => ruleType === 'All' || r.type === ruleType).map((r) => h('div', { class: 'rule' }, h('strong', null, r.rule), h('span', { class: 'muted small' }, r.why))));
  } else content = h('section', { class: 'panel' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, ['Job', 'Use', 'Free alternative', 'How'].map((t) => h('th', null, t)))),
    h('tbody', null, pb.tools.map((t) => h('tr', null, h('td', null, h('strong', null, t.purpose)), h('td', null, t.main), h('td', { class: 'muted' }, t.alt), h('td', { class: 'small muted' }, t.how))))));

  return h('div', { class: 'stack-l' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Playbook'), h('p', null, 'The routines and rules behind the channel, in one place.'))),
    h('div', { class: 'chips playbook-nav' }, SECTIONS.map(([k, label]) => h('button', { class: `chip${section === k ? ' on' : ''}`, onclick: () => { section = k; lsSet('zx-playbook', k); window.__rerender(); } }, label))),
    content);
}
