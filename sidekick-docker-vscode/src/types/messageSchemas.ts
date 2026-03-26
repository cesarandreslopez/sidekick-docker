import { z } from 'zod';

/**
 * Zod schema for validating incoming WebviewMessage at the
 * extension ↔ webview trust boundary. VSCode's onDidReceiveMessage
 * types the payload as `any`, so this provides runtime validation.
 */
export const WebviewMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('webviewReady') }),
  z.object({ type: z.literal('switchPanel'), panelIndex: z.number() }),
  z.object({ type: z.literal('selectItem'), panelId: z.string(), itemId: z.string().nullable() }),
  z.object({ type: z.literal('switchDetailTab'), tabIndex: z.number() }),
  z.object({
    type: z.literal('sortChanged'),
    field: z.enum(['state', 'name', 'cpu', 'mem', 'net', 'io', 'pids']),
    reversed: z.boolean(),
  }),
  z.object({ type: z.literal('action'), actionType: z.string(), itemId: z.string(), panelId: z.string() }),
  z.object({ type: z.literal('filterChange'), filter: z.string() }),
  z.object({ type: z.literal('execContainer'), containerId: z.string() }),
  z.object({ type: z.literal('requestRefresh') }),
  z.object({ type: z.literal('selectComposeService'), projectName: z.string(), serviceName: z.string().nullable() }),
  z.object({ type: z.literal('copyLogs'), text: z.string() }),
  z.object({ type: z.literal('toggleCompareItem'), itemId: z.string().nullable(), panelId: z.string() }),
]);
