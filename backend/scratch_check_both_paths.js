const fs = require('fs');
const path = require('path');

const pbp083Dwg = String.raw`\\pbp083\Public\Process Engineer\Doc. ENG\DWG. Control\PMC Parts\Process DWG\OT-7070\T7070-G1CT01.pdf`;
const pbp083Layout = String.raw`\\pbp083\Public\Process Engineer\Improvement Engineer\2.File scan Cutting lay-out PMC\Part PMC\OT-7070\Cutting layout BM165\TH\T7070-G1C & T7070-G1CT01 Rev.H.pdf`;

const pbgm06Dwg = String.raw`\\pbgm06\D\PartEN PMC\PMC Parts\Process DWG\OT-7070\T7070-G1CT01.pdf`;
const pbgm06Layout = String.raw`\\pbgm06\D\PartEN PMC\PMC Parts\Rework DWG\OT-7070\Cutting layout\T7070XXX R05.pdf`;

console.log('--- Checking pbp083 files ---');
console.log('pbp083 DWG exists?:', fs.existsSync(pbp083Dwg), pbp083Dwg ? fs.statSync(pbp083Dwg).size + ' bytes' : '');
console.log('pbp083 Layout exists?:', fs.existsSync(pbp083Layout), pbp083Layout ? fs.statSync(pbp083Layout).size + ' bytes' : '');

console.log('\n--- Checking pbgm06 files ---');
console.log('pbgm06 DWG exists?:', fs.existsSync(pbgm06Dwg), pbgm06Dwg ? fs.statSync(pbgm06Dwg).size + ' bytes' : '');
console.log('pbgm06 Layout exists?:', fs.existsSync(pbgm06Layout), pbgm06Layout ? fs.statSync(pbgm06Layout).size + ' bytes' : '');
