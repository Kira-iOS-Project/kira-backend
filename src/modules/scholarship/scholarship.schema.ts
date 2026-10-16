import { z } from '@hono/zod-openapi';
import { characterCount } from '../../lib/text/characters.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import {
  APPLICATION_STATUS,
  INELIGIBLE_REASON,
  SCHOLARSHIP_SITUATION,
} from '../../lib/constants/scholarship.ts';

const situationSchema = z.enum(enumValues(SCHOLARSHIP_SITUATION));
const STORY_MAX_LENGTH = 1000;
/** A bound on the UTF-16 units before counting: no visible character needs more. */
const MAX_UNITS_PER_CHARACTER = 16;

export const applicationSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(enumValues(APPLICATION_STATUS)),
    situations: z.array(situationSchema),
    story: z.string().nullable(),
    submittedAt: z.iso.datetime(),
    /** "Hasilnya paling lambat 21 Oktober 2026": three working days after submitting. */
    decideBy: z.iso.date(),
    decidedAt: z.iso.datetime().nullable(),
    grantStart: z.iso.date().nullable(),
    grantEnd: z.iso.date().nullable(),
    /** "Bisa diajukan mulai 5 Januari 2027": 14 days before the grant ends. */
    extensionFrom: z.iso.date().nullable(),
  })
  .openapi('ScholarshipApplication');

export const scholarshipResponseSchema = z
  .object({
    eligible: z.boolean(),
    ineligibleReason: z.enum(enumValues(INELIGIBLE_REASON)).nullable(),
    /** "42 dari 60 tersisa": a place for every three months gifted through Traktir Kira this month. */
    quota: z.object({ remaining: z.number().int(), total: z.number().int() }),
    application: applicationSchema.nullable(),
  })
  .openapi('Scholarship');

export const applyBodySchema = z
  .object({
    situations: z.array(situationSchema).min(1),
    /** Read by the review team only. */
    /** At most 1000 characters as a person counts them (iOS's String.count), not UTF-16 units. */
    story: z
      .string()
      .max(STORY_MAX_LENGTH * MAX_UNITS_PER_CHARACTER)
      .refine((story) => characterCount(story) <= STORY_MAX_LENGTH, 'too_long')
      .openapi({ description: 'At most 1000 characters (grapheme clusters).' })
      .optional(),
  })
  .openapi('ScholarshipApplicationRequest');

export type ApplicationResponse = z.infer<typeof applicationSchema>;
export type ScholarshipResponse = z.infer<typeof scholarshipResponseSchema>;
export type ApplyBody = z.infer<typeof applyBodySchema>;
export type Situation = z.infer<typeof situationSchema>;
export type ApplicationStatus = ApplicationResponse['status'];
export type IneligibleReason = NonNullable<ScholarshipResponse['ineligibleReason']>;
