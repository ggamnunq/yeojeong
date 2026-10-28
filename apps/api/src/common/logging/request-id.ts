import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// 클라이언트가 보낸 x-request-id는 쓰지 않고 요청마다 새로 만든다. 임의 값으로 로그를 오염시키지 못하게 한다.
export function assignRequestId(
  _req: IncomingMessage,
  res: ServerResponse,
): string {
  const id = randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function getRequestId(req: IncomingMessage): string {
  const id: unknown = req.id;
  return typeof id === 'string' ? id : '';
}
