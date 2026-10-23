import { type ReplyMarkup } from "./keyboards";

export type TelegramUser = {
  id: number;
  first_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  title?: string;
  username?: string;
};

export type TelegramForwardOrigin = {
  type?: string;
  chat?: TelegramChat;
  message_id?: number;
};

export type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string }>;
  forward_origin?: TelegramForwardOrigin;
  forward_from_chat?: TelegramChat;
  forward_from_message_id?: number;
  reply_to_message?: TelegramMessage;
  reply_markup?: ReplyMarkup;
  message_thread_id?: number;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type CommandContext = {
  chatId: number;
  userId: number;
  message: TelegramMessage;
  text: string;
  command: string;
  args: string;
};
