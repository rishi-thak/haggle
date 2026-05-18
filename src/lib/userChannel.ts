import { sendIMessage } from "./agentphone";
import { appendWebChatMessage } from "./repo";

export const WEB_CONVERSATION_PREFIX = "web:";

export function isWebConversation(conversationId: string): boolean {
  return conversationId.startsWith(WEB_CONVERSATION_PREFIX);
}

/**
 * Single outbound channel for messages to the human user.
 *
 * Routes by conversationId prefix so the agentphone path stays unchanged:
 *   - `web:*`  -> Convex-backed chat UI fallback
 *   - other    -> Agentphone (iMessage/SMS)
 *
 * To put traffic back on agentphone, just stop creating `web:` conversations.
 */
export async function sendUserMessage(
  conversationId: string,
  text: string,
  toNumber?: string,
  fromNumber?: string,
): Promise<void> {
  if (isWebConversation(conversationId)) {
    await appendWebChatMessage({
      conversationId,
      direction: "outbound",
      body: text,
    });
    return;
  }
  await sendIMessage(conversationId, text, toNumber, fromNumber);
}
