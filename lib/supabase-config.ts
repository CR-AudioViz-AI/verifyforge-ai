import { publishableKey, supabaseUrl } from "@craudioviz/platform-sdk";
// lib/supabase-config.ts — the connection constants, and nothing that runs.
//
// WHY THIS FILE EXISTS. lib/supabase.ts creates a client at MODULE SCOPE:
//
//     export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
//
// So merely importing that module constructs a SupabaseClient, which
// constructs a RealtimeClient, which needs a global WebSocket. Node 20 has
// none, and a bare Node process — a test, a script — dies on the import alone:
//
//     Error: Node.js detected but native WebSocket not found.
//       at createClient ... at lib/supabase.ts:24
//
// That is issue #61, and it has now bitten three times: the meter e2e, and
// twice through import chains that wanted a string and got a live client.
// test/proof.entitlements.ts runs entirely offline and needs no connection at
// all; it should not be able to fail on WebSocket support.
//
// Constants live here, with no side effects, so importing them costs nothing.
// lib/supabase.ts re-exports them, so every existing import keeps working.
//
// CR AudioViz AI, LLC · EIN 39-3646201 · 2026-08-25

export const SUPABASE_URL = supabaseUrl()
  || 'https://kteobfyferrukqeolofj.supabase.co';

export const SUPABASE_ANON_KEY = publishableKey()
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0ZW9iZnlmZXJydWtxZW9sb2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTcyNjYsImV4cCI6MjA3NzU1NzI2Nn0.uy-jlF_z6qVb8qogsNyGDLHqT4HhmdRhLrW7zPv3qhY';
