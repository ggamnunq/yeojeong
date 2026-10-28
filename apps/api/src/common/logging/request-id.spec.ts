import type { IncomingMessage, ServerResponse } from 'node:http';
import { assignRequestId, getRequestId } from './request-id.js';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('assignRequestId', () => {
  const req = {
    headers: { 'x-request-id': 'forged-by-client' },
  } as unknown as IncomingMessage;

  it('creates a new UUID v4 and returns it in x-request-id', () => {
    const setHeader = vi.fn();
    const id = assignRequestId(req, { setHeader } as unknown as ServerResponse);

    expect(id).toMatch(UUID_V4);
    expect(id).not.toBe('forged-by-client');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', id);
  });

  it('creates a different ID for every request', () => {
    const res = { setHeader: vi.fn() } as unknown as ServerResponse;
    expect(assignRequestId(req, res)).not.toBe(assignRequestId(req, res));
  });
});

describe('getRequestId', () => {
  it('returns an empty string before an ID is assigned', () => {
    expect(getRequestId({} as IncomingMessage)).toBe('');
    expect(getRequestId({ id: 'abc' } as unknown as IncomingMessage)).toBe(
      'abc',
    );
  });
});
