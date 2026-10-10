import { readFileSync } from 'node:fs';
import { ZipArchive } from '../js/zip.js';
import { ResourceTable } from '../js/arsc.js';
import { parseAxml, findFirst, attr } from '../js/axml.js';

for (const f of process.argv.slice(2)) {
  const zip = ZipArchive.open(readFileSync(f));
  const rt = new ResourceTable(await zip.data('resources.arsc'));
  const m = parseAxml(await zip.data('AndroidManifest.xml'));
  const app = findFirst(m.root, 'application');
  const iconRef = attr(app,'icon'), labelRef = attr(app,'label');
  console.log('===', f);
  console.log(' packages:', rt.packages.map(p=>`${p.name}(id=${p.id})`).join(', '));
  console.log(' stats:', JSON.stringify(rt.stats.byType));
  console.log(' label:', labelRef && labelRef.dataType===3 ? labelRef.value : (labelRef? rt.string(labelRef.data):'-'));
  const ic = iconRef ? rt.resolveValue(iconRef.data) : null;
  console.log(' icon entry:', ic && `${ic.typeName}/${ic.key} type=${ic.dataType} val=${ic.value}`);
  const acts = [];
  (function walk(n){ if(n.tag==='activity'||n.tag==='activity-alias') acts.push(n); (n.children||[]).forEach(walk); })(m.root);
  for (const a of acts) {
    const nm = attr(a,'name');
    const launch = (a.children||[]).some(c=>c.tag==='intent-filter' && (c.children||[]).some(f=>f.tag==='action'&&attr(f,'name')&&attr(f,'name').value==='android.intent.action.MAIN'));
    console.log('  activity', nm && (nm.value||nm.rawValue), launch?'[LAUNCHER]':'');
  }
}
