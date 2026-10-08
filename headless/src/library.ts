/**
 * library.ts
 *
 * Penpot 2.16.2 file-change payloads for library colors, typographies, token
 * sets, themes, and applied tokens. Pure data — no network. The change shapes
 * match `common/src/app/common/files/changes.cljc` at tag 2.16.2.
 *
 * `update-file` JSON decoding keywordizes kebab-case keys and maps a token's
 * `type` string through the DTCG table (`color`, `fontSizes`, `spacing`, …).
 */

export const TOKEN_REFERENCE_DEPTH = 10

/** Penpot keyword name → DTCG type string accepted by schema:token-type's JSON decoder. */
const PENPOT_TYPE_TO_DTCG: Record<string, string> = {
  boolean: 'boolean',
  'border-radius': 'borderRadius',
  borderRadius: 'borderRadius',
  color: 'color',
  dimensions: 'dimension',
  dimension: 'dimension',
  'font-family': 'fontFamilies',
  fontFamilies: 'fontFamilies',
  fontFamily: 'fontFamilies',
  'font-size': 'fontSizes',
  fontSizes: 'fontSizes',
  fontSize: 'fontSizes',
  'font-weight': 'fontWeights',
  fontWeights: 'fontWeights',
  fontWeight: 'fontWeights',
  'letter-spacing': 'letterSpacing',
  letterSpacing: 'letterSpacing',
  number: 'number',
  opacity: 'opacity',
  other: 'other',
  rotation: 'rotation',
  shadow: 'shadow',
  sizing: 'sizing',
  spacing: 'spacing',
  string: 'string',
  'stroke-width': 'borderWidth',
  borderWidth: 'borderWidth',
  'text-case': 'textCase',
  textCase: 'textCase',
  'text-decoration': 'textDecoration',
  textDecoration: 'textDecoration',
  typography: 'typography',
}

const DTCG_TYPE_TO_PENPOT: Record<string, string> = {
  boolean: 'boolean',
  borderRadius: 'border-radius',
  color: 'color',
  dimension: 'dimensions',
  fontFamilies: 'font-family',
  fontFamily: 'font-family',
  fontSizes: 'font-size',
  fontSize: 'font-size',
  fontWeights: 'font-weight',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
  number: 'number',
  opacity: 'opacity',
  other: 'other',
  rotation: 'rotation',
  shadow: 'shadow',
  sizing: 'sizing',
  spacing: 'spacing',
  string: 'string',
  borderWidth: 'stroke-width',
  textCase: 'text-case',
  textDecoration: 'text-decoration',
  typography: 'typography',
  'border-radius': 'border-radius',
  dimensions: 'dimensions',
  'font-family': 'font-family',
  'font-size': 'font-size',
  'font-weight': 'font-weight',
  'letter-spacing': 'letter-spacing',
  'stroke-width': 'stroke-width',
  'text-case': 'text-case',
  'text-decoration': 'text-decoration',
}

export type LibraryColorInput = {
  id: string
  name: string
  color: string
  opacity?: number
  path?: string
}

export type TypographyInput = {
  id: string
  name: string
  fontId?: string
  fontFamily: string
  fontVariantId?: string
  fontSize: string
  fontWeight: string
  fontStyle?: string
  lineHeight?: string
  letterSpacing?: string
  textTransform?: string
  path?: string
}

export type TokenInput = {
  id: string
  name: string
  type: string
  value: unknown
  description?: string
}

export type TokenSetInput = {
  id: string
  name: string
  description?: string
}

export type TokenThemeInput = {
  id: string
  name: string
  group?: string
  description?: string
  isSource?: boolean
  externalId?: string
  sets: string[]
}

export function toDtcgTokenType(type: string): string {
  const mapped = PENPOT_TYPE_TO_DTCG[type]
  if (!mapped) {
    throw new Error(`Unknown Penpot token type "${type}"`)
  }
  return mapped
}

export function fromDtcgTokenType(type: string): string {
  return DTCG_TYPE_TO_PENPOT[type] ?? type
}

export function themePath(group: string, name: string): string {
  return `${group}/${name}`
}

export function addColorChange(color: LibraryColorInput): Record<string, unknown> {
  return {
    type: 'add-color',
    color: libraryColor(color),
  }
}

export function updateColorChange(color: LibraryColorInput): Record<string, unknown> {
  return {
    type: 'mod-color',
    color: libraryColor(color),
  }
}

export function deleteColorChange(id: string): Record<string, unknown> {
  return { type: 'del-color', id }
}

export function addTypographyChange(typography: TypographyInput): Record<string, unknown> {
  return { type: 'add-typography', typography: typographyObject(typography) }
}

export function updateTypographyChange(typography: TypographyInput): Record<string, unknown> {
  return { type: 'mod-typography', typography: typographyObject(typography) }
}

export function deleteTypographyChange(id: string): Record<string, unknown> {
  return { type: 'del-typography', id }
}

export function setTokenSetChange(set: TokenSetInput): Record<string, unknown> {
  return {
    type: 'set-token-set',
    id: set.id,
    attrs: {
      id: set.id,
      name: set.name,
      description: set.description ?? '',
      tokens: {},
    },
  }
}

export function setTokenChange(setId: string, token: TokenInput): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    id: token.id,
    name: token.name,
    type: toDtcgTokenType(token.type),
    value: token.value,
  }
  if (token.description) attrs.description = token.description
  return {
    type: 'set-token',
    'set-id': setId,
    'token-id': token.id,
    attrs,
  }
}

export function deleteTokenChange(setId: string, tokenId: string): Record<string, unknown> {
  return {
    type: 'set-token',
    'set-id': setId,
    'token-id': tokenId,
    attrs: null,
  }
}

export function setTokenThemeChange(theme: TokenThemeInput): Record<string, unknown> {
  return {
    type: 'set-token-theme',
    id: theme.id,
    attrs: {
      id: theme.id,
      name: theme.name,
      group: theme.group ?? '',
      description: theme.description ?? '',
      'is-source': theme.isSource ?? false,
      'external-id': theme.externalId ?? theme.id,
      sets: theme.sets,
    },
  }
}

export function setActiveTokenThemesChange(themePaths: string[]): Record<string, unknown> {
  return { type: 'set-active-token-themes', 'theme-paths': themePaths }
}

export function mergeAppliedTokens(
  existing: unknown,
  bindings: Record<string, string>,
): Record<string, string> {
  const prev = isRecord(existing) ? existing : {}
  const merged: Record<string, string> = {}
  for (const [key, value] of Object.entries(prev)) {
    if (typeof value === 'string') merged[key] = value
  }
  return { ...merged, ...bindings }
}

function libraryColor(color: LibraryColorInput): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: color.id,
    name: color.name,
    color: color.color,
  }
  if (color.opacity !== undefined) obj.opacity = color.opacity
  if (color.path) obj.path = color.path
  return obj
}

function typographyObject(typography: TypographyInput): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id: typography.id,
    name: typography.name,
    'font-id': typography.fontId ?? typography.fontFamily,
    'font-family': typography.fontFamily,
    'font-variant-id': typography.fontVariantId ?? 'regular',
    'font-size': typography.fontSize,
    'font-weight': typography.fontWeight,
    'font-style': typography.fontStyle ?? 'normal',
    'line-height': typography.lineHeight ?? '1.2',
    'letter-spacing': typography.letterSpacing ?? '0',
    'text-transform': typography.textTransform ?? 'none',
  }
  if (typography.path) obj.path = typography.path
  return obj
}

export type FlatToken = {
  setName: string
  name: string
  type: string
  value: unknown
  description?: string
}

export type ResolvedToken = FlatToken & {
  resolvedValue?: unknown
  error?: string
}

export type TokenThemeSummary = {
  id?: string
  name: string
  group: string
  path: string
  sets: string[]
}

export type LibrarySummary = {
  colors: Array<{ id?: string; name?: string; color?: string; opacity?: number; path?: string }>
  typographies: Array<{
    id?: string
    name?: string
    fontFamily?: string
    fontSize?: string
    fontWeight?: string
    fontStyle?: string
    lineHeight?: string
    letterSpacing?: string
    textTransform?: string
    path?: string
  }>
  tokenSets: Array<{ name: string; tokens: ResolvedToken[] }>
  themes: TokenThemeSummary[]
  activeThemes: string[]
  activeSets: string[]
  resolvedTokens: Record<string, unknown>
  failedTokens: Array<{ name: string; error: string }>
}

export type FlowSummary = {
  pageId?: string
  pageName?: string
  id?: string
  name?: string
  startingFrame?: string
}

const WHOLE_REFERENCE = /^\{([^{}]+)\}$/
const EMBEDDED_REFERENCE = /\{([^{}]+)\}/g

export function readLibrarySummary(file: { data?: unknown }): LibrarySummary {
  const data = isRecord(file.data) ? file.data : {}
  const colors = readColors(data.colors)
  const typographies = readTypographies(data.typographies ?? data['typographies'])
  const tokensLib = data.tokensLib ?? data['tokens-lib']
  const parsed = parseTokensLib(tokensLib)
  const activeSets = parsed.activeSets.length > 0 ? parsed.activeSets : parsed.sets.map((set) => set.name)
  const indexed = indexTokens(parsed.sets, activeSets)
  const resolvedTokens: Record<string, unknown> = {}
  const failedTokens: Array<{ name: string; error: string }> = []
  const tokenSets = parsed.sets.map((set) => ({
    name: set.name,
    tokens: set.tokens.map((token) => {
      const resolved = resolveTokenValue(token.value, indexed, 0, new Set([token.name]))
      if (resolved.error) failedTokens.push({ name: token.name, error: resolved.error })
      else if (activeSets.includes(set.name) || parsed.activeSets.length === 0) {
        resolvedTokens[token.name] = resolved.value
      }
      return { ...token, resolvedValue: resolved.value, ...(resolved.error ? { error: resolved.error } : {}) }
    }),
  }))
  return {
    colors,
    typographies,
    tokenSets,
    themes: parsed.themes,
    activeThemes: parsed.activeThemes,
    activeSets,
    resolvedTokens,
    failedTokens,
  }
}

export function readFlows(file: { data?: unknown }): FlowSummary[] {
  const data = isRecord(file.data) ? file.data : {}
  const pages = isRecord(data.pagesIndex)
    ? data.pagesIndex
    : isRecord(data['pages-index'])
      ? data['pages-index']
      : {}
  const flows: FlowSummary[] = []
  for (const page of Object.values(pages)) {
    if (!isRecord(page) || !isRecord(page.flows)) continue
    for (const flow of Object.values(page.flows)) {
      if (!isRecord(flow)) continue
      const starting = flow.startingFrame ?? flow['starting-frame']
      flows.push({
        pageId: typeof page.id === 'string' ? page.id : undefined,
        pageName: typeof page.name === 'string' ? page.name : undefined,
        id: typeof flow.id === 'string' ? flow.id : undefined,
        name: typeof flow.name === 'string' ? flow.name : undefined,
        startingFrame: typeof starting === 'string' ? starting : undefined,
      })
    }
  }
  return flows
}

export function readAppliedTokens(shape: Record<string, unknown>): Record<string, string> {
  return mergeAppliedTokens(shape['applied-tokens'] ?? shape.appliedTokens, {})
}

export function resolveNamedToken(
  library: LibrarySummary,
  name: string,
): { value?: unknown; error?: string } {
  const indexed = new Map<string, FlatToken>()
  const active = new Set(library.activeSets)
  for (const set of library.tokenSets) {
    if (library.activeSets.length > 0 && !active.has(set.name)) continue
    for (const token of set.tokens) indexed.set(token.name, token)
  }
  const token = indexed.get(name)
  if (!token) return { error: `token "${name}" was not found` }
  return resolveTokenValue(token.value, indexed, 0, new Set([name]))
}

function parseTokensLib(raw: unknown): {
  sets: Array<{ name: string; tokens: FlatToken[] }>
  themes: TokenThemeSummary[]
  activeThemes: string[]
  activeSets: string[]
} {
  if (!isRecord(raw)) return { sets: [], themes: [], activeThemes: [], activeSets: [] }
  const metadata = isRecord(raw.$metadata) ? raw.$metadata : {}
  const sets: Array<{ name: string; tokens: FlatToken[] }> = []
  for (const [name, tree] of Object.entries(raw)) {
    if (name.startsWith('$')) continue
    const tokens: FlatToken[] = []
    walkDtcg(tree, '', name, tokens)
    sets.push({ name, tokens })
  }
  const order = stringList(metadata.tokenSetOrder)
  if (order.length > 0) {
    sets.sort((a, b) => {
      const ai = order.indexOf(a.name)
      const bi = order.indexOf(b.name)
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi)
    })
  }
  const themes = readThemes(raw.$themes)
  return {
    sets,
    themes,
    activeThemes: stringList(metadata.activeThemes),
    activeSets: stringList(metadata.activeSets),
  }
}

function walkDtcg(node: unknown, prefix: string, setName: string, out: FlatToken[]): void {
  if (!isRecord(node)) return
  const value = node.$value ?? node.value
  if (value !== undefined && (node.$type !== undefined || node.type !== undefined || node.$value !== undefined)) {
    const typeRaw = node.$type ?? node.type
    const description = node.$description ?? node.description
    out.push({
      setName,
      name: prefix,
      type: typeof typeRaw === 'string' ? fromDtcgTokenType(typeRaw) : 'other',
      value,
      ...(typeof description === 'string' && description ? { description } : {}),
    })
    return
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue
    walkDtcg(child, prefix ? `${prefix}.${key}` : key, setName, out)
  }
}

function readThemes(raw: unknown): TokenThemeSummary[] {
  if (!Array.isArray(raw)) return []
  const themes: TokenThemeSummary[] = []
  for (const theme of raw) {
    if (!isRecord(theme) || typeof theme.name !== 'string') continue
    const group = typeof theme.group === 'string' ? theme.group : ''
    const selected = isRecord(theme.selectedTokenSets) ? theme.selectedTokenSets : {}
    const sets = Object.entries(selected)
      .filter(([, state]) => state === 'enabled' || state === 'source')
      .map(([name]) => name)
    themes.push({
      id: typeof theme.id === 'string' ? theme.id : undefined,
      name: theme.name,
      group,
      path: themePath(group, theme.name),
      sets,
    })
  }
  return themes
}

function indexTokens(sets: Array<{ name: string; tokens: FlatToken[] }>, activeSets: string[]): Map<string, FlatToken> {
  const byName = new Map(sets.map((set) => [set.name, set]))
  const indexed = new Map<string, FlatToken>()
  for (const name of activeSets) {
    const set = byName.get(name)
    if (!set) continue
    for (const token of set.tokens) indexed.set(token.name, token)
  }
  return indexed
}

function resolveTokenValue(
  value: unknown,
  tokens: Map<string, FlatToken>,
  depth: number,
  stack: Set<string>,
): { value?: unknown; error?: string } {
  if (depth > TOKEN_REFERENCE_DEPTH) {
    return { error: `token reference depth exceeded ${TOKEN_REFERENCE_DEPTH}` }
  }
  if (typeof value !== 'string') return { value }
  const whole = value.match(WHOLE_REFERENCE)
  if (whole) return resolveReference(whole[1]!, tokens, depth, stack)
  if (!value.includes('{')) return { value }
  let error: string | undefined
  const replaced = value.replace(EMBEDDED_REFERENCE, (_match, name: string) => {
    const resolved = resolveReference(name, tokens, depth, stack)
    if (resolved.error) error = resolved.error
    return resolved.value === undefined ? `{${name}}` : String(resolved.value)
  })
  return error ? { value: replaced, error } : { value: replaced }
}

function resolveReference(
  name: string,
  tokens: Map<string, FlatToken>,
  depth: number,
  stack: Set<string>,
): { value?: unknown; error?: string } {
  if (stack.has(name)) return { error: `token "${name}" refers to itself` }
  const target = tokens.get(name)
  if (!target) return { error: `token "${name}" was not found` }
  const next = new Set(stack)
  next.add(name)
  return resolveTokenValue(target.value, tokens, depth + 1, next)
}

function readColors(raw: unknown): LibrarySummary['colors'] {
  if (!isRecord(raw)) return []
  return Object.values(raw).flatMap((entry) => {
    if (!isRecord(entry)) return []
    const color = typeof entry.color === 'string' ? entry.color : undefined
    return [
      {
        id: typeof entry.id === 'string' ? entry.id : undefined,
        name: typeof entry.name === 'string' ? entry.name : undefined,
        color,
        opacity: typeof entry.opacity === 'number' ? entry.opacity : undefined,
        path: typeof entry.path === 'string' ? entry.path : undefined,
      },
    ]
  })
}

function readTypographies(raw: unknown): LibrarySummary['typographies'] {
  if (!isRecord(raw)) return []
  return Object.values(raw).flatMap((entry) => {
    if (!isRecord(entry)) return []
    return [
      {
        id: typeof entry.id === 'string' ? entry.id : undefined,
        name: typeof entry.name === 'string' ? entry.name : undefined,
        fontFamily: stringField(entry, 'fontFamily', 'font-family'),
        fontSize: stringField(entry, 'fontSize', 'font-size'),
        fontWeight: stringField(entry, 'fontWeight', 'font-weight'),
        fontStyle: stringField(entry, 'fontStyle', 'font-style'),
        lineHeight: stringField(entry, 'lineHeight', 'line-height'),
        letterSpacing: stringField(entry, 'letterSpacing', 'letter-spacing'),
        textTransform: stringField(entry, 'textTransform', 'text-transform'),
        path: typeof entry.path === 'string' ? entry.path : undefined,
      },
    ]
  })
}

function stringField(entry: Record<string, unknown>, camel: string, kebab: string): string | undefined {
  const value = entry[camel] ?? entry[kebab]
  return typeof value === 'string' ? value : undefined
}

function stringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string')
  if (isRecord(raw)) return Object.keys(raw)
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseTokenNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(?:px)?$/)
  if (!match) return undefined
  return Number(match[1])
}

export function parseTokenColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const color = value.trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : undefined
}
