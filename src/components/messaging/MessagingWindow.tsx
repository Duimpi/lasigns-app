'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { useMessagingStore } from '@/stores/messagingStore'
import { useAuthStore } from '@/stores/authStore'
import { formatTimeAgo } from '@/lib/utils'
import EmojiPicker from 'emoji-picker-react'
import {
  MessageSquare, X, Minus, Plus, Send, Smile, Users,
  ArrowLeft, Hash, ChevronDown, Trash2, Search
} from 'lucide-react'
import type { Chat, ChatMessage, Profile } from '@/types'
import toast from 'react-hot-toast'

export function MessagingWindow() {
  const { isOpen, isMinimized, activeChat, chats, unreadTotal,
    setIsOpen, setIsMinimized, setActiveChat, setChats, setUnreadTotal, openChat } = useMessagingStore()
  const { profile } = useAuthStore()

  const [messages, setMessages] = useState<(ChatMessage & { sender?: Profile })[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [chatName, setChatName] = useState('')
  const [chatType, setChatType] = useState<'direct' | 'group'>('direct')
  const [chatSearch, setChatSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profile) return
    loadChats()
    loadProfiles()

    const channel = supabase
      .channel('messaging-chats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        loadChats()
        if (activeChat) loadMessages(activeChat.id)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat.id)
      markAsRead(activeChat.id)
    }
  }, [activeChat])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadChats() {
    if (!profile) return
    const { data } = await supabase
      .from('chats')
      .select(`
        *,
        members:chat_members(*, profile:profiles(*)),
        last_message:chat_messages(id, content, created_at, sender:profiles!sender_id(full_name))
      `)
      .order('updated_at', { ascending: false })

    // Filter to chats where current user is a member
    const myChats = ((data as Chat[]) || []).filter(chat =>
      chat.members?.some((m: { profile_id: string }) => m.profile_id === profile.id)
    )

    // Calculate unread
    let totalUnread = 0
    const chatsWithUnread = await Promise.all(myChats.map(async (chat) => {
      const myMembership = chat.members?.find((m: { profile_id: string }) => m.profile_id === profile.id) as { last_read_at?: string } | undefined
      if (!myMembership?.last_read_at) {
        const { count } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .neq('sender_id', profile.id)
        const unread = count || 0
        totalUnread += unread
        return { ...chat, unread_count: unread }
      }
      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chat.id)
        .neq('sender_id', profile.id)
        .gt('created_at', myMembership.last_read_at)
      const unread = count || 0
      totalUnread += unread
      return { ...chat, unread_count: unread }
    }))

    setChats(chatsWithUnread)
    setUnreadTotal(totalUnread)
  }

  async function loadMessages(chatId: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select(`*, sender:profiles!sender_id(*)`)
      .eq('chat_id', chatId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(100)
    setMessages((data as (ChatMessage & { sender?: Profile })[]) || [])
  }

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setAllProfiles((data as Profile[]) || [])
  }

  async function markAsRead(chatId: string) {
    if (!profile) return
    await supabase
      .from('chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .eq('profile_id', profile.id)
    loadChats()
  }

  async function sendMessage() {
    if (!newMessage.trim() || !activeChat || !profile) return
    setIsSending(true)
    try {
      await supabase.from('chat_messages').insert({
        chat_id: activeChat.id,
        sender_id: profile.id,
        content: newMessage.trim(),
        message_type: 'text',
      })
      // Update chat updated_at
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', activeChat.id)
      setNewMessage('')
    } catch { toast.error('Failed to send') }
    finally { setIsSending(false) }
  }

  async function createChat() {
    if (!profile) return
    if (selectedMembers.length === 0) { toast.error('Select at least one member'); return }
    try {
      const members = [profile.id, ...selectedMembers.filter(m => m !== profile.id)]
      const name = chatType === 'group' ? chatName : null

      const { data: chat, error } = await supabase
        .from('chats')
        .insert({ name, type: chatType, created_by: profile.id })
        .select()
        .single()
      if (error) throw error

      await supabase.from('chat_members').insert(
        members.map(id => ({ chat_id: chat.id, profile_id: id }))
      )

      setIsCreatingChat(false)
      setSelectedMembers([])
      setChatName('')
      loadChats()
      openChat(chat as Chat)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create chat')
    }
  }

  async function deleteChat(chatId: string) {
    if (!profile) return
    await supabase.from('chats').delete().eq('id', chatId)
    if (activeChat?.id === chatId) setActiveChat(null)
    loadChats()
    toast.success('Chat deleted')
  }

  function getChatDisplayName(chat: Chat): string {
    if (chat.name) return chat.name
    if (chat.type === 'direct' && profile) {
      const other = chat.members?.find((m: { profile_id: string; profile?: { full_name: string } }) => m.profile_id !== profile.id)
      return (other as { profile?: { full_name: string } })?.profile?.full_name || 'Direct Message'
    }
    return 'Group Chat'
  }

  function handleEmojiClick(emojiData: { emoji: string }) {
    setNewMessage(prev => prev + emojiData.emoji)
    setShowEmojiPicker(false)
  }

  const filteredChats = chats.filter(c =>
    chatSearch ? getChatDisplayName(c).toLowerCase().includes(chatSearch.toLowerCase()) : true
  )

  if (!profile) return null

  return (
    // Position: bottom-right, above staff panel
    <div
      className="fixed z-40"
      style={{ bottom: '72px', right: '332px' }}
    >
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="bg-bg-surface border border-border rounded-xl shadow-modal overflow-hidden"
            style={{ width: '340px', height: '480px', display: 'flex', flexDirection: 'column' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-bg-elevated/50">
              {activeChat ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => setActiveChat(null)} className="btn-icon w-6 h-6">
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{getChatDisplayName(activeChat)}</p>
                    <p className="text-[10px] text-text-muted capitalize">{activeChat.type} chat</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-accent" />
                  <p className="text-sm font-semibold text-text-primary">Messages</p>
                  {unreadTotal > 0 && <span className="unread-dot">{unreadTotal}</span>}
                </div>
              )}
              <div className="flex items-center gap-1">
                {!activeChat && (
                  <button onClick={() => setIsCreatingChat(true)} className="btn-icon w-6 h-6" title="New chat">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setIsMinimized(true)} className="btn-icon w-6 h-6">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setIsOpen(false)} className="btn-icon w-6 h-6">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Create chat form */}
            {isCreatingChat && !activeChat && (
              <div className="p-3 border-b border-border bg-bg-elevated/30 space-y-2">
                <div className="flex gap-2">
                  {(['direct', 'group'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setChatType(t)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
                        chatType === t ? 'bg-accent text-text-inverse' : 'bg-bg-elevated text-text-secondary border border-border'
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
                {chatType === 'group' && (
                  <input
                    value={chatName}
                    onChange={(e) => setChatName(e.target.value)}
                    className="input text-xs py-1.5"
                    placeholder="Group name..."
                  />
                )}
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {allProfiles.filter(p => p.id !== profile.id).map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-bg-hover rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedMembers(prev => [...prev, p.id])
                          else setSelectedMembers(prev => prev.filter(id => id !== p.id))
                        }}
                        className="accent-accent"
                      />
                      <span className="text-xs text-text-primary">{p.full_name}</span>
                      <span className="text-[10px] text-text-muted capitalize ml-auto">{p.role}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setIsCreatingChat(false)} className="btn-secondary flex-1 text-xs py-1.5">Cancel</button>
                  <button onClick={createChat} className="btn-primary flex-1 text-xs py-1.5">Create</button>
                </div>
              </div>
            )}

            {/* Chat list */}
            {!activeChat && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-2 py-1.5 border-b border-border/50">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
                    <input
                      value={chatSearch}
                      onChange={(e) => setChatSearch(e.target.value)}
                      className="input py-1.5 pl-6 text-xs"
                      placeholder="Search chats..."
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredChats.length === 0 ? (
                    <div className="py-8 text-center text-xs text-text-muted">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No chats yet. Start one!
                    </div>
                  ) : (
                    filteredChats.map(chat => (
                      <div
                        key={chat.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover cursor-pointer border-b border-border/30 group"
                        onClick={() => openChat(chat)}
                      >
                        <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                          {chat.type === 'group' ? (
                            <Users className="w-4 h-4 text-accent" />
                          ) : (
                            <span className="text-xs font-bold text-accent">
                              {getChatDisplayName(chat)[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-text-primary truncate">{getChatDisplayName(chat)}</p>
                            {(chat.unread_count || 0) > 0 && (
                              <span className="unread-dot shrink-0">{chat.unread_count}</span>
                            )}
                          </div>
                          {chat.last_message && (
                            <p className="text-[10px] text-text-muted truncate">
                              {(chat.last_message as { content: string }).content}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
                          className="btn-icon w-5 h-5 opacity-0 group-hover:opacity-100 text-red-400/50 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Message view */}
            {activeChat && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {messages.map(msg => {
                    const isOwn = msg.sender_id === profile.id
                    return (
                      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                          {!isOwn && (
                            <span className="text-[10px] text-accent font-semibold px-1">
                              {msg.sender?.full_name || 'Unknown'}
                            </span>
                          )}
                          <div className={`px-3 py-2 rounded-xl text-sm ${
                            isOwn
                              ? 'bg-accent text-text-inverse rounded-br-sm'
                              : 'bg-bg-elevated border border-border text-text-primary rounded-bl-sm'
                          }`}>
                            {msg.content}
                          </div>
                          <span className="text-[10px] text-text-muted px-1">
                            {formatTimeAgo(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-3 py-2.5 border-t border-border bg-bg-elevated/30">
                  <div className="relative">
                    {showEmojiPicker && (
                      <div className="absolute bottom-full right-0 mb-2 z-50">
                        <EmojiPicker
                          onEmojiClick={handleEmojiClick}
                          theme={'dark' as any}
                          height={300}
                          width={280}
                        />
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className="btn-icon w-7 h-7 shrink-0"
                      >
                        <Smile className="w-4 h-4" />
                      </button>
                      <input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendMessage()
                          }
                        }}
                        className="input flex-1 py-2 text-sm"
                        placeholder="Type a message..."
                      />
                      <button
                        onClick={sendMessage}
                        disabled={isSending || !newMessage.trim()}
                        className="btn-primary w-8 h-8 p-0 shrink-0"
                      >
                        {isSending ? <span className="spinner w-3 h-3" /> : <Send className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized / Toggle button */}
      <button
        onClick={() => {
          if (isMinimized) { setIsMinimized(false); setIsOpen(true) }
          else if (isOpen) { setIsOpen(false) }
          else { setIsOpen(true) }
        }}
        className="flex items-center gap-2 px-3 py-2.5 bg-bg-elevated border border-border rounded-lg hover:border-border-strong transition-colors shadow-elevated"
      >
        <MessageSquare className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold text-text-primary">Messages</span>
        {unreadTotal > 0 && <span className="unread-dot">{unreadTotal}</span>}
        {isOpen && !isMinimized ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <MessageSquare className="w-4 h-4 text-text-muted" />
        )}
      </button>
    </div>
  )
}
