// src/components/Chat.tsx
import { useState, useEffect, useRef } from "react";
import type { FormEvent, DragEvent } from "react";
import {
  Send,
  Trash2,
  Moon,
  Sun,
  Plus,
  MessageSquare,
  Folder,
  ChevronRight,
  ChevronDown,
  Edit2,
} from "lucide-react";
import type { Message, Chat, Folder as FolderType, ChatStore } from "./types";
import DocumentUpload from "./DocumentUpload";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

const Chat = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [store, setStore] = useState<ChatStore>(() => {
    // Try to load from localStorage during initialization
    try {
      const savedStore = localStorage.getItem("chatStore");
      if (savedStore) {
        return JSON.parse(savedStore);
      }
    } catch (error) {
      console.error("Error loading initial state:", error);
    }
    // Return empty state if nothing was found in localStorage
    return {
      chats: [],
      folders: [],
      currentChatId: null,
      currentFolderId: null,
    };
  });
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [draggedChatId, setDraggedChatId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const savedDarkMode = localStorage.getItem("darkMode") === "true";
    setIsDarkMode(savedDarkMode);

    const savedStore = localStorage.getItem("chatStore");
    console.log("Loading from localStorage:", savedStore); // Debug log
    if (savedStore) {
      const parsed = JSON.parse(savedStore);
      console.log("Parsed store:", parsed); // Debug log
      setStore(parsed);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("darkMode", isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  useEffect(() => {
    console.log("Saving to localStorage:", store); // Debug log
    localStorage.setItem("chatStore", JSON.stringify(store));
  }, [store]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [store.chats, store.currentChatId]);

  const createNewFolder = () => {
    if (!newFolderName.trim()) return;

    const newFolder: FolderType = {
      id: Date.now().toString(),
      name: newFolderName,
      timestamp: new Date(),
      isExpanded: true,
    };

    setStore((prev) => ({
      ...prev,
      folders: [...prev.folders, newFolder],
    }));
    setNewFolderName("");
  };

  const createNewChat = (folderId: string | null = null) => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: `New Chat`,
      messages: [], // Make sure this is initialized as an empty array
      timestamp: new Date(),
      folderId,
    };

    setStore((prev) => ({
      ...prev,
      chats: [newChat, ...prev.chats],
      currentChatId: newChat.id,
    }));
  };
  const getCurrentChat = (): Chat | undefined => {
    if (!store.currentChatId) return undefined;
    return store.chats.find((chat) => chat.id === store.currentChatId);
  };

  const updateChatTitle = (chatId: string, firstMessage: string) => {
    setStore((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) => {
        if (chat.id === chatId) {
          return {
            ...chat,
            title:
              firstMessage.slice(0, 30) +
              (firstMessage.length > 30 ? "..." : ""),
          };
        }
        return chat;
      }),
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const currentChat = getCurrentChat();
    if (!input.trim() || !currentChat) return;

    setIsLoading(true);
    const isFirstMessage = currentChat.messages.length === 0;

    try {
      const folderId = currentChat.folderId || "default";

      const response = await fetch(`http://localhost:8000/chat/${folderId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input,
          session_id: store.currentChatId,
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");

      const data = await response.json();

      // Update the messages with the response
      setStore((prev) => ({
        ...prev,
        chats: prev.chats.map((chat) => {
          if (chat.id === store.currentChatId) {
            return {
              ...chat,
              messages: [
                ...chat.messages,
                { role: "user", content: input },
                { role: "assistant", content: data.response },
              ],
            };
          }
          return chat;
        }),
      }));

      if (isFirstMessage) {
        updateChatTitle(store.currentChatId!, input);
      }
    } catch (error) {
      console.error("Error:", error);
      setStore((prev) => ({
        ...prev,
        chats: prev.chats.map((chat) => {
          if (chat.id === store.currentChatId) {
            return {
              ...chat,
              messages: [
                ...chat.messages,
                { role: "user", content: input },
                {
                  role: "assistant",
                  content: "Sorry, there was an error processing your request.",
                },
              ],
            };
          }
          return chat;
        }),
      }));
    }

    setIsLoading(false);
    setInput("");
  };

  const deleteChat = async (chatId: string) => {
    try {
      await fetch(`http://localhost:8000/chats/${chatId}`, {
        method: "DELETE",
      });
      setStore((prev) => ({
        ...prev,
        chats: prev.chats.filter((chat) => chat.id !== chatId),
        currentChatId:
          chatId === prev.currentChatId
            ? prev.chats[0]?.id || null
            : prev.currentChatId,
      }));
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      await fetch(`http://localhost:8000/folders/${folderId}`, {
        method: "DELETE",
      });
      setStore((prev) => ({
        ...prev,
        folders: prev.folders.filter((f) => f.id !== folderId),
        chats: prev.chats.map((chat) =>
          chat.folderId === folderId ? { ...chat, folderId: null } : chat
        ),
      }));
    } catch (error) {
      console.error("Error deleting folder:", error);
    }
  };

  const toggleFolder = (folderId: string) => {
    setStore((prev) => ({
      ...prev,
      folders: prev.folders.map((f) =>
        f.id === folderId ? { ...f, isExpanded: !f.isExpanded } : f
      ),
    }));
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, chatId: string) => {
    e.stopPropagation();
    setDraggedChatId(chatId);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    e.currentTarget.classList.add(
      "border-2",
      "border-blue-500",
      "border-dashed"
    );
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove(
      "border-2",
      "border-blue-500",
      "border-dashed"
    );
  };

  const handleDrop = (
    e: DragEvent<HTMLDivElement>,
    targetFolderId: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove(
      "border-2",
      "border-blue-500",
      "border-dashed"
    );

    if (!draggedChatId) return;

    setStore((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) =>
        chat.id === draggedChatId ? { ...chat, folderId: targetFolderId } : chat
      ),
    }));

    setDraggedChatId(null);
  };

  return (
    <div className={`flex h-screen ${isDarkMode ? "dark" : ""}`}>
      {/* Sidebar */}
      <div className="w-64 bg-gray-100 dark:bg-gray-800 p-4 flex flex-col">
        <button
          onClick={() => createNewChat(null)}
          className="flex items-center justify-center gap-2 w-full p-2 mb-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          <Plus size={20} />
          New Chat
        </button>

        <div className="mb-4">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createNewFolder()}
            placeholder="New folder name..."
            className="w-full p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-2"
          />
          <button
            onClick={createNewFolder}
            className="flex items-center justify-center gap-2 w-full p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            <Folder size={20} />
            Create Folder
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Unorganized chats */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, null)}
            className="space-y-1 min-h-[20px] p-1">
            {store.chats
              .filter((chat) => !chat.folderId)
              .map((chat) => (
                <div
                  key={chat.id}
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 ${
                    chat.id === store.currentChatId
                      ? "bg-gray-200 dark:bg-gray-700"
                      : ""
                  }`}
                  onClick={() =>
                    setStore((prev) => ({ ...prev, currentChatId: chat.id }))
                  }
                  draggable
                  onDragStart={(e) => handleDragStart(e, chat.id)}>
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare size={16} />
                    <span className="truncate">{chat.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="p-1 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </div>

          {/* Folders and their chats */}
          {store.folders.map((folder) => (
            <div key={folder.id} className="mb-2">
              <div
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 ${
                  store.currentFolderId === folder.id
                    ? "bg-gray-200 dark:bg-gray-700"
                    : ""
                }`}>
                {/* Folder header with new chat button */}
                <div className="flex items-center justify-between w-full">
                  <div
                    className="flex items-center gap-2 flex-1"
                    onClick={() => toggleFolder(folder.id)}>
                    {folder.isExpanded ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                    {editingFolderId === folder.id ? (
                      <input
                        type="text"
                        className="bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 px-1 w-full"
                        value={folder.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          setStore((prev) => ({
                            ...prev,
                            folders: prev.folders.map((f) =>
                              f.id === folder.id
                                ? { ...f, name: e.target.value }
                                : f
                            ),
                          }));
                        }}
                        onBlur={() => setEditingFolderId(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            setEditingFolderId(null);
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="flex-1">{folder.name}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {/* New Chat button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        createNewChat(folder.id);
                      }}
                      className="p-1 hover:text-blue-500"
                      title="New chat in folder">
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolderId(folder.id);
                      }}
                      className="p-1 hover:text-blue-500">
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFolder(folder.id);
                      }}
                      className="p-1 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {folder.isExpanded && (
                <>
                  <DocumentUpload folderId={folder.id} />
                  <div
                    className="ml-6 space-y-1 min-h-[20px] p-1"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, folder.id)}>
                    {store.chats
                      .filter((chat) => chat.folderId === folder.id)
                      .map((chat) => (
                        <div
                          key={chat.id}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 ${
                            chat.id === store.currentChatId
                              ? "bg-gray-200 dark:bg-gray-700"
                              : ""
                          }`}
                          onClick={() =>
                            setStore((prev) => ({
                              ...prev,
                              currentChatId: chat.id,
                            }))
                          }
                          draggable
                          onDragStart={(e) => handleDragStart(e, chat.id)}>
                          <div className="flex items-center gap-2 truncate">
                            <MessageSquare size={16} />
                            <span className="truncate">{chat.title}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChat(chat.id);
                            }}
                            className="p-1 hover:text-red-500">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h1 className="text-2xl font-bold dark:text-white">
            {getCurrentChat()?.title || "DeepSeek Chat"}
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {isLoading ? "Generating..." : "Ready"}
            </div>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-800">
          {getCurrentChat()?.messages?.map((message, index) => (
            <div
              key={index}
              className={`mb-4 p-3 rounded-lg ${
                message.role === "user"
                  ? "bg-blue-100 dark:bg-blue-900 ml-auto max-w-[80%]"
                  : "bg-white dark:bg-gray-700 max-w-[80%]"
              }`}>
              <div className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                {message.role === "user" ? "You" : "DeepSeek"}
              </div>
              <ReactMarkdown
                // Allows whitespace to wrap as normal
                className="prose dark:prose-invert break-words"
                // Add remark/rehype plugins for math rendering
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-4 border-t dark:border-gray-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              disabled={isLoading || !store.currentChatId}
            />
            <button
              type="submit"
              disabled={isLoading || !store.currentChatId}
              className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed dark:disabled:bg-blue-800">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Chat;
