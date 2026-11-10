import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { outputFormat, parseFinalJson } from '../../src/services/ai/claude';
import { HttpError } from '../../src/lib/errors';

const Schema = z.object({ items: z.array(z.object({ number: z.number().int(), kind: z.enum(['A', 'B']) })) });

describe('Claude response handling', () => {
  it('parses the final text block, not the web-search preamble', () => {
    const content = [
      { type: 'text', text: "I'll search for some problems first." },
      { type: 'server_tool_use' },
      { type: 'web_search_tool_result' },
      { type: 'text', text: '{"items":[{"number":15,"kind":"A"}]}' },
    ];
    expect(parseFinalJson(content, Schema)).toEqual({ items: [{ number: 15, kind: 'A' }] });
  });

  it('rejects missing, malformed or off-schema output with a 502', () => {
    const fail = (content: { type: string; text?: string }[]) => {
      try {
        parseFinalJson(content, Schema);
      } catch (e) {
        return e as HttpError;
      }
      throw new Error('expected an error');
    };
    expect(fail([{ type: 'thinking' }]).statusCode).toBe(502);
    expect(fail([{ type: 'text', text: 'not json' }]).code).toBe('AI_BAD_RESPONSE');
    expect(fail([{ type: 'text', text: '{"items":[{"number":1.5,"kind":"C"}]}' }]).code).toBe('AI_BAD_RESPONSE');
  });

  it('builds a structured-output schema with real enums and no unsupported keywords', () => {
    const { schema } = outputFormat(Schema);
    const json = JSON.stringify(schema);
    expect(json).toContain('"enum":["A","B"]');
    expect(json).not.toMatch(/minimum|maximum|\$schema/);
    expect((schema as { additionalProperties: boolean }).additionalProperties).toBe(false);
  });
});
