export function nowBRT(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    .replace('T', ' ')
    .slice(0, 19)
}
