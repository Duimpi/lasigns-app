'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

// Map usernames/names to emails for easy login
const USER_MAP: Record<string, string> = {
  // Full names
  'damion': 'lasigns.d@gmail.com',
  'alida': 'baganiholdings@gmail.com',
  'michelle': 'lareception32@gmail.com',
  'nicole': 'lasigns32@gmail.com',
  'bets-mari': 'lasigns.graphics1@gmail.com',
  'betsmari': 'lasigns.graphics1@gmail.com',
  'bets': 'lasigns.graphics1@gmail.com',
  'geraldo': 'lasigns.design1@gmail.com',
  // Emails work directly too
  'lasigns.d@gmail.com': 'lasigns.d@gmail.com',
  'baganiholdings@gmail.com': 'baganiholdings@gmail.com',
  'lareception32@gmail.com': 'lareception32@gmail.com',
  'lasigns32@gmail.com': 'lasigns32@gmail.com',
  'lasigns.graphics1@gmail.com': 'lasigns.graphics1@gmail.com',
  'lasigns.design1@gmail.com': 'lasigns.design1@gmail.com',
}

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!login.trim() || !password.trim()) {
      toast.error('Enter your name/email and password')
      return
    }
    setIsLoading(true)
    try {
      // Resolve username to email
      const key = login.trim().toLowerCase()
      const email = USER_MAP[key] || login.trim()

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      toast.error(msg === 'Invalid login credentials' ? 'Wrong name or password' : msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-accent/3 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm relative"
      >
        <div className="bg-bg-surface border border-border rounded-xl shadow-modal p-8">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Image
              src="/logo.png"
              alt="LA Signs"
              width={140}
              height={70}
              className="object-contain"
              style={{ mixBlendMode: 'screen', filter: 'brightness(1)' }}
              onError={() => {}}
            />
          </div>

          <h1 className="text-xl font-semibold text-text-primary mb-1 text-center">Welcome Back</h1>
          <p className="text-text-muted text-sm mb-6 text-center">LA Signs & Graphics — Operations</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Your Name or Email</label>
              <input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                type="text"
                autoComplete="username"
                className="input"
                placeholder="e.g. Damion or Nicole"
                autoFocus
              />
              <p className="text-[11px] text-text-muted mt-1">
                Use your first name: Damion, Alida, Michelle, Nicole, Bets-Mari or Geraldo
              </p>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="input pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full mt-2"
            >
              {isLoading ? (
                <><span className="spinner w-4 h-4" /> Signing In...</>
              ) : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-xs mt-4">
          LA Signs & Graphics CC · Windhoek, Namibia
        </p>
      </motion.div>
    </div>
  )
}
