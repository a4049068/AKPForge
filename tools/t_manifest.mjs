import { readFileSync } from 'node:fs';
import { ZipArchive } from '../js/zip.js';
import { parseAxml, axmlToXml } from '../js/axml.js';

const apk = process.argv[2];
const zip = ZipArchive.open(readFileSync(apk));
console.log('entries:', zip.order.length, '| comment:', JSON.stringify(zip.comment));
const man = await zip.data('AndroidManifest.xml');
console.log('AndroidManifest.xml bytes:', man.length);
const { root, pool } = parseAxml(man);
console.log('stringpool size:', pool.size);
console.log(axmlToXml(root).slice(0, 4000));
