import { describe, expect, it } from 'vitest'
import { addObj, replaceFrameLayout, ROOT_FRAME_ID } from '../../src/shape-builders.js'
import {
  addColorChange,
  addTypographyChange,
  mergeAppliedTokens,
  readLibrarySummary,
  setActiveTokenThemesChange,
  setTokenChange,
  setTokenSetChange,
  setTokenThemeChange,
  themePath,
  TOKEN_REFERENCE_DEPTH,
} from '../../src/library.js'

const COLOR_ID = '11111111-1111-4111-8111-111111111111'
const TYPE_ID = '22222222-2222-4222-8222-222222222222'
const SET_ID = '33333333-3333-4333-8333-333333333333'
const TOKEN_ID = '44444444-4444-4444-8444-444444444444'
const THEME_ID = '55555555-5555-4555-8555-555555555555'

describe('library color and typography changes', () => {
  it('builds an add-color payload for Penpot 2.16.2', () => {
    expect(addColorChange({ id: COLOR_ID, name: 'accent', color: '#2563eb', opacity: 1 })).toEqual({
      type: 'add-color',
      color: { id: COLOR_ID, name: 'accent', color: '#2563eb', opacity: 1 },
    })
  })

  it('builds an add-typography payload with the required font fields', () => {
    expect(
      addTypographyChange({
        id: TYPE_ID,
        name: 'heading',
        fontFamily: 'Inter',
        fontSize: '32',
        fontWeight: '700',
        lineHeight: '1.2',
      }),
    ).toEqual({
      type: 'add-typography',
      typography: {
        id: TYPE_ID,
        name: 'heading',
        'font-id': 'Inter',
        'font-family': 'Inter',
        'font-variant-id': 'regular',
        'font-size': '32',
        'font-weight': '700',
        'font-style': 'normal',
        'line-height': '1.2',
        'letter-spacing': '0',
        'text-transform': 'none',
      },
    })
  })
})

describe('token set, token, and theme changes', () => {
  it('builds a set-token-set payload and a set-token payload with a DTCG type', () => {
    expect(setTokenSetChange({ id: SET_ID, name: 'import-welcome' })).toEqual({
      type: 'set-token-set',
      id: SET_ID,
      attrs: { id: SET_ID, name: 'import-welcome', description: '', tokens: {} },
    })
    expect(
      setTokenChange(SET_ID, { id: TOKEN_ID, name: 'color.accent', type: 'color', value: '#2563eb' }),
    ).toEqual({
      type: 'set-token',
      'set-id': SET_ID,
      'token-id': TOKEN_ID,
      attrs: { id: TOKEN_ID, name: 'color.accent', type: 'color', value: '#2563eb' },
    })
    expect(setTokenChange(SET_ID, { id: TOKEN_ID, name: 'font.size', type: 'font-size', value: '16px' }).attrs).toMatchObject({
      type: 'fontSizes',
    })
  })

  it('builds a theme and an active-theme path of group/name', () => {
    expect(
      setTokenThemeChange({ id: THEME_ID, name: 'light', group: 'mode', sets: ['import-welcome'] }),
    ).toMatchObject({
      type: 'set-token-theme',
      id: THEME_ID,
      attrs: { group: 'mode', name: 'light', sets: ['import-welcome'] },
    })
    expect(themePath('mode', 'light')).toBe('mode/light')
    expect(themePath('', 'light')).toBe('/light')
    expect(setActiveTokenThemesChange(['mode/light'])).toEqual({
      type: 'set-active-token-themes',
      'theme-paths': ['mode/light'],
    })
  })
})

describe('applied tokens and reference resolution', () => {
  it('merges token names onto an existing applied-tokens map', () => {
    expect(mergeAppliedTokens({ fill: 'color.bg' }, { 'font-size': 'font.size.body' })).toEqual({
      fill: 'color.bg',
      'font-size': 'font.size.body',
    })
  })

  it('resolves {other.token} references to depth 10 and reports a deeper chain', () => {
    const chain: Record<string, { $value: string; $type: string }> = {}
    let previous = 'color.base'
    chain.base = { $value: '#111111', $type: 'color' }
    for (let i = 1; i <= TOKEN_REFERENCE_DEPTH + 1; i++) {
      chain[`step${i}`] = { $value: `{color.${previous.startsWith('color.') ? previous.slice(6) : previous}}`, $type: 'color' }
      previous = `step${i}`
    }
    // step1 -> base, step2 -> step1, ... so step10 is 10 hops from its own value lookup.
    const summary = readLibrarySummary({
      data: {
        tokensLib: {
          core: { color: chain },
          $metadata: { tokenSetOrder: ['core'], activeSets: ['core'], activeThemes: [] },
        },
      },
    })
    expect(summary.resolvedTokens['color.base']).toBe('#111111')
    expect(summary.resolvedTokens['color.step1']).toBe('#111111')
    expect(summary.resolvedTokens['color.step10']).toBe('#111111')
    const tooDeep = summary.tokenSets[0]?.tokens.find((token) => token.name === 'color.step11')
    expect(tooDeep?.error).toMatch(/depth exceeded 10/)
  })
})

describe('layout edit payload', () => {
  it('replaces a frame layout and drops the stale camelCase direction', () => {
    const existing = {
      id: 'shape-1',
      type: 'frame',
      name: 'Board',
      layout: 'flex',
      layoutFlexDir: 'column',
      'parent-id': ROOT_FRAME_ID,
      'frame-id': ROOT_FRAME_ID,
    }
    const updated = replaceFrameLayout(existing, { type: 'flex', dir: 'row', columnGap: 16, rowGap: 8 })
    const change = addObj('page-1', updated)
    expect(change.type).toBe('add-obj')
    expect(change.obj['layout-flex-dir']).toBe('row')
    expect(change.obj['layout-gap']).toEqual({ 'row-gap': 8, 'column-gap': 16 })
    expect(change.obj.layoutFlexDir).toBeUndefined()
    expect(change['page-id']).toBe('page-1')
  })
})
