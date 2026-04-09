import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://snbnjkmxtuuhsjaortxa.supabase.co'
const supabaseKey = 'sb_publishable_KUXx3NGnzTL0cT0Xngi3Bw_e8_jQS9U'
export const supabase = createClient(supabaseUrl, supabaseKey)
