import { InvalidArgumentError } from 'commander';

/** Commander argParser for --tail: non-negative integer only. */
export function parseTail(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError('Expected a non-negative integer.');
  }
  return parseInt(value, 10);
}
