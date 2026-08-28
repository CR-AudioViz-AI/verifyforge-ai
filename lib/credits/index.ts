// Universal Credits Integration - CR AudioViz AI
import { createClient } from '@supabase/supabase-js';
import { secretKey, supabaseUrl } from "@craudioviz/platform-sdk";

const SUPABASE_URL = supabaseUrl();
const SUPABASE_SERVICE_KEY = secretKey();

const supabaseAdmin = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

export async function checkCredits(userId: string, amount: number): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { data } = await supabaseAdmin.from('user_credits').select('balance').eq('user_id', userId).single();
  return data ? data.balance >= amount : false;
}

export async function deductCredits(userId: string, amount: number, operation: string, appId: string, metadata?: Record<string, any>): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!supabaseAdmin) return { success: false, error: 'Admin not configured' };
  const { data: credits } = await supabaseAdmin.from('user_credits').select('balance, lifetime_spent').eq('user_id', userId).single();
  if (!credits) return { success: false, error: 'User not found' };
  if (credits.balance < amount) return { success: false, error: 'Insufficient credits' };
  const newBalance = credits.balance - amount;
  await supabaseAdmin.from('user_credits').update({ balance: newBalance, lifetime_spent: (credits.lifetime_spent || 0) + amount, updated_at: new Date().toISOString() }).eq('user_id', userId);
  await supabaseAdmin.from('credit_transactions').insert({ user_id: userId, amount: -amount, transaction_type: 'spend', app_id: appId, operation, description: `${appId}: ${operation}`, metadata });
  return { success: true, newBalance };
}

export async function refundCredits(userId: string, amount: number, reason: string, appId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabaseAdmin) return { success: false, error: 'Admin not configured' };
  const { data } = await supabaseAdmin.from('user_credits').select('balance').eq('user_id', userId).single();
  if (!data) return { success: false, error: 'User not found' };
  await supabaseAdmin.from('user_credits').update({ balance: data.balance + amount }).eq('user_id', userId);
  await supabaseAdmin.from('credit_transactions').insert({ user_id: userId, amount, transaction_type: 'refund', app_id: appId, description: `Refund: ${reason}` });
  return { success: true };
}

export async function getCreditBalance(userId: string): Promise<number> {
  if (!supabaseAdmin) return 0;
  const { data } = await supabaseAdmin.from('user_credits').select('balance').eq('user_id', userId).single();
  return data?.balance || 0;
}
