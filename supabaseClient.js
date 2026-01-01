import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://uxitydifucsxupzckbto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4aXR5ZGlmdWNzeHVwemNrYnRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNzEzOTEsImV4cCI6MjA4MTY0NzM5MX0.vGpjGHQdGqGJAbE1W3S-RnKInxu_OCS30r9us3v4WLM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);