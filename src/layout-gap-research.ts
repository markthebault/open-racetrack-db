import {z} from 'zod';

export const layoutGapResearchSchema=z.object({
 schemaVersion:z.literal(1),
 records:z.array(z.object({
  referenceId:z.string(),trackId:z.string(),layoutId:z.string(),
  publicExplanation:z.string().trim().min(1).optional(),
  research:z.object({reviewedAt:z.iso.date(),evidenceUrls:z.array(z.url().refine(url=>/^https?:\/\//i.test(url))),geometryRecovered:z.literal(false)}).optional()
 }))
});
export type LayoutGapResearch=z.infer<typeof layoutGapResearchSchema>;
