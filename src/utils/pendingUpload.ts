const pendingUploads = new Map<string, File>()

export function storePendingUpload(file: File): string {
  const token = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  pendingUploads.set(token, file)
  return token
}

export function takePendingUpload(token: string | null | undefined): File | null {
  if (!token) return null
  const file = pendingUploads.get(token) ?? null
  pendingUploads.delete(token)
  return file
}
