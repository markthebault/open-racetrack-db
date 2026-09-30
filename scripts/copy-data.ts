import {cp} from 'node:fs/promises';
// The public build has exactly one database input. Private overlays are served separately.
await cp('data','dist/data',{recursive:true});
