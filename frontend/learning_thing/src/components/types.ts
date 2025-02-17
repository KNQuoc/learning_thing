// src/components/types.ts
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  timestamp: Date;
  folderId: string | null;
}

export interface Folder {
  id: string;
  name: string;
  timestamp: Date;
  isExpanded?: boolean;
}

export interface ChatStore {
  chats: Chat[];
  folders: Folder[];
  currentChatId: string | null;
  currentFolderId: string | null;
}