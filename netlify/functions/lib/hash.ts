import { createHash } from 'node:crypto';

export function guardianEmailHash(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex');
}
