// 배포 직후 옛 번들을 연 화면이 지워진 chunk(React.lazy·동적 import)를 받지 못한 경우.
// Cloudflare가 없는 파일에 index.html을 돌려주므로 브라우저는 MIME 오류로 import를 실패시킨다.
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk [\w-]+ failed/i

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || CHUNK_ERROR.test(error.message)
}
