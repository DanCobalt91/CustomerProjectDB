export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // Ignore crypto errors and fall back to manual id generation
    }
  }
  return `id-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}
