/**
 * ChatOps Page
 *
 * Default route ("/") — Chat-first operator interface.
 * Wraps the ChatTranscript component.
 */

import { ChatTranscript } from '@/components/chat/ChatTranscript';

export default function ChatOps() {
  return (
    <div className="h-full">
      <ChatTranscript />
    </div>
  );
}
