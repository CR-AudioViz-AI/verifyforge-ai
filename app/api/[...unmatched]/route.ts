import { NextResponse } from 'next/server';

// An unmatched API path must answer 404 with JSON, before the page handler is
// reached. Without this a deleted, renamed or mistyped endpoint returns 200 with
// the application shell, response.ok is true, and every client treats a missing
// route as a working one.
//
// Added by tools/repair.py on owner approval.
function notFound(): NextResponse {
  return NextResponse.json(
    { error: 'Not found', code: 'ROUTE_NOT_FOUND' },
    { status: 404 },
  );
}

export async function GET() { return notFound(); }
export async function POST() { return notFound(); }
export async function PUT() { return notFound(); }
export async function PATCH() { return notFound(); }
export async function DELETE() { return notFound(); }
export async function HEAD() { return notFound(); }
export async function OPTIONS() { return notFound(); }
