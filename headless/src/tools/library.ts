/**
 * tools/library.ts
 *
 * Writes Penpot 2.16.2 library colors, typographies, token sets, and themes
 * through `update-file`. The on-disk JSON token file stays a convenience for
 * shape builders; these tools persist the file's own library.
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { PenpotRpcClient } from '../rpc-client.js'
import {
  addColorChange,
  addTypographyChange,
  deleteColorChange,
  deleteTypographyChange,
  setActiveTokenThemesChange,
  setTokenChange,
  setTokenSetChange,
  setTokenThemeChange,
  themePath,
  updateColorChange,
  updateTypographyChange,
  type LibraryColorInput,
  type TokenInput,
  type TypographyInput,
} from '../library.js'
import type { ToolDefinition } from './project-files.js'

const colorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
  opacity: z.number().min(0).max(1).optional(),
  path: z.string().optional(),
})

const typographySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  fontFamily: z.string().min(1),
  fontId: z.string().min(1).optional(),
  fontVariantId: z.string().min(1).optional(),
  fontSize: z.string().min(1),
  fontWeight: z.string().min(1),
  fontStyle: z.string().min(1).optional(),
  lineHeight: z.string().min(1).optional(),
  letterSpacing: z.string().min(1).optional(),
  textTransform: z.string().min(1).optional(),
  path: z.string().optional(),
})

const tokenSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  type: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
})

function colorInput(color: z.infer<typeof colorSchema>, id = color.id ?? randomUUID()): LibraryColorInput {
  return { id, name: color.name, color: color.color, opacity: color.opacity, path: color.path }
}

function typographyInput(typography: z.infer<typeof typographySchema>, id = typography.id ?? randomUUID()): TypographyInput {
  return {
    id,
    name: typography.name,
    fontFamily: typography.fontFamily,
    fontId: typography.fontId,
    fontVariantId: typography.fontVariantId,
    fontSize: typography.fontSize,
    fontWeight: typography.fontWeight,
    fontStyle: typography.fontStyle,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    textTransform: typography.textTransform,
    path: typography.path,
  }
}

const addLibraryColor: ToolDefinition<{ fileId: string; color: z.infer<typeof colorSchema> }> = {
  name: 'penpot_add_library_color',
  description:
    'Add a color to the Penpot file library (the colors panel), via an add-color file change. ' +
    'Pass a 3- or 6-digit hex color. Returns the library color id.',
  inputSchema: z.object({
    fileId: z.string().min(1),
    color: colorSchema,
  }),
  handler: async (client, { fileId, color }) => {
    const input = colorInput(color)
    const result = await update(client, fileId, [addColorChange(input)])
    return { colorId: input.id, revn: result.revn }
  },
}

const updateLibraryColor: ToolDefinition<{ fileId: string; color: z.infer<typeof colorSchema> & { id?: string } }> = {
  name: 'penpot_update_library_color',
  description: 'Replace a library color by id (mod-color). The id must already exist in the file library.',
  inputSchema: z.object({
    fileId: z.string().min(1),
    color: colorSchema.extend({ id: z.string().uuid() }),
  }),
  handler: async (client, { fileId, color }) => {
    const input = colorInput(color, color.id)
    const result = await update(client, fileId, [updateColorChange(input)])
    return { colorId: input.id, revn: result.revn }
  },
}

const deleteLibraryColor: ToolDefinition<{ fileId: string; colorId: string }> = {
  name: 'penpot_delete_library_color',
  description: 'Remove a library color by id (del-color).',
  inputSchema: z.object({
    fileId: z.string().min(1),
    colorId: z.string().uuid(),
  }),
  handler: async (client, { fileId, colorId }) => {
    const result = await update(client, fileId, [deleteColorChange(colorId)])
    return { colorId, revn: result.revn }
  },
}

const addTypography: ToolDefinition<{ fileId: string; typography: z.infer<typeof typographySchema> }> = {
  name: 'penpot_add_typography',
  description:
    'Add a typography style to the Penpot file library (add-typography). ' +
    'fontSize, fontWeight, lineHeight, and letterSpacing are strings, matching Penpot. ' +
    'fontStyle defaults to "normal" and textTransform to "none".',
  inputSchema: z.object({
    fileId: z.string().min(1),
    typography: typographySchema,
  }),
  handler: async (client, { fileId, typography }) => {
    const input = typographyInput(typography)
    const result = await update(client, fileId, [addTypographyChange(input)])
    return { typographyId: input.id, revn: result.revn }
  },
}

const updateTypography: ToolDefinition<{ fileId: string; typography: z.infer<typeof typographySchema> }> = {
  name: 'penpot_update_typography',
  description: 'Replace a library typography by id (mod-typography).',
  inputSchema: z.object({
    fileId: z.string().min(1),
    typography: typographySchema.extend({ id: z.string().uuid() }),
  }),
  handler: async (client, { fileId, typography }) => {
    const input = typographyInput(typography, typography.id)
    const result = await update(client, fileId, [updateTypographyChange(input)])
    return { typographyId: input.id, revn: result.revn }
  },
}

const deleteTypography: ToolDefinition<{ fileId: string; typographyId: string }> = {
  name: 'penpot_delete_typography',
  description: 'Remove a library typography by id (del-typography).',
  inputSchema: z.object({
    fileId: z.string().min(1),
    typographyId: z.string().uuid(),
  }),
  handler: async (client, { fileId, typographyId }) => {
    const result = await update(client, fileId, [deleteTypographyChange(typographyId)])
    return { typographyId, revn: result.revn }
  },
}

const tokenSetSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  tokens: z.array(tokenSchema).default([]),
})

const themeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  group: z.string().default(''),
  description: z.string().optional(),
  sets: z.array(z.string().min(1)).optional(),
})

const writeTokenSet: ToolDefinition<{
  fileId: string
  set: z.infer<typeof tokenSetSchema>
  theme?: z.infer<typeof themeSchema>
  activate: boolean
}> = {
  name: 'penpot_write_token_set',
  description:
    'Create or replace a Penpot token set and its tokens in one update-file call (set-token-set, then one ' +
    'set-token per entry). Token type accepts Penpot names (color, font-size, spacing, border-radius) or ' +
    'DTCG names (color, fontSizes, spacing, borderRadius). Optionally creates a theme that enables the set ' +
    'and marks that theme active. Ids you omit are generated and returned; keep them for later updates. ' +
    'This writes the file library. It does not use the on-disk JSON token file.',
  inputSchema: z.object({
    fileId: z.string().min(1),
    set: tokenSetSchema,
    theme: themeSchema.optional(),
    activate: z.boolean().default(true),
  }),
  handler: async (client, { fileId, set, theme, activate }) => {
    const setId = set.id ?? randomUUID()
    const tokens: TokenInput[] = set.tokens.map((token) => ({
      id: token.id ?? randomUUID(),
      name: token.name,
      type: token.type,
      value: token.value,
      description: token.description,
    }))
    const changes = [
      setTokenSetChange({ id: setId, name: set.name, description: set.description }),
      ...tokens.map((token) => setTokenChange(setId, token)),
    ]
    let themeId: string | undefined
    let activeThemePath: string | undefined
    if (theme) {
      themeId = theme.id ?? randomUUID()
      const sets = theme.sets ?? [set.name]
      changes.push(
        setTokenThemeChange({
          id: themeId,
          name: theme.name,
          group: theme.group,
          description: theme.description,
          sets,
        }),
      )
      if (activate) {
        activeThemePath = themePath(theme.group, theme.name)
        changes.push(setActiveTokenThemesChange([activeThemePath]))
      }
    }
    const result = await update(client, fileId, changes)
    return {
      setId,
      tokenIds: Object.fromEntries(tokens.map((token) => [token.name, token.id])),
      themeId,
      activeThemePath,
      revn: result.revn,
    }
  },
}

async function update(client: PenpotRpcClient, fileId: string, changes: Array<Record<string, unknown>>) {
  const file = await client.getFile(fileId)
  return client.updateFile(fileId, file.revn, file.vern, changes)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const libraryTools: ToolDefinition<any>[] = [
  addLibraryColor,
  updateLibraryColor,
  deleteLibraryColor,
  addTypography,
  updateTypography,
  deleteTypography,
  writeTokenSet,
]
