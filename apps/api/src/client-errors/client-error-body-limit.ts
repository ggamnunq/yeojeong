import { createRequire } from 'node:module';
import type { RequestHandler } from 'express';

export const CLIENT_ERRORS_PATH = '/api/client-errors';
/** 보고 본문 상한. 정상 보고는 3KB를 넘지 않는다(메시지 500자 + 스택 8줄 + 짧은 필드) */
export const CLIENT_ERROR_MAX_BODY_BYTES = 8 * 1024;

// Nest(@nestjs/platform-express)가 쓰는 express 그대로의 JSON 파서. express를 따로 의존성에 넣지 않는다(같은 인스턴스·버전)
const requireFromNest = createRequire(
  createRequire(import.meta.url).resolve('@nestjs/platform-express'),
);
const express = requireFromNest('express') as typeof import('express');

/**
 * /api/client-errors 전용 JSON 파서(8KB). 전역 파서(100kb)보다 먼저 붙인다(setup-app.ts) — 여기서 읽은 본문은 전역 파서가 다시 읽지 않는다.
 * 스트리밍으로 세다가 상한을 넘으면 멈추고 413 PAYLOAD_TOO_LARGE(전역 필터 형식). Content-Length가 없는
 * chunked 본문(Cloudflare Worker가 본문 스트림을 그대로 넘길 때)도 같은 상한으로 받는다.
 * express의 app.use 경로 매칭이라 대소문자·끝 슬래시가 달라도 걸린다.
 */
export function clientErrorBodyParser(
  maxBytes = CLIENT_ERROR_MAX_BODY_BYTES,
): [path: string, handler: RequestHandler] {
  return [CLIENT_ERRORS_PATH, express.json({ limit: maxBytes })];
}
