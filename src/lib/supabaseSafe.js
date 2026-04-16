export async function supabaseSafe(queryPromise) {
  const { data, error } = await queryPromise

  if (error) {
    console.error('Supabase error:', error)
    throw error
  }

  return data
}
