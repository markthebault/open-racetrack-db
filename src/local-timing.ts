import {displayGate,nearestEdge,type Position} from './geo';

// Private preview only: keep the GPS position unchanged and derive a display orientation.
export function localGate(point:Position,trace:Position[],maxDisplacement=100){
 const anchor=nearestEdge(point,trace);
 if(anchor.displacementM>maxDisplacement)return {anchor,coordinates:null};
 const gate=displayGate(point,trace[anchor.index],trace[anchor.index+1],25,maxDisplacement);
 const offset:Position=[point[0]-gate.point[0],point[1]-gate.point[1]];
 return {anchor,coordinates:gate.coordinates.map(p=>[p[0]+offset[0],p[1]+offset[1]] as Position)};
}
