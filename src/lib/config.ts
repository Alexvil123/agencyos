export function hasBackend() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export function isSetupPreview() {
  return !hasBackend() && process.env.NODE_ENV === 'development';
}
