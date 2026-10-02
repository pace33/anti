import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MAPS} from './game-config.mjs';
test('shipped maps use legacy-compatible XML and emit a real load marker; scene data is present',()=>{
 for(const map of MAPS){const p=fileURLToPath(new URL(map.file,import.meta.url)),s=fs.readFileSync(p,'utf8');assert.match(s,/<roblox[^>]*version="4"/);assert(!/\s\/>/.test(s),'legacy parser rejects spaced self-closing tags: '+map.id);assert(s.includes('ROBL_MAP_READY '+map.id));assert(s.includes('applyAiedueAvatar'));assert(s.includes('name="HttpEnabled">true<'));const count=(s.match(/class="(?:Part|WedgePart|SpawnLocation|TrussPart)"/g)||[]).length;assert(count>10);if(map.id!=='park'){assert(count>1000);assert(s.includes('ROBL_SWORD_SWING'));assert(!/<Item class="Players"/.test(s));}}
 assert(fs.readFileSync(fileURLToPath(new URL('maps/LICENSE-ROBLOX.txt',import.meta.url)),'utf8').includes('Copyright (c) 2020 Roblox Corporation'));
});
