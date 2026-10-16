import { z } from 'zod';

export const clientPassword = z.string().min(16, 'Use at least 16 characters')
  .max(256, 'Use at most 256 characters')
  .refine(value => !/[\x00-\x1f\x7f]/.test(value), 'Control characters are not allowed');
