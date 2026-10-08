import type { SupabaseClient } from '@supabase/supabase-js';
import { CATCH_UP_PAGE_SIZE, INITIAL_PAGE_SIZE, type ChatMessage } from './messageList';

const COLUMNS = 'id, conversation_id, sender_user_id, body, mention_targets, created_at';

export interface NewMessage {
  conversationId: string;
  senderUserId: string;
  body: string;
  mentionTargets: string[];
}

export interface MessagesApi {
  fetchLatest(conversationId: string): Promise<ChatMessage[]>;
  fetchSince(conversationId: string, sinceIso: string): Promise<ChatMessage[]>;
  fetchOlder(conversationId: string, before: ChatMessage): Promise<ChatMessage[]>;
  insertMessage(input: NewMessage): Promise<ChatMessage>;
  isConversationReadable(conversationId: string): Promise<boolean>;
}

// Every read here is authorized by `messages_member_select` / `conversations_member_select` at
// the moment it runs. That is the whole point of signal-then-fetch (ADR-2026-10-07): nothing in
// this file decides who may read.
export function createMessagesApi(client: Pick<SupabaseClient, 'from'>): MessagesApi {
  return {
    async fetchLatest(conversationId) {
      const { data, error } = await client
        .from('messages')
        .select(COLUMNS)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(INITIAL_PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },

    async fetchSince(conversationId, sinceIso) {
      const all: ChatMessage[] = [];
      for (let from = 0; ; from += CATCH_UP_PAGE_SIZE) {
        const { data, error } = await client
          .from('messages')
          .select(COLUMNS)
          .eq('conversation_id', conversationId)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + CATCH_UP_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data ?? []) as ChatMessage[];
        all.push(...page);
        if (page.length < CATCH_UP_PAGE_SIZE) return all;
      }
    },

    async fetchOlder(conversationId, before) {
      // Row-wise "(created_at, id) < (before.created_at, before.id)". The timestamp is quoted
      // because it contains characters PostgREST's filter grammar reserves.
      const { data, error } = await client
        .from('messages')
        .select(COLUMNS)
        .eq('conversation_id', conversationId)
        .or(`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(INITIAL_PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },

    async insertMessage({ conversationId, senderUserId, body, mentionTargets }) {
      // Exactly the four columns the grant allows. `id` and `created_at` are the database's.
      const { data, error } = await client
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_user_id: senderUserId,
          body,
          mention_targets: mentionTargets,
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return data as ChatMessage;
    },

    async isConversationReadable(conversationId) {
      const { data, error } = await client.from('conversations').select('id').eq('id', conversationId).maybeSingle();
      if (error) throw error;
      return data !== null;
    },
  };
}
