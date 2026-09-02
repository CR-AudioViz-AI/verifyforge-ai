import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/api/central';
import { getErrorMessage, logError, formatApiError } from '@/lib/utils/error-utils';

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes

export async function POST(request: NextRequest) {
  // No billable work without a verified caller. getUserFromRequest verifies the
  // Supabase JWT from the Authorization header and returns null on every failure
  // path — an absent header, a malformed token, a rejected token. It never
  // returns a stand-in user, so there is no anonymous identity to bill or to
  // attribute a scan to.
  const caller = await getUserFromRequest(request);
  if (caller === null) {
    return NextResponse.json(
      {
        error: 'Sign in required',
        message: 'This endpoint runs work against a target and must know who is asking. Sign in and retry.',
      },
      { status: 401 },
    );
  }

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

      // 2026-09-02: these three testers were DELETED, not disabled.
      //
      // complete-game-testing.ts, complete-mobile-testing.ts and
      // complete-avatar-testing.ts made no network call and contained no `await`.
      // They reported measuredFps = 58, startupTime = 1500, memoryUsageMB = 85,
      // crashRate = 0.5 and polygonCount = 25000 from constants written into the
      // source, ran them through real thresholds, and returned a scored pass/fail
      // report. Every game ever scanned got the same "Below target FPS: 58"
      // warning, because 58 was a literal.
      //
      // Their replacements are real modules in lib/modules/checks/ —
      // model-geometry parses the actual GLB and counts triangles from accessors,
      // game-payload measures real transfer weight per asset, mobile-readiness
      // fetches as a phone and measures viewport, blocking resources and zoom.
      //
      // This endpoint returns 501 rather than routing to them because it takes an
      // uploaded FILE and the new modules take a URL. Wiring a file upload to a
      // URL-based module would be a different lie. An honest 501 naming the
      // replacement is the correct answer until that path is built.
      case 'game':
      case 'mobile':
      case 'avatar': {
        return NextResponse.json(
          {
            error: 'This test type is being rebuilt',
            detail:
              'The previous implementation reported hardcoded metrics rather than measuring anything, and was removed on 2026-09-02.',
            replacement:
              testType === 'avatar'
                ? 'model-geometry — parses a real glTF/GLB and counts triangles, textures, joints and animations from the file'
                : testType === 'game'
                  ? 'game-payload — measures real transfer weight, renderer, engine and frame-loop style from the live game URL'
                  : 'mobile-readiness — fetches as a phone and measures viewport, render-blocking weight, zoom permission and PWA installability',
            note: 'The replacements take a URL. File-upload support for them is not built yet.',
          },
          { status: 501 },
        )
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
