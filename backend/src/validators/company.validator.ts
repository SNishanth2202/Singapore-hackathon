import { z } from 'zod';

export const CompanyQuerySchema = z.object({
  country:  z.string().trim().optional(),
  industry: z.string().trim().optional(),
  stage:    z.string().trim().optional(),
  search:   z.string().trim().optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().positive().max(100).default(20),
});

export type CompanyQuery = z.infer<typeof CompanyQuerySchema>;
