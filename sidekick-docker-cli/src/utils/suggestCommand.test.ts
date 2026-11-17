import { describe, expect, it } from 'vitest';
import { editDistance, similarCommands, unknownCommandMessage } from './suggestCommand';

const COMMANDS = ['ps', 'logs', 'images', 'volumes', 'networks', 'stats', 'df', 'inspect'];

describe('editDistance', () => {
  it('counts insertions, deletions, substitutions and transpositions', () => {
    expect(editDistance('ps', 'ps')).toBe(0);
    expect(editDistance('pss', 'ps')).toBe(1);
    expect(editDistance('lgos', 'logs')).toBe(1);
    expect(editDistance('imgaes', 'images')).toBe(1);
  });
});

describe('unknownCommandMessage (T39)', () => {
  it('suggests the nearest command, in Commander\'s wording', () => {
    expect(unknownCommandMessage('pss', COMMANDS)).toBe("error: unknown command 'pss'\n(Did you mean ps?)");
    expect(unknownCommandMessage('volume', COMMANDS)).toBe("error: unknown command 'volume'\n(Did you mean volumes?)");
  });

  it('lists ties and stays quiet when nothing is close', () => {
    expect(similarCommands('stat', ['stats', 'start'])).toEqual(['start', 'stats']);
    expect(unknownCommandMessage('zzzzzz', COMMANDS)).toBe("error: unknown command 'zzzzzz'");
  });
});
