import { describe, it, expect, vi } from 'vitest'
import { contentTools } from '../../src/tools/content.js'
import { ROOT_FRAME_ID } from '../../src/shape-builders.js'
import type { PenpotRpcClient } from '../../src/rpc-client.js'
import type { ZodType } from 'zod'

type AnyTool = {
  name: string
  inputSchema: ZodType<unknown>
  handler: (client: PenpotRpcClient, input: unknown) => Promise<unknown>
}

const TOOLS = contentTools('/dev/null') as unknown as AnyTool[]
const tool = (name: string) => {
  const found = TOOLS.find((entry) => entry.name === name)
  if (!found) throw new Error(`missing ${name}`)
  return found
}

const PAGE = 'page-1'
const FILE = 'file-1'
const TOKENS = '/tmp/mash-layout-item-tokens-missing.json'

function client(objects: Record<string, Record<string, unknown>>): PenpotRpcClient & {
  updateFile: ReturnType<typeof vi.fn>
} {
  return {
    getFile: vi.fn().mockResolvedValue({
      id: FILE,
      revn: 3,
      vern: 0,
      data: { pages: [PAGE], pagesIndex: { [PAGE]: { name: 'Page', objects } } },
    }),
    updateFile: vi.fn().mockResolvedValue({ revn: 4 }),
  } as unknown as PenpotRpcClient & { updateFile: ReturnType<typeof vi.fn> }
}

describe('layoutItem replace', () => {
  it('drops a stale grid cell when the new layout item omits it', async () => {
    const shape = {
      id: 'card',
      type: 'rect',
      name: 'card',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      parentId: 'metrics',
      frameId: 'metrics',
      'parent-id': 'metrics',
      'frame-id': 'metrics',
      layoutItemColumn: 1,
      layoutItemRow: 1,
      'layout-item-column': 1,
      'layout-item-row': 1,
      fills: [],
      strokes: [],
      shadows: [],
    }
    const rpc = client({ card: shape })
    await tool('penpot_update_shapes').handler(rpc, {
      fileId: FILE,
      pageId: PAGE,
      tokensPath: TOKENS,
      patches: [{ shapeId: 'card', layoutItem: { absolute: true, horizontalSizing: 'fix', verticalSizing: 'fix' } }],
    })
    const change = rpc.updateFile.mock.calls[0][3][0]
    expect(change.obj.layoutItemColumn).toBeUndefined()
    expect(change.obj.layoutItemRow).toBeUndefined()
    expect(change.obj['layout-item-column']).toBeUndefined()
    expect(change.obj['layout-item-row']).toBeUndefined()
    expect(change.obj['layout-item-absolute']).toBe(true)
    expect(change.obj['layout-item-h-sizing']).toBe('fix')
  })
})

describe('text character updates', () => {
  it('keeps the existing fill when only the characters change', async () => {
    const shape = {
      id: 'label',
      type: 'text',
      name: 'label',
      x: 0,
      y: 0,
      width: 120,
      height: 24,
      rotation: 0,
      parentId: ROOT_FRAME_ID,
      frameId: ROOT_FRAME_ID,
      'parent-id': ROOT_FRAME_ID,
      'frame-id': ROOT_FRAME_ID,
      fills: [{ fillColor: '#1f6f78', fillOpacity: 1 }],
      strokes: [],
      shadows: [],
      content: {
        type: 'root',
        children: [
          {
            type: 'paragraph-set',
            children: [
              {
                type: 'paragraph',
                fontFamily: 'sourcesanspro',
                fontSize: '16',
                fontWeight: '400',
                children: [{ text: 'Alerts' }],
              },
            ],
          },
        ],
      },
    }
    const rpc = client({ label: shape })
    await tool('penpot_update_shapes').handler(rpc, {
      fileId: FILE,
      pageId: PAGE,
      tokensPath: TOKENS,
      patches: [{ shapeId: 'label', characters: 'Open alerts' }],
    })
    const change = rpc.updateFile.mock.calls[0][3][0]
    const paragraph = change.obj.content.children[0].children[0]
    expect(paragraph.children[0].text).toBe('Open alerts')
    expect(paragraph.fills[0]['fill-color']).toBe('#1f6f78')
  })
})

describe('text grow type', () => {
  it('keeps the text box fixed when growType is omitted', async () => {
    const rpc = client({})
    await tool('penpot_add_shapes').handler(rpc, {
      fileId: FILE,
      pageId: PAGE,
      tokensPath: TOKENS,
      shapes: [
        {
          type: 'text',
          name: 'label',
          x: 0,
          y: 0,
          width: 120,
          height: 24,
          characters: 'Alerts',
        },
      ],
    })
    const change = rpc.updateFile.mock.calls[0][3][0]
    expect(change.obj['grow-type']).toBe('fixed')
  })
})

describe('nested add frame id', () => {
  it('uses the parent id when frameId is left at the page root', async () => {
    const rpc = client({})
    await tool('penpot_add_shapes').handler(rpc, {
      fileId: FILE,
      pageId: PAGE,
      tokensPath: TOKENS,
      shapes: [
        {
          type: 'rect',
          name: 'probe',
          parentId: 'metrics',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fillColor: '#9a3b2f',
        },
      ],
    })
    const change = rpc.updateFile.mock.calls[0][3][0]
    expect(change['frame-id']).toBe('metrics')
    expect(change.obj['frame-id']).toBe('metrics')
    expect(change['parent-id']).toBe('metrics')
    expect(change['frame-id']).not.toBe(ROOT_FRAME_ID)
  })
})
