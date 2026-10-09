import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useSession } from '../auth/SessionProvider';
import { watchAppActivity } from './appActivity';
import { joinConversationChannel } from './conversationChannel';
import {
  INITIAL_CONVERSATION_STATE,
  createConversationSession,
  type ConversationSession,
  type ConversationState,
} from './conversationSession';
import { createMessagesApi } from './messagesApi';
import type { ChatMessage } from './messageList';

export interface ConversationMessages extends ConversationState {
  loadOlder(): Promise<void>;
  send(body: string, mentionTargets?: string[]): Promise<ChatMessage>;
}

// The interface class-chat-ui (#24) builds on. Thin by design: all behaviour lives in
// conversationSession.ts, where it is tested. Listening lasts exactly as long as the calling
// screen is mounted and the app is in the foreground.
//
// One instance per conversation at a time. supabase-js hands two joins of the same topic the
// same channel, so a second instance would never hear a signal and the first to unmount would
// remove the channel from under the other.
//
// Failures the session recovers from show up as `errorCode` (a code, never the error's text).
// SessionDeps.onError is where they go to error reporting once the client has it.
export function useConversationMessages(conversationId: string): ConversationMessages {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  // State is stored with the (user, conversation) it belongs to and ignored for any other, so
  // switching conversation or account can never show the previous one's messages, even for a
  // single render.
  const key = `${userId ?? ''}:${conversationId}`;
  const [snapshot, setSnapshot] = useState<{ key: string; state: ConversationState } | null>(null);
  const state = snapshot?.key === key ? snapshot.state : INITIAL_CONVERSATION_STATE;
  const conversationRef = useRef<ConversationSession | null>(null);

  useEffect(() => {
    if (!userId) return;

    let mounted = true;
    const conversation = createConversationSession(conversationId, userId, {
      api: createMessagesApi(supabase),
      joinChannel: (id, handlers) => joinConversationChannel(supabase, id, handlers),
      onChange: (next) => {
        if (mounted) setSnapshot({ key, state: next });
      },
    });
    conversationRef.current = conversation;
    void conversation.open();
    const stopWatching = watchAppActivity(
      () => void conversation.open(),
      () => void conversation.close(),
    );

    return () => {
      mounted = false;
      stopWatching();
      conversationRef.current = null;
      void conversation.close();
    };
  }, [conversationId, userId, key]);

  const loadOlder = useCallback(() => conversationRef.current?.loadOlder() ?? Promise.resolve(), []);
  const send = useCallback((body: string, mentionTargets: string[] = []) => {
    const conversation = conversationRef.current;
    if (!conversation) return Promise.reject(new Error('conversation is not open'));
    return conversation.send(body, mentionTargets);
  }, []);

  return { ...state, loadOlder, send };
}
