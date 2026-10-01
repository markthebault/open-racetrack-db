// Preserve configuration words such as International, National, Short, GP and chicane.
export const normalizeLayoutName=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(circuit|circuito|raceway|racetrack|autodromo|autodrome|track|motor|park)\b/g,'').replace(/[^a-z0-9]/g,'');
