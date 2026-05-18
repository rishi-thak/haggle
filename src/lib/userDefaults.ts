import { addMemory, searchMemories } from "./supermemory";

// --- Address ---

export async function getServiceAddress(
  containerTag: string,
): Promise<{ address: string; label: string } | null> {
  const results = await searchMemories(containerTag, "service address home location", 5);
  if (!results.length) return null;

  // Find results with address metadata first
  const withMeta = results.find(
    (r) => r.metadata?.type === "address" && typeof r.metadata.address === "string",
  );
  if (withMeta) {
    return {
      address: withMeta.metadata!.address as string,
      label: (withMeta.metadata!.label as string) ?? "home",
    };
  }

  // Fallback: parse from content like "Service address (home): 123 Oak St, Austin TX"
  const match = (results[0].content ?? "").match(/Service address \(([^)]+)\):\s*(.+)/i);
  if (match) {
    return { address: match[2].trim(), label: match[1].trim() };
  }

  return null;
}

export async function saveServiceAddress(
  containerTag: string,
  address: string,
  label?: string,
): Promise<void> {
  const resolvedLabel = label ?? "home";
  const content = `Service address (${resolvedLabel}): ${address}`;
  await addMemory(containerTag, content, {
    type: "address",
    label: resolvedLabel,
    address,
  });
}

// --- Scheduling ---

export async function getSchedulingPreferences(
  containerTag: string,
): Promise<string[]> {
  const results = await searchMemories(
    containerTag,
    "scheduling preference time availability morning afternoon evening",
    10,
  );
  if (!results.length) return [];

  const preferences: string[] = [];
  for (const r of results) {
    if (r.metadata?.type === "scheduling_preference") {
      // Content is the raw preference text
      preferences.push(r.content);
    } else {
      // Try to extract preference-like phrases
      const content = (r.content ?? "").toLowerCase();
      if (
        content.includes("prefer") ||
        content.includes("morning") ||
        content.includes("afternoon") ||
        content.includes("evening") ||
        content.includes("don't schedule") ||
        content.includes("best") ||
        content.includes("available") ||
        content.includes("before") ||
        content.includes("after")
      ) {
        preferences.push(r.content);
      }
    }
  }

  return preferences;
}

export async function saveSchedulingPreference(
  containerTag: string,
  preference: string,
): Promise<void> {
  await addMemory(containerTag, preference, {
    type: "scheduling_preference",
  });
}

// --- Communication Style ---

export interface UserStyle {
  shortReplies: boolean;
  usesEmoji: boolean;
  asksQuestions: boolean;
  tone: "casual" | "formal" | "neutral";
}

const DEFAULT_STYLE: UserStyle = {
  shortReplies: true,
  usesEmoji: false,
  asksQuestions: false,
  tone: "casual",
};

export async function getUserStyle(containerTag: string): Promise<UserStyle> {
  const results = await searchMemories(
    containerTag,
    "communication style tone replies emoji questions",
    3,
  );

  const styleResult = results.find((r) => r.metadata?.type === "communication_style");
  if (!styleResult) return { ...DEFAULT_STYLE };

  const content = (styleResult.content ?? "").toLowerCase();

  const shortReplies = content.includes("short replies") || content.includes("brief");
  const usesEmoji = content.includes("uses emoji") || content.includes("emoji: yes");
  const asksQuestions =
    content.includes("asks questions") || content.includes("questions: yes");

  let tone: "casual" | "formal" | "neutral" = "casual";
  if (content.includes("formal")) tone = "formal";
  else if (content.includes("neutral")) tone = "neutral";

  return { shortReplies, usesEmoji, asksQuestions, tone };
}

export async function updateUserStyle(
  containerTag: string,
  messages: string[],
): Promise<void> {
  if (messages.length < 5) return;

  const totalWords = messages.reduce(
    (sum, msg) => sum + msg.split(/\s+/).filter(Boolean).length,
    0,
  );
  const avgWords = totalWords / messages.length;
  const shortReplies = avgWords < 10;

  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const messagesWithEmoji = messages.filter((m) => emojiPattern.test(m)).length;
  const usesEmoji = messagesWithEmoji / messages.length > 0.2;

  const messagesWithQuestions = messages.filter((m) => m.includes("?")).length;
  const asksQuestions = messagesWithQuestions / messages.length > 0.3;

  // Infer tone
  const allText = messages.join(" ").toLowerCase();
  const casualSignals = /\b(lol|haha|nah|yeah|yo|cool|dope|bet|ty|thx|k|gonna|wanna)\b/;
  const formalSignals = /\b(please|thank you|would you|could you|kindly|appreciate|regards)\b/;

  let tone: "casual" | "formal" | "neutral" = "neutral";
  const hasCasual = casualSignals.test(allText);
  const hasFormal = formalSignals.test(allText);
  if (hasCasual && !hasFormal) tone = "casual";
  else if (hasFormal && !hasCasual) tone = "formal";

  const summary = [
    shortReplies ? "short replies" : "longer replies",
    usesEmoji ? "uses emoji" : "no emoji",
    asksQuestions ? "asks questions" : "few questions",
    `tone: ${tone}`,
  ].join(", ");

  const content = `Communication style: ${summary}`;
  await addMemory(containerTag, content, { type: "communication_style" });
}

// --- Combined Context ---

export async function buildUserContext(
  containerTag: string,
  _service?: string,
): Promise<string> {
  const [addressResult, scheduling, style] = await Promise.all([
    getServiceAddress(containerTag),
    getSchedulingPreferences(containerTag),
    getUserStyle(containerTag),
  ]);

  const parts: string[] = [];

  if (addressResult) {
    parts.push(`User address: ${addressResult.address}`);
  }

  if (scheduling.length) {
    parts.push(scheduling.join(". "));
  }

  const styleParts: string[] = [];
  styleParts.push(`Communicates ${style.tone}ly`);
  if (style.shortReplies) styleParts.push("with short replies");
  if (style.usesEmoji) styleParts.push("uses emoji");
  if (style.asksQuestions) styleParts.push("asks lots of questions");
  parts.push(styleParts.join(" "));

  return parts.join(". ") + ".";
}
