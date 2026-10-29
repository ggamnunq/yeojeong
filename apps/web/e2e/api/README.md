# 실제 API E2E

`playwright.config.ts`의 `api` 프로젝트. 로컬 API(데모 어댑터)와 그 앞의 웹(운영 빌드 + `/api` 프록시)이 떠 있을 때만 돈다.

```sh
E2E_API_BASE_URL=http://localhost:4400 E2E_SESSION_TOKEN=… pnpm --filter @yeojeong/web test:e2e --project api
```

- `E2E_SESSION_TOKEN`: 로컬 DB에 만든 테스트 사용자의 `yj_session` 쿠키 값. 커밋하지 않는다.
- 연결 해제 → 다시 연결 테스트는 서버 S4(재동의 append)가 머지될 때까지 `test.fixme`다.
