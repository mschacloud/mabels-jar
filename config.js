// Supabase connection for Mabel's Jar.
// Both values are PUBLIC by design: they only let a browser talk to Supabase,
// and row level security means each signed-in person can reach only their own rows and photos.
// NEVER put the service_role / secret key here.
window.MABEL_CONFIG = {
  supabaseUrl: "https://wanitotreruqdkagztot.supabase.co",
  supabaseAnonKey: "sb_publishable_1HJW1U7hUNfspeaSQvnTmQ_kztb97Mj"
};
