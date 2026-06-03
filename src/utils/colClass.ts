/**
 * Converte classes Bootstrap col-{bp}-N → classes Tailwind CSS Grid col-span-N.
 *
 * As lookup tables usam strings literais para que o scanner do Tailwind inclua
 * todas as variantes no bundle final (strings dinâmicas como `col-span-${n}` seriam purgadas).
 *
 * Exemplos:
 *   resolveColClass('col-md-6')          → 'col-span-12 md:col-span-6'
 *   resolveColClass('col-md-4 col-lg-3') → 'col-span-12 md:col-span-4 lg:col-span-3'
 *   resolveColClass('col-6')             → 'col-span-6'
 *   resolveColClass('col-sm-12 col-md-6')→ 'sm:col-span-12 md:col-span-6'
 *   resolveColClass('my-custom-class')   → 'my-custom-class'  (passa direto)
 *   resolveColClass(undefined)           → 'col-span-12'      (fallback)
 */

// ─── Lookup tables (strings literais — obrigatório para o Tailwind scanner) ──

const BASE: Record<number, string> = {
  1: 'col-span-1',   2: 'col-span-2',   3: 'col-span-3',
  4: 'col-span-4',   5: 'col-span-5',   6: 'col-span-6',
  7: 'col-span-7',   8: 'col-span-8',   9: 'col-span-9',
  10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
}

const SM: Record<number, string> = {
  1: 'sm:col-span-1',   2: 'sm:col-span-2',   3: 'sm:col-span-3',
  4: 'sm:col-span-4',   5: 'sm:col-span-5',   6: 'sm:col-span-6',
  7: 'sm:col-span-7',   8: 'sm:col-span-8',   9: 'sm:col-span-9',
  10: 'sm:col-span-10', 11: 'sm:col-span-11', 12: 'sm:col-span-12',
}

const MD: Record<number, string> = {
  1: 'md:col-span-1',   2: 'md:col-span-2',   3: 'md:col-span-3',
  4: 'md:col-span-4',   5: 'md:col-span-5',   6: 'md:col-span-6',
  7: 'md:col-span-7',   8: 'md:col-span-8',   9: 'md:col-span-9',
  10: 'md:col-span-10', 11: 'md:col-span-11', 12: 'md:col-span-12',
}

const LG: Record<number, string> = {
  1: 'lg:col-span-1',   2: 'lg:col-span-2',   3: 'lg:col-span-3',
  4: 'lg:col-span-4',   5: 'lg:col-span-5',   6: 'lg:col-span-6',
  7: 'lg:col-span-7',   8: 'lg:col-span-8',   9: 'lg:col-span-9',
  10: 'lg:col-span-10', 11: 'lg:col-span-11', 12: 'lg:col-span-12',
}

const XL: Record<number, string> = {
  1: 'xl:col-span-1',   2: 'xl:col-span-2',   3: 'xl:col-span-3',
  4: 'xl:col-span-4',   5: 'xl:col-span-5',   6: 'xl:col-span-6',
  7: 'xl:col-span-7',   8: 'xl:col-span-8',   9: 'xl:col-span-9',
  10: 'xl:col-span-10', 11: 'xl:col-span-11', 12: 'xl:col-span-12',
}

// Todos os breakpoints em ordem crescente (importante para manter a hierarquia)
const BREAKPOINTS: Array<{
  pattern: RegExp
  lookup: Record<number, string>
  isMobile: boolean  // base + sm → base mobile; md/lg/xl → não são mobile-first
}> = [
  { pattern: /\bcol-(\d{1,2})\b/,    lookup: BASE, isMobile: true  },
  { pattern: /\bcol-sm-(\d{1,2})\b/, lookup: SM,   isMobile: true  },
  { pattern: /\bcol-md-(\d{1,2})\b/, lookup: MD,   isMobile: false },
  { pattern: /\bcol-lg-(\d{1,2})\b/, lookup: LG,   isMobile: false },
  { pattern: /\bcol-xl-(\d{1,2})\b/, lookup: XL,   isMobile: false },
]

// Regex que reconhece qualquer padrão de coluna Bootstrap
const ANY_COL_PATTERN = /\bcol(?:-(?:sm|md|lg|xl))?-\d{1,2}\b/

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * @param cls      Classe(s) do componente — pode conter col-md-N, col-lg-N, etc.
 * @param fallback Classe Tailwind retornada quando cls é undefined/vazia.
 *                 Default: 'col-span-12' (ocupa a linha toda)
 */
export function resolveColClass(cls: string | undefined | null, fallback = 'col-span-12'): string {
  if (!cls || !cls.trim()) return fallback

  // Se não há nenhuma classe de coluna Bootstrap, devolve a string original intacta
  if (!ANY_COL_PATTERN.test(cls)) return cls

  const twParts: string[] = []
  let hasMobileBase = false

  for (const { pattern, lookup, isMobile } of BREAKPOINTS) {
    const match = cls.match(pattern)
    if (!match) continue

    const n = parseInt(match[1], 10)
    if (n < 1 || n > 12 || !lookup[n]) continue

    twParts.push(lookup[n])
    if (isMobile) hasMobileBase = true
  }

  // Se só há breakpoints md/lg/xl (sem base mobile), adiciona col-span-12 para mobile
  if (twParts.length > 0 && !hasMobileBase) {
    twParts.unshift('col-span-12')
  }

  // Classes não-bootstrap que possam existir na string (ex: classes customizadas junto)
  const remaining = cls.replace(/\bcol(?:-(?:sm|md|lg|xl))?-\d{1,2}\b/g, '').trim().replace(/\s+/g, ' ')
  if (remaining) twParts.push(remaining)

  return twParts.join(' ')
}
