let sharedContext: AudioContext | null = null

/** Toca um beep curto de notificação via Web Audio API — sem depender de arquivo de áudio. */
export function playNotificationBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    if (!sharedContext) sharedContext = new Ctx()
    const ctx = sharedContext

    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)
    oscillator.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1)

    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)

    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.26)
  } catch {
    // Ambientes sem suporte a Web Audio (ou autoplay bloqueado) — silencioso.
  }
}
