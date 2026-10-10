import { readFileSync } from 'node:fs';
import { installDom } from './domstub.js';
installDom();
const { Host } = await import('../js/host.js');
const host = new Host();
await host.loadApk(readFileSync('test/dk.cocode.chess_5018.apk'), 'x.apk', () => {});
const R = host.R;
const orig = R._dispatch.bind(R);
let seen = 0;
R._dispatch = function (m, args) {
  const out = orig(m, args);
  if (seen < 6 && out === null && (m.retType === 'Ljava/lang/Boolean;' || m.proto.includes(')Ljava/lang/Boolean;'))) {
    seen++;
    console.log('NULL Boolean from', m.owner.desc + '->' + m.key, 'args=', args.map((a) => (a === null ? 'null' : typeof a === 'object' ? R.classNameOf(a) : JSON.stringify(a))).join(','));
    console.log('   stack:', (R._callStack || []).slice(-8).join(' <- '));
  }
  if (seen < 6 && out === null && m.key === 'get(Ljava/lang/Object;)Ljava/lang/Object;') {
    // also watch map gets that feed booleans
  }
  return out;
};
try { await host.boot(); } catch (e) { console.log('boot', e.message); }
await new Promise((r) => setTimeout(r, 250));
host.halt();
