'use client'

import { useEffect, useState, useRef } from 'react'
import { MobileShell } from '@/components/mobile/MobileShell'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatTimeAgo } from '@/lib/utils'
import { ChevronLeft, Send, MessageSquare, Users } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MobileMessages() {
  const { profile } = useAuthStore()
  const [view, setView] = useState<'list'|'chat'|'team'>('list')
  const [chats, setChats] = useState<any[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [activeChat, setActiveChat] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadChats()
    loadProfiles()
    const channel = supabase.channel('mobile-msgs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, loadChats)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (activeChat) loadMessages(activeChat.id)
  }, [activeChat])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadChats() {
    if (!profile) return
    const { data } = await supabase.from('chats')
      .select('*, members:chat_members(*, profile:profiles(*))')
      .order('updated_at', { ascending: false })
    const mine = ((data as any[]) || []).filter(c => c.members?.some((m: any) => m.profile_id === profile.id))
    setChats(mine)
  }

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles((data || []).filter((p: any) => p.id !== profile?.id))
  }

  async function loadMessages(chatId: string) {
    const { data } = await supabase.from('chat_messages')
      .select('*, sender:profiles!sender_id(id, full_name)')
      .eq('chat_id', chatId).eq('is_deleted', false)
      .order('created_at', { ascending: true }).limit(80)
    setMessages(data || [])
    // Mark read
    await supabase.from('chat_members').update({ last_read_at: new Date().toISOString() })
      .eq('chat_id', chatId).eq('profile_id', profile!.id)
  }

  async function startChat(target: any) {
    if (!profile) return
    const existing = chats.find(c =>
      c.type === 'direct' &&
      c.members?.some((m: any) => m.profile_id === profile.id) &&
      c.members?.some((m: any) => m.profile_id === target.id)
    )
    if (existing) { setActiveChat(existing); setView('chat'); return }

    const { data: chat } = await supabase.from('chats')
      .insert({ type: 'direct', created_by: profile.id }).select().single()
    if (chat) {
      await supabase.from('chat_members').insert([
        { chat_id: chat.id, profile_id: profile.id },
        { chat_id: chat.id, profile_id: target.id },
      ])
      await loadChats()
      setActiveChat({ ...chat, members: [
        { profile_id: profile.id, profile: { full_name: profile.full_name } },
        { profile_id: target.id, profile: { full_name: target.full_name } },
      ]})
      setView('chat')
    }
  }

  async function sendMessage() {
    if (!newMsg.trim() || !activeChat || !profile) return
    setIsSending(true)
    const { error } = await supabase.from('chat_messages').insert({
      chat_id: activeChat.id, sender_id: profile.id,
      content: newMsg.trim(), message_type: 'text',
    })
    if (error) { toast.error('Failed to send'); setIsSending(false); return }
    await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', activeChat.id)
    setNewMsg('')
    loadMessages(activeChat.id)
    setIsSending(false)
  }

  function getChatName(chat: any) {
    if (chat.name) return chat.name
    if (chat.type === 'direct' && profile) {
      const other = chat.members?.find((m: any) => m.profile_id !== profile.id)
      return other?.profile?.full_name || 'Chat'
    }
    return 'Group'
  }

  // Chat view
  if (view === 'chat' && activeChat) {
    return (
      <MobileShell>
        <div className="flex flex-col h-screen">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-4 bg-bg-surface border-b border-border">
            <button onClick={() => { setView('list'); setActiveChat(null) }} className="text-accent">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center font-bold text-accent">
              {getChatName(activeChat)[0]}
            </div>
            <p className="font-semibold text-text-primary">{getChatName(activeChat)}</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-24">
            {messages.map(msg => {
              const isOwn = msg.sender_id === profile?.id
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {!isOwn && <p className="text-xs text-accent font-semibold px-1">{msg.sender?.full_name}</p>}
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isOwn ? 'bg-accent text-text-inverse rounded-br-sm' : 'bg-bg-surface border border-border text-text-primary rounded-bl-sm'
                    }`}>{msg.content}</div>
                    <p className="text-[10px] text-text-muted px-1">{formatTimeAgo(msg.created_at)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input - fixed at bottom */}
          <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto px-4 py-3 bg-bg-surface border-t border-border">
            <div className="flex gap-2">
              <input value={newMsg} onChange={e => setNewMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendMessage() }}
                className="input flex-1 rounded-full" placeholder="Message..." />
              <button onClick={sendMessage} disabled={isSending || !newMsg.trim()}
                className="w-11 h-11 bg-accent rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform">
                <Send className="w-4 h-4 text-text-inverse" />
              </button>
            </div>
          </div>
        </div>
      </MobileShell>
    )
  }

  return (
    <MobileShell>
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-text-primary">Messages</h1>
          <button onClick={() => setView(view === 'team' ? 'list' : 'team')}
            className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated border border-border rounded-xl text-sm font-semibold text-text-secondary">
            <Users className="w-4 h-4" />
            {view === 'team' ? 'Chats' : 'Team'}
          </button>
        </div>

        {/* Team list */}
        {view === 'team' && (
          <div className="space-y-2">
            <p className="text-xs text-text-muted mb-3">Tap a name to start a message</p>
            {profiles.map(p => (
              <div key={p.id} onClick={() => startChat(p)}
                className="flex items-center gap-3 bg-bg-surface border border-border rounded-2xl p-4 active:scale-[0.98] transition-transform cursor-pointer">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold ${p.role === 'admin' ? 'bg-accent/20 text-accent' : 'bg-blue-500/20 text-blue-300'}`}>
                  {p.full_name[0]}
                </div>
                <div>
                  <p className="font-semibold text-text-primary">{p.full_name}</p>
                  <p className="text-xs text-text-muted capitalize">{p.role}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chats list */}
        {view === 'list' && (
          <div className="space-y-2">
            {chats.length === 0 ? (
              <div className="bg-bg-surface border border-border rounded-2xl p-8 text-center">
                <MessageSquare className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-30" />
                <p className="text-text-muted text-sm mb-2">No chats yet</p>
                <button onClick={() => setView('team')} className="text-accent text-sm font-semibold">
                  Message a team member →
                </button>
              </div>
            ) : chats.map(chat => (
              <div key={chat.id} onClick={() => { setActiveChat(chat); setView('chat') }}
                className="flex items-center gap-3 bg-bg-surface border border-border rounded-2xl p-4 active:scale-[0.98] transition-transform cursor-pointer">
                <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-lg font-bold text-accent">
                  {getChatName(chat)[0]}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-text-primary">{getChatName(chat)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  )
}
