export type LayoutCoverage={
 schemaVersion:number;reference:string;xmlSha256:string;policy:string;
 summary:{referenceRecords:number;venuesChecked:number;draftMapped:number;unmappedLayouts:number;missingVenues:number;ambiguousVenues:number;outOfScope:number};
 records:{id:string;country:string;name:string;timingMode:string;trackId?:string;layoutIds:string[];status:string;association:string;remainingWork:string[];candidateTrackIds?:string[]}[];
 venues:{trackId:string;name:string;country:string;actualLayoutCount:number;expectedRecordCount:number;mappedRecordCount:number;missingRecordNames:string[];unassociatedLayoutIds:string[];status:string}[];
};
