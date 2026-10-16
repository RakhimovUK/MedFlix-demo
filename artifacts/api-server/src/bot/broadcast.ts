export type BroadcastResult = {
  total: number;
  sent: number;
  blocked: number;
  failed: number;
  blockedIds: number[];
};

export type SendErrorKind =
  | { kind: "blocked" }
  | { kind: "retry"; seconds: number }
  | { kind: "other" };

export function classifySendError(message: string): SendErrorKind {
  const retry = /retry after (\d+)/i.exec(message);
  if (retry) return { kind: "retry", seconds: Number(retry[1]) };
  if (/blocked by the user|user is deactivated|chat not found|bot was kicked|PEER_ID_INVALID/i.test(message)) {
    return { kind: "blocked" };
  }
  return { kind: "other" };
}

/** Xabarni ketma-ket (Telegram limitiga mos, sekin) tarqatadi; xato bitta odamda to'xtamaydi. */
export async function runBroadcast(opts: {
  recipients: number[];
  send: (chatId: number) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  delayMs?: number;
}): Promise<BroadcastResult> {
  const delayMs = opts.delayMs ?? 50;
  const result: BroadcastResult = {
    total: opts.recipients.length,
    sent: 0,
    blocked: 0,
    failed: 0,
    blockedIds: [],
  };

  for (const chatId of opts.recipients) {
    let attempt = 0;
    while (true) {
      try {
        await opts.send(chatId);
        result.sent += 1;
        break;
      } catch (err: unknown) {
        const info = classifySendError(err instanceof Error ? err.message : String(err));
        if (info.kind === "retry" && attempt === 0) {
          attempt += 1;
          await opts.sleep(info.seconds * 1000 + 500);
          continue;
        }
        if (info.kind === "blocked") {
          result.blocked += 1;
          result.blockedIds.push(chatId);
        } else {
          result.failed += 1;
        }
        break;
      }
    }
    await opts.sleep(delayMs);
  }

  return result;
}
