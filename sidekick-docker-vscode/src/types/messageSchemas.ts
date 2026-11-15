import { z } from 'zod';
import type { WebviewMessage } from './messages';

/**
 * Zod schema for validating incoming WebviewMessage at the
 * extension ↔ webview trust boundary. VSCode's onDidReceiveMessage
 * types the payload as `any`, so this provides runtime validation.
 */
export const WebviewMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('webviewReady') }),
  z.object({ type: z.literal('retryDetail'), kind: z.enum(['inspect', 'changes', 'layers']), itemId: z.string().min(1) }),
  z.object({ type: z.literal('retryStreams') }),
  z.object({ type: z.literal('switchPanel'), panelIndex: z.number() }),
  z.object({ type: z.literal('selectItem'), panelId: z.enum(['containers', 'services', 'images', 'volumes', 'networks']), itemId: z.string().nullable() }),
  z.object({ type: z.literal('switchDetailTab'), tabIndex: z.number() }),
  z.object({
    type: z.literal('sortChanged'),
    field: z.enum(['state', 'name', 'cpu', 'mem', 'net', 'io', 'pids']),
    reversed: z.boolean(),
  }),
  z.object({ type: z.literal('action'), actionType: z.string(), itemId: z.string(), panelId: z.string() }),
  z.object({ type: z.literal('execContainer'), containerId: z.string() }),
  z.object({ type: z.literal('requestRefresh') }),
  z.object({ type: z.literal('selectComposeService'), projectName: z.string(), serviceName: z.string().nullable() }),
  z.object({ type: z.literal('copyLogs'), text: z.string() }),
  z.object({ type: z.literal('copyText'), text: z.string() }),
  z.object({ type: z.literal('toggleCompareItem'), itemId: z.string().nullable(), panelId: z.string() }),
  z.object({ type: z.literal('retryConnect') }),
]);

/**
 * The schema is hand-written beside the `WebviewMessage` union. This fails
 * `tsc` the moment they disagree, instead of a new or changed message being
 * silently dropped at runtime by `safeParse`.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type AssertTrue<T extends true> = T;
export type WebviewMessageSchemaInSync = AssertTrue<Equals<z.infer<typeof WebviewMessageSchema>, WebviewMessage>>;
