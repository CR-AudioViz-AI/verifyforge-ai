// lib/index.ts
// Central export file for all testing engines
// This ensures clean imports and proper webpack bundling

export { CompleteWebTester } from './complete-web-testing'
export type { ComprehensiveWebTestResult } from './complete-web-testing'

export { CompleteDocumentTester } from './complete-document-testing'
export type { ComprehensiveDocumentTestResult } from './complete-document-testing'

export { CompleteApiTester } from './complete-api-testing'
export type { ComprehensiveApiTestResult } from './complete-api-testing'

export { CompleteAiBotTester } from './complete-ai-bot-testing'
export type { ComprehensiveAiBotTestResult } from './complete-ai-bot-testing'

export { CompleteGameTester } from './complete-game-testing'
export type { ComprehensiveGameTestResult } from './complete-game-testing'

export { CompleteMobileTester } from './complete-mobile-testing'
export type { ComprehensiveMobileTestResult } from './complete-mobile-testing'

export { CompleteAvatarTester } from './complete-avatar-testing'
export type { ComprehensiveAvatarTestResult } from './complete-avatar-testing'

export { CompleteToolTester } from './complete-tool-testing'
export type { ComprehensiveToolTestResult } from './complete-tool-testing'
