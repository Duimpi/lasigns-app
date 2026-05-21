import { create } from 'zustand'
import type { Chat, ChatMessage } from '@/types'

interface MessagingState {
  isOpen: boolean
  isMinimized: boolean
  activeChat: Chat | null
  chats: Chat[]
  unreadTotal: number
  setIsOpen: (v: boolean) => void
  setIsMinimized: (v: boolean) => void
  setActiveChat: (chat: Chat | null) => void
  setChats: (chats: Chat[]) => void
  setUnreadTotal: (n: number) => void
  openChat: (chat: Chat) => void
}

export const useMessagingStore = create<MessagingState>((set) => ({
  isOpen: false,
  isMinimized: false,
  activeChat: null,
  chats: [],
  unreadTotal: 0,
  setIsOpen: (isOpen) => set({ isOpen }),
  setIsMinimized: (isMinimized) => set({ isMinimized }),
  setActiveChat: (activeChat) => set({ activeChat }),
  setChats: (chats) => set({ chats }),
  setUnreadTotal: (unreadTotal) => set({ unreadTotal }),
  openChat: (chat) => set({ activeChat: chat, isOpen: true, isMinimized: false }),
}))
