'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { useMessagingStore } from '@/stores/messagingStore'
import { useAuthStore } from '@/stores/authStore'
import { formatTimeAgo } from '@/lib/utils'
import EmojiPicker from 'emoji-picker-react'
import { MessageSquare, X, Minus, Send, Smile, Users, ArrowLeft, Trash2, Search } from 'lucide-react'
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
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [chatSearch, setChatSearch] = useState('')
  const [view, setView] = useState<'chats' | 'team'>('chats')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    if (activeChat) { loadMessages(activeChat.id); markAsRead(activeChat.id) }
  }, [activeChat])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadChats() {
    if (!profile) return
    const { data } = await supabase
      .from('chats')
      .select(`*, members:chat_members(*, profile:profiles(*)), last_message:chat_messages(id, content, created_at)`)
      .order('updated_at', { ascending: false })

    const myChats = ((data as Chat[]) || []).filter(chat =>
      chat.members?.some((m: any) => m.profile_id === profile.id)
    )

    let totalUnread = 0
    const chatsWithUnread = await Promise.all(myChats.map(async (chat) => {
      const myMembership = chat.members?.find((m: any) => m.profile_id === profile.id) as any
      const { count } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true })
        .eq('chat_id', chat.id).neq('sender_id', profile.id)
        .gt('created_at', myMembership?.last_read_at || '1970-01-01')
      const unread = count || 0
      totalUnread += unread
      return { ...chat, unread_count: unread }
    }))

    setChats(chatsWithUnread)
    setUnreadTotal(totalUnread)
  }

  async function loadMessages(chatId: string) {
    const { data } = await supabase.from('chat_messages')
      .select(`*, sender:profiles!sender_id(id, full_name)`)
      .eq('chat_id', chatId).eq('is_deleted', false)
      .order('created_at', { ascending: true }).limit(100)
    setMessages((data as any) || [])
  }

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setAllProfiles((data as Profile[]) || [])
  }

  async function markAsRead(chatId: string) {
    if (!profile) return
    await supabase.from('chat_members').update({ last_read_at: new Date().toISOString() })
      .eq('chat_id', chatId).eq('profile_id', profile.id)
    loadChats()
  }

  async function sendMessage() {
    if (!newMessage.trim() || !activeChat || !profile) return
    setIsSending(true)
    try {
      await supabase.from('chat_messages').insert({
        chat_id: activeChat.id, sender_id: profile.id,
        content: newMessage.trim(), message_type: 'text',
      })
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', activeChat.id)
      setNewMessage('')
    } catch { toast.error('Failed to send') }
    finally { setIsSending(false) }
  }

  async function openDirectChat(targetProfile: Profile) {
    if (!profile) return
    const existing = chats.find(chat =>
      chat.type === 'direct' &&
      chat.members?.some((m: any) => m.profile_id === profile.id) &&
      chat.members?.some((m: any) => m.profile_id === targetProfile.id)
    )
    if (existing) { openChat(existing); setView('chats'); return }
    try {
      const { data: chat, error } = await supabase.from('chats')
        .insert({ type: 'direct', created_by: profile.id })
        .select().single()
      if (error) throw error
      await supabase.from('chat_members').insert([
        { chat_id: chat.id, profile_id: profile.id },
        { chat_id: chat.id, profile_id: targetProfile.id },
      ])
      await loadChats()
      openChat(chat as Chat)
      setView('chats')
      toast.success(`Chat opened with ${targetProfile.full_name}`)
    } catch { toast.error('Failed to start chat') }
  }

  async function deleteChat(chatId: string) {
    await supabase.from('chats').delete().eq('id', chatId)
    if (activeChat?.id === chatId) setActiveChat(null)
    loadChats()
    toast.success('Chat deleted')
  }

  function getChatDisplayName(chat: Chat): string {
    if (chat.name) return chat.name
    if (chat.type === 'direct' && profile) {
      const other = chat.members?.find((m: any) => m.profile_id !== profile.id) as any
      return other?.profile?.full_name || 'Direct Message'
    }
    return 'Group Chat'
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current
    if (input) {
      const start = input.selectionStart || newMessage.length
      const end = input.selectionEnd || newMessage.length
      const newVal = newMessage.substring(0, start) + emoji + newMessage.substring(end)
      setNewMessage(newVal)
      setTimeout(() => {
        input.focus()
        input.setSelectionRange(start + emoji.length, start + emoji.length)
      }, 10)
    } else {
      setNewMessage(prev => prev + emoji)
    }
    setShowEmojiPicker(false)
  }

  const filteredChats = chats.filter(c =>
    chatSearch ? getChatDisplayName(c).toLowerCase().includes(chatSearch.toLowerCase()) : true
  )
  const teamMembers = allProfiles.filter(p => p.id !== profile?.id)

  if (!profile) return null

  return (
    // IMPORTANT: Same right:16px as Staff Panel, stacks directly above it
    <div className="relative" style={{ width: '320px' }}>
      <AnimatePresence>
        {isOpen && !isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="bg-bg-surface border border-border rounded-xl shadow-modal overflow-hidden absolute bottom-full mb-1 right-0"
            style={{ height: '460px', display: 'flex', flexDirection: 'column' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-bg-elevated/50 shrink-0">
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
                <button onClick={() => setIsMinimized(true)} className="btn-icon w-6 h-6"><Minus className="w-3.5 h-3.5" /></button>
                <button onClick={() => setIsOpen(false)} className="btn-icon w-6 h-6"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            {/* Tabs */}
            {!activeChat && (
              <div className="flex border-b border-border shrink-0">
                <button onClick={() => setView('chats')}
                  className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${view === 'chats' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
                  Chats
                </button>
                <button onClick={() => setView('team')}
                  className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${view === 'team' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
                  Team ({teamMembers.length})
                </button>
              </div>
            )}

            {/* Chats list */}
            {!activeChat && view === 'chats' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-2 py-1.5 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
                    <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)}
                      className="input py-1.5 pl-6 text-xs" placeholder="Search chats..." />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredChats.length === 0 ? (
                    <div className="py-8 text-center">
                      <MessageSquare className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-30" />
                      <p className="text-xs text-text-muted mb-2">No chats yet</p>
                      <button onClick={() => setView('team')} className="text-xs text-accent hover:underline">
                        Click Team to message someone →
                      </button>
                    </div>
                  ) : filteredChats.map(chat => (
                    <div key={chat.id} onClick={() => openChat(chat)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover cursor-pointer border-b border-border/30 group">
                      <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                        {chat.type === 'group'
                          ? <Users className="w-4 h-4 text-accent" />
                          : <span className="text-xs font-bold text-accent">{getChatDisplayName(chat)[0]?.toUpperCase()}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-text-primary truncate">{getChatDisplayName(chat)}</p>
                          {(chat.unread_count || 0) > 0 && <span className="unread-dot shrink-0">{chat.unread_count}</span>}
                        </div>
                        {(chat as any).last_message && (
                          <p className="text-[10px] text-text-muted truncate">{(chat as any).last_message?.content}</p>
                        )}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
                        className="btn-icon w-5 h-5 opacity-0 group-hover:opacity-100 text-red-400/50 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team list */}
            {!activeChat && view === 'team' && (
              <div className="flex-1 overflow-y-auto">
                <div className="px-3 py-2 border-b border-border/40">
                  <p className="text-[10px] text-text-muted">Tap a name to open a direct message</p>
                </div>
                {teamMembers.map(member => (
                  <div key={member.id} onClick={() => openDirectChat(member)}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-bg-hover cursor-pointer border-b border-border/30 transition-colors">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      member.role === 'admin' ? 'bg-accent/20 text-accent' : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {member.full_name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-text-primary">{member.full_name}</p>
                      <p className="text-[10px] text-text-muted capitalize">{member.role}</p>
                    </div>
                    <MessageSquare className="w-3.5 h-3.5 text-text-muted" />
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            {activeChat && (
              <>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {messages.length === 0 && (
                    <p className="text-center text-xs text-text-muted py-6">No messages yet</p>
                  )}
                  {messages.map(msg => {
                    const isOwn = msg.sender_id === profile.id
                    return (
                      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[78%] flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                          {!isOwn && (
                            <span className="text-[10px] text-accent font-semibold px-1">
                              {(msg.sender as any)?.full_name || 'Unknown'}
                            </span>
                          )}
                          <div className={`px-3 py-2 rounded-xl text-sm ${
                            isOwn ? 'bg-accent text-text-inverse rounded-br-sm' : 'bg-bg-elevated border border-border text-text-primary rounded-bl-sm'
                          }`}>{msg.content}</div>
                          <span className="text-[10px] text-text-muted px-1">{formatTimeAgo(msg.created_at)}</span>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-3 py-2.5 border-t border-border shrink-0 relative">
                  {showEmojiPicker && (
                    <div className="absolute bottom-full right-0 mb-1 z-[100] shadow-modal rounded-xl overflow-hidden">
                      <EmojiPicker
                        onEmojiClick={(data) => insertEmoji(data.emoji)}
                        theme={'dark' as any}
                        height={320} width={300}
                        searchDisabled={false}
                        skinTonesDisabled={true}
                        previewConfig={{ showPreview: false }}
                      />
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`btn-icon w-8 h-8 shrink-0 ${showEmojiPicker ? 'text-accent' : ''}`}>
                      <Smile className="w-4 h-4" />
                    </button>
                    <input ref={inputRef} value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                        if (e.key === 'Escape') setShowEmojiPicker(false)
                      }}
                      className="input flex-1 py-2 text-sm" placeholder="Type a message..." />
                    <button onClick={sendMessage} disabled={isSending || !newMessage.trim()}
                      className="btn-primary w-8 h-8 p-0 shrink-0">
                      {isSending ? <span className="spinner w-3 h-3" /> : <Send className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button - same width as Staff Panel */}
      <button
        onClick={() => {
          if (isMinimized) { setIsMinimized(false); setIsOpen(true) }
          else if (isOpen) { setIsOpen(false) }
          else { setIsOpen(true) }
        }}
        className="flex items-center gap-2 px-3 py-2.5 bg-bg-elevated border border-border rounded-lg hover:border-border-strong transition-colors shadow-elevated w-full"
      >
        <MessageSquare className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold text-text-primary">Messages</span>
        {unreadTotal > 0 && <span className="unread-dot">{unreadTotal}</span>}
      </button>
    </div>
  )
}
