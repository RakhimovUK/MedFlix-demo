import { getDatabase } from "./database";
import { createRestrictionStore, protectOptionsFor } from "./restrictions";

export const restrictionStore = createRestrictionStore(getDatabase());

/** Bot nusxa yuboradigan chat uchun cheklov parametri (shaxsiy chatda chat ID = foydalanuvchi ID). */
export function protectFor(chatId: number | string): { protect_content?: true } {
  return protectOptionsFor(restrictionStore, chatId);
}
