#!/usr/bin/env node
/**
 * server.ts
 *
 * MCP stdio server for Mash Design Skills (`penpot-local`).
 * Edits a Penpot file over RPC at PENPOT_BASE_URL with PENPOT_ACCESS_TOKEN.
 * Library colors, typographies, and tokens live in that file.
 * PENPOT_TOKENS_PATH is an optional on-disk JSON file.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { PenpotRpcClient, PenpotRpcError } from './rpc-client.js'
import { PenpotExporterClient } from './exporter-client.js'
import { initCheckpointStore } from './checkpoints.js'
import { projectFileTools, type ToolDefinition } from './tools/project-files.js'
import { contentTools } from './tools/content.js'
import { libraryTools } from './tools/library.js'
import { commentTools } from './tools/comments.js'
import { snapshotTools } from './tools/snapshots.js'
import { registerExportTool } from './tools/export.js'

function registerTools(server: McpServer, client: PenpotRpcClient, tools: ToolDefinition<any>[]): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (input: unknown) => {
        try {
          const parsedInput = tool.inputSchema.parse(input ?? {})
          const result = await tool.handler(client, parsedInput)
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          }
        } catch (err) {
          const message =
            err instanceof PenpotRpcError
              ? `${err.message}`
              : err instanceof Error
                ? err.message
                : 'Unknown error'
          return {
            content: [{ type: 'text', text: message }],
            isError: true,
          }
        }
      },
    )
  }
}

async function main(): Promise<void> {
  const config = loadConfig()
  const client = new PenpotRpcClient(config.PENPOT_BASE_URL, config.PENPOT_ACCESS_TOKEN)

  // Initialise disk-backed checkpoint storage when PENPOT_CHECKPOINTS_PATH is set.
  // Without this, checkpoints live only in process memory (the previous behaviour).
  if (config.PENPOT_CHECKPOINTS_PATH) {
    const { loaded } = await initCheckpointStore(config.PENPOT_CHECKPOINTS_PATH)
    if (loaded > 0) {
      process.stderr.write(`penpot-local: loaded ${loaded} checkpoint(s) from ${config.PENPOT_CHECKPOINTS_PATH}\n`)
    }
  }

  const server = new McpServer({
    name: 'penpot-local',
    version: '0.1.0',
  })

  registerTools(server, client, projectFileTools)
  registerTools(server, client, libraryTools)
  registerTools(server, client, contentTools(config.PENPOT_TOKENS_PATH))
  registerTools(server, client, commentTools)
  registerTools(server, client, snapshotTools)

  // Register penpot_export_shape if any auth mode for the exporter is configured.
  // Priority: PENPOT_LOGIN_EMAIL/PASSWORD (password login) > PENPOT_OIDC_USERNAME/PASSWORD
  // (headless OIDC) > PENPOT_AUTH_TOKEN_COOKIE (pre-obtained SSO/OIDC cookie).
  let ownerProfileId: string | undefined
  try {
    ownerProfileId = (await client.getProfile()).id
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    process.stderr.write(`penpot-local: could not read the access-token profile (${message})\n`)
  }
  if (config.PENPOT_LOGIN_EMAIL && config.PENPOT_LOGIN_PASSWORD) {
    const exporter = new PenpotExporterClient(
      config.PENPOT_BASE_URL,
      {
        mode: 'password',
        email: config.PENPOT_LOGIN_EMAIL,
        password: config.PENPOT_LOGIN_PASSWORD,
      },
      ownerProfileId,
    )
    registerExportTool(server, exporter)
  } else if (config.PENPOT_OIDC_USERNAME && config.PENPOT_OIDC_PASSWORD) {
    const exporter = new PenpotExporterClient(
      config.PENPOT_BASE_URL,
      {
        mode: 'oidc',
        username: config.PENPOT_OIDC_USERNAME,
        password: config.PENPOT_OIDC_PASSWORD,
        provider: config.PENPOT_OIDC_PROVIDER,
      },
      ownerProfileId,
    )
    registerExportTool(server, exporter)
  } else if (config.PENPOT_AUTH_TOKEN_COOKIE) {
    const exporter = new PenpotExporterClient(
      config.PENPOT_BASE_URL,
      {
        mode: 'cookie',
        authTokenCookie: config.PENPOT_AUTH_TOKEN_COOKIE,
      },
      ownerProfileId,
    )
    registerExportTool(server, exporter)
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'Unknown error'
  process.stderr.write(`penpot-local server failed to start: ${message}\n`)
  process.exitCode = 1
})
