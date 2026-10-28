import { setupServer } from 'msw/node'
import { handlers } from './handlers'

/** vitest용. src/test/setup.ts가 listen·resetHandlers·close를 맡는다 */
export const server = setupServer(...handlers)
