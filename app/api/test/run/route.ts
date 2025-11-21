import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage, logError, formatApiError } from '@/lib/utils/error-utils';

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const testType = formData.get('testType') as string
    const url = formData.get('url') as string | null
    const file = formData.get('file') as File | null

    if (!testType) {
      return NextResponse.json({ error: 'Test type is required' }, { status: 400 })
    }

    let results: any

    switch (testType) {
      case 'web': {
        if (!url) {
          return NextResponse.json({ error: 'URL is required for web testing' }, { status: 400 })
        }
        const { CompleteWebTester } = await import('@/lib/complete-web-testing')
        const tester = new CompleteWebTester()
        results = await tester.testWebsite(url)
        break
      }

      case 'document': {
        if (!file) {
          return NextResponse.json({ error: 'File is required for document testing' }, { status: 400 })
        }
        const { CompleteDocumentTester } = await import('@/lib/complete-document-testing')
        const tester = new CompleteDocumentTester()
        results = await tester.testDocument(file)
        break
      }

      case 'api': {
        if (!url) {
          return NextResponse.json({ error: 'API endpoint URL is required' }, { status: 400 })
        }
        const { CompleteApiTester } = await import('@/lib/complete-api-testing')
        const tester = new CompleteApiTester()
        results = await tester.testApi(url)
        break
      }

      case 'ai': {
        if (!url) {
          return NextResponse.json({ error: 'AI endpoint URL is required' }, { status: 400 })
        }
        const { CompleteAiBotTester } = await import('@/lib/complete-ai-bot-testing')
        const tester = new CompleteAiBotTester()
        results = await tester.testAiBot(url)
        break
      }

      case 'game': {
        if (!file) {
          return NextResponse.json({ error: 'File is required for game testing' }, { status: 400 })
        }
        const { CompleteGameTester } = await import('@/lib/complete-game-testing')
        const tester = new CompleteGameTester()
        results = await tester.testGame(file)
        break
      }

      case 'mobile': {
        if (!file) {
          return NextResponse.json({ error: 'File is required for mobile testing' }, { status: 400 })
        }
        const { CompleteMobileTester } = await import('@/lib/complete-mobile-testing')
        const tester = new CompleteMobileTester()
        results = await tester.testMobileApp(file)
        break
      }

      case 'avatar': {
        if (!file) {
          return NextResponse.json({ error: 'File is required for avatar testing' }, { status: 400 })
        }
        const { CompleteAvatarTester } = await import('@/lib/complete-avatar-testing')
        const tester = new CompleteAvatarTester()
        results = await tester.testAvatar(file)
        break
      }

      case 'tool': {
        if (!url) {
          return NextResponse.json({ error: 'Tool URL is required' }, { status: 400 })
        }
        const { CompleteToolTester } = await import('@/lib/complete-tool-testing')
        const tester = new CompleteToolTester()
        results = await tester.testTool(url)
        break
      }

      default:
        return NextResponse.json({ error: 'Invalid test type' }, { status: 400 })
    }

    return NextResponse.json(results)
  } catch (error: unknown) {
    logError('Test execution error:', error)
    return NextResponse.json(
      { error: 'Test execution failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
