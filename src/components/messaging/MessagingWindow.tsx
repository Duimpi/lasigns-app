'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { useMessagingStore } from '@/stores/messagingStore'
import { useAuthStore } from '@/stores/authStore'
import { formatTimeAgo } from '@/lib/utils'
import EmojiPicker from 'emoji-picker-react'
import { MessageSquare, X, Send, Smile, Users, Minus, Trash2 } from 'lucide-react'
import type { Chat, Profile } from '@/types'
import toast from 'react-hot-toast'

// ── Single open chat bubble ──────────────────────────────────────────
function ChatBubble({ chat, onClose }: { chat: any; onClose: () => void }) {
  const { profile } = useAuthStore()
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function getChatName() {
    if (chat.name) return chat.name
    if (chat.type === 'direct' && profile) {
      const other = chat.members?.find((m: any) => m.profile_id !== profile.id)
      return other?.profile?.full_name || 'Chat'
    }
    return 'Group'
  }

  useEffect(() => {
    loadMessages()
    markRead()
    const channel = supabase
      .channel(`chat-${chat.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `chat_id=eq.${chat.id}`
      }, () => loadMessages())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chat.id])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadMessages() {
    const { data } = await supabase.from('chat_messages')
      .select('*, sender:profiles!sender_id(id, full_name)')
      .eq('chat_id', chat.id).eq('is_deleted', false)
      .order('created_at', { ascending: true }).limit(80)
    setMessages(data || [])
  }

  async function markRead() {
    if (!profile) return
    await supabase.from('chat_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('chat_id', chat.id).eq('profile_id', profile.id)
  }

  async function sendMessage() {
    if (!newMessage.trim() || !profile) return
    setIsSending(true)
    try {
      const { error } = await supabase.from('chat_messages').insert({
        chat_id: chat.id,
        sender_id: profile.id,
        content: newMessage.trim(),
        message_type: 'text',
      })
      if (error) throw error
      await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chat.id)
      setNewMessage('')
    } catch (err: any) {
      toast.error(`Send failed: ${err?.message}`)
    } finally { setIsSending(false) }
  }

  function insertEmoji(emoji: string) {
    const input = inputRef.current
    if (input) {
      const start = input.selectionStart || newMessage.length
      const newVal = newMessage.substring(0, start) + emoji + newMessage.substring(start)
      setNewMessage(newVal)
      setTimeout(() => { input.focus(); input.setSelectionRange(start + emoji.length, start + emoji.length) }, 10)
    } else {
      setNewMessage(p => p + emoji)
    }
    setShowEmoji(false)
  }

  const name = getChatName()

  return (
    <div className="relative flex flex-col" style={{ width: '240px' }}>
      {/* Chat window - opens upward */}
      <AnimatePresence>
        {!minimized && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full mb-1 right-0 bg-bg-surface border border-border rounded-xl shadow-modal overflow-hidden"
            style={{ width: '240px', height: '360px', display: 'flex', flexDirection: 'column' }}
          >
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {messages.length === 0 && (
                <p className="text-center text-[11px] text-text-muted py-4">Start the conversation</p>
              )}
              {messages.map(msg => {
                const isOwn = msg.sender_id === profile?.id
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                      {!isOwn && (
                        <span className="text-[10px] text-accent font-semibold px-1">
                          {msg.sender?.full_name}
                        </span>
                      )}
                      <div className={`px-2.5 py-1.5 rounded-xl text-xs leading-snug ${
                        isOwn
                          ? 'bg-accent text-text-inverse rounded-br-sm'
                          : 'bg-bg-elevated border border-border text-text-primary rounded-bl-sm'
                      }`}>{msg.content}</div>
                      <span className="text-[9px] text-text-muted px-1">{formatTimeAgo(msg.created_at)}</span>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-2 py-2 border-t border-border shrink-0 relative">
              {showEmoji && (
                <div className="absolute bottom-full right-0 mb-1 z-[100] shadow-modal rounded-xl overflow-hidden" style={{ maxHeight: '300px', overflow: 'hidden' }}>
                  <EmojiPicker
                    onEmojiClick={(d) => insertEmoji(d.emoji)}
                    theme={'dark' as any} height={280} width={250}
                    searchDisabled={true} skinTonesDisabled={true}
                    previewConfig={{ showPreview: false }}
                    lazyLoadEmojis={true}
                  />
                </div>
              )}
              <div className="flex gap-1 items-center">
                <button onClick={() => setShowEmoji(!showEmoji)}
                  className={`btn-icon w-6 h-6 shrink-0 ${showEmoji ? 'text-accent' : ''}`}>
                  <Smile className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                    if (e.key === 'Escape') setShowEmoji(false)
                  }}
                  className="input flex-1 py-1 text-xs"
                  placeholder="Message..."
                />
                <button onClick={sendMessage} disabled={isSending || !newMessage.trim()}
                  className="btn-primary w-6 h-6 p-0 shrink-0">
                  {isSending ? <span className="spinner w-2.5 h-2.5" /> : <Send className="w-2.5 h-2.5" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat toggle button */}
      <button
        onClick={() => setMinimized(!minimized)}
        className="flex items-center gap-1.5 px-2.5 py-2 bg-bg-elevated border border-border rounded-lg hover:border-border-strong transition-colors shadow-elevated w-full"
      >
        <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-accent">{name[0]}</span>
        </div>
        <span className="text-xs font-semibold text-text-primary truncate flex-1 text-left">{name}</span>
        <button onClick={(e) => { e.stopPropagation(); onClose() }}
          className="text-text-muted hover:text-red-400 shrink-0 ml-1">
          <X className="w-3 h-3" />
        </button>
      </button>
    </div>
  )
}

// ── Main Messages Button + Team/Chats Selector ───────────────────────
export function MessagingWindow() {
  const { chats, unreadTotal, setChats, setUnreadTotal, openChat } = useMessagingStore()
  const { profile } = useAuthStore()

  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [openChats, setOpenChats] = useState<any[]>([])
  const [showPanel, setShowPanel] = useState(false)
  const [view, setView] = useState<'chats' | 'team'>('team')

  useEffect(() => {
    if (!profile) return
    loadChats()
    loadProfiles()
    const channel = supabase
      .channel('msg-main')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, loadChats)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  async function loadChats() {
    if (!profile) return
    const { data } = await supabase
      .from('chats')
      .select('*, members:chat_members(*, profile:profiles(*))')
      .order('updated_at', { ascending: false })

    const myChats = ((data as any[]) || []).filter(c =>
      c.members?.some((m: any) => m.profile_id === profile.id)
    )

    let total = 0
    const withUnread = await Promise.all(myChats.map(async (chat) => {
      const mine = chat.members?.find((m: any) => m.profile_id === profile.id)
      const { count } = await supabase.from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chat.id).neq('sender_id', profile.id)
        .gt('created_at', mine?.last_read_at || '1970-01-01')
      total += count || 0
      return { ...chat, unread_count: count || 0 }
    }))

    setChats(withUnread as any)
    setUnreadTotal(total)
  }

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setAllProfiles((data as Profile[]) || [])
  }

  async function startDirectChat(target: Profile) {
    if (!profile) return
    // Check if chat already exists
    const existing = (chats as any[]).find(c =>
      c.type === 'direct' &&
      c.members?.some((m: any) => m.profile_id === profile.id) &&
      c.members?.some((m: any) => m.profile_id === target.id)
    )
    if (existing) {
      openChatBubble(existing)
      setShowPanel(false)
      return
    }
    try {
      const { data: chat, error } = await supabase.from('chats')
        .insert({ type: 'direct', created_by: profile.id })
        .select().single()
      if (error) throw error
      await supabase.from('chat_members').insert([
        { chat_id: chat.id, profile_id: profile.id },
        { chat_id: chat.id, profile_id: target.id },
      ])
      // Reload and open
      await loadChats()
      const full = { ...chat, members: [
        { profile_id: profile.id, profile: { full_name: profile.full_name } },
        { profile_id: target.id, profile: { full_name: target.full_name } },
      ]}
      openChatBubble(full)
      setShowPanel(false)
      toast.success(`Chat opened with ${target.full_name}`)
    } catch (err: any) {
      toast.error(`Failed: ${err?.message}`)
    }
  }

  function openChatBubble(chat: any) {
    setOpenChats(prev => {
      if (prev.find(c => c.id === chat.id)) return prev
      return [...prev, chat]
    })
  }

  function closeChatBubble(chatId: string) {
    setOpenChats(prev => prev.filter(c => c.id !== chatId))
  }

  async function deleteChat(chatId: string) {
    await supabase.from('chats').delete().eq('id', chatId)
    closeChatBubble(chatId)
    loadChats()
  }

  function getChatName(chat: any) {
    if (chat.name) return chat.name
    if (chat.type === 'direct' && profile) {
      const other = chat.members?.find((m: any) => m.profile_id !== profile.id)
      return other?.profile?.full_name || 'Chat'
    }
    return 'Group'
  }

  const teamMembers = allProfiles.filter(p => p.id !== profile?.id)

  if (!profile) return null

  return (
    <>
      {/* Open chat bubbles - each is its own floating button+window */}
      {openChats.map(chat => (
        <ChatBubble key={chat.id} chat={chat} onClose={() => closeChatBubble(chat.id)} />
      ))}

      {/* Main Messages button */}
      <div className="relative" style={{ width: '130px' }}>
        <AnimatePresence>
          {showPanel && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute bottom-full mb-1 right-0 bg-bg-surface border border-border rounded-xl shadow-modal overflow-hidden"
              style={{ width: '260px', maxHeight: '380px', display: 'flex', flexDirection: 'column' }}
            >
              {/* Tabs */}
              <div className="flex border-b border-border shrink-0">
                <button onClick={() => setView('team')}
                  className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${view === 'team' ? 'border-accent text-accent' : 'border-transparent text-text-secondary'}`}>
                  Team
                </button>
                <button onClick={() => setView('chats')}
                  className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${view === 'chats' ? 'border-accent text-accent' : 'border-transparent text-text-secondary'}`}>
                  Recent
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
                {/* Team list */}
                {view === 'team' && (
                  <>
                    <p className="text-[10px] text-text-muted px-3 py-1.5 border-b border-border/40">
                      Click a name to open a chat
                    </p>
                    {teamMembers.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-6">Loading...</p>
                    ) : teamMembers.map(m => (
                      <div key={m.id} onClick={() => startDirectChat(m)}
                        className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-bg-hover cursor-pointer border-b border-border/30 transition-colors">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          m.role === 'admin' ? 'bg-accent/20 text-accent' : 'bg-blue-500/20 text-blue-300'
                        }`}>{m.full_name[0]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">{m.full_name}</p>
                          <p className="text-[10px] text-text-muted capitalize">{m.role}</p>
                        </div>
                        <MessageSquare className="w-3.5 h-3.5 text-text-muted shrink-0" />
                      </div>
                    ))}
                  </>
                )}

                {/* Recent chats */}
                {view === 'chats' && (
                  <>
                    {(chats as any[]).length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-xs text-text-muted">No chats yet</p>
                        <button onClick={() => setView('team')} className="text-xs text-accent mt-1">
                          Start one in Team →
                        </button>
                      </div>
                    ) : (chats as any[]).map(chat => (
                      <div key={chat.id}
                        className="flex items-center gap-2 px-3 py-2.5 hover:bg-bg-hover border-b border-border/30 group">
                        <div onClick={() => { openChatBubble(chat); setShowPanel(false) }}
                          className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                          <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                            {chat.type === 'group'
                              ? <Users className="w-3.5 h-3.5 text-accent" />
                              : <span className="text-xs font-bold text-accent">{getChatName(chat)[0]}</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-semibold text-text-primary truncate">{getChatName(chat)}</p>
                              {(chat.unread_count || 0) > 0 && (
                                <span className="bg-red-500 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0">
                                  {chat.unread_count}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => deleteChat(chat.id)}
                          className="btn-icon w-5 h-5 opacity-0 group-hover:opacity-100 text-red-400/50 hover:text-red-400 shrink-0">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle button */}
        <button
          onClick={() => setShowPanel(!showPanel)}
          className="flex items-center gap-1.5 px-2.5 py-2.5 bg-bg-elevated border border-border rounded-lg hover:border-border-strong transition-colors shadow-elevated w-full"
        >
          <MessageSquare className="w-4 h-4 text-accent shrink-0" />
          <span className="text-sm font-semibold text-text-primary">Messages</span>
          {unreadTotal > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ml-auto shrink-0">
              {unreadTotal}
            </span>
          )}
        </button>
      </div>
    </>
  )
}
