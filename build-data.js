/* Generuje api/data.js — kompaktowy katalog dla modelu.
   Uruchom po każdej zmianie profiles.js / speakers.js:  node build-data.js  */
global.window = {};
require('./profiles.js');
require('./speakers.js');
const fs = require('fs');

const line = (p, kind) => {
  const parts = [`[${p.id}] ${p.name}`];
  if (p.company) parts.push(`(${p.company})`);
  parts.push(`— ${p.headline || p.role || ''}`);
  const body = [];
  const desc = (p.does || p.bio || '').replace(/\s+/g, ' ').trim();
  if (desc) body.push('ROBI: ' + desc);
  if (p.seeks && p.seeks.length) body.push('SZUKA: ' + p.seeks.join('; '));
  if (p.offers && p.offers.length) body.push('POMOZE: ' + p.offers.join('; '));
  if (p.session) body.push('GDZIE: ' + p.session + (p.when ? ' — ' + p.when : ''));
  let out = parts.join(' ') + '\n   ' + body.join(' | ');
  // jak rekord ma oryginalne intro, doklejamy je w całości — model widzi i destylat, i surowiec
  if (p.raw) out += '\n   ORYGINALNE INTRO: ' + p.raw.replace(/\s+/g, ' ').trim();
  return out;
};

// uczestnicy (profiles.js) tymczasowo wyłączeni z tego deployu — patrz git history po przywrócenie
const people = [
  ...window.SPEAKERS.map(p => ({ ...p, kind: 'prelegent' })),
];

const catalog =
  '### PRELEGENCI, MENTORZY I JURY (dostępni przez całe wydarzenie)\n' +
  people.filter(p => p.kind === 'prelegent').map(p => line(p)).join('\n');

const dir = Object.fromEntries(people.map(p => [p.id, {
  id: p.id, name: p.name, company: p.company || '',
  headline: p.headline || p.role || '',
  linkedin: p.linkedin || '', url: p.url || '',
  session: p.session || '', when: p.when || '', kind: p.kind,
  raw: p.raw || '', desc: (p.does || p.bio || '').replace(/\s+/g, ' ').trim(),
}]));

fs.writeFileSync('api/data.js',
  '// PLIK GENEROWANY — nie edytuj ręcznie. Zmieniaj profiles.js / speakers.js i uruchom: node build-data.js\n' +
  'module.exports = {\n  CATALOG: ' + JSON.stringify(catalog) + ',\n  DIR: ' + JSON.stringify(dir) + ',\n};\n');

console.log('Osób:', people.length, '| katalog:', catalog.length, 'znaków, ~' + Math.round(catalog.length / 3.2) + ' tokenów');
