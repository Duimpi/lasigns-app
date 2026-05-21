'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  subtitle?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /** Prevent closing by clicking outside the modal */
  preventOutsideClose?: boolean
  actions?: React.ReactNode
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
  full: 'max-w-[95vw]',
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'lg',
  preventOutsideClose = true,
  actions,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Escape key close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !preventOutsideClose) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose, preventOutsideClose])

  function handleOverlayClick(e: React.MouseEvent) {
    if (preventOutsideClose) return
    if (e.target === overlayRef.current) {
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleOverlayClick}
        >
          <motion.div
            className={cn(
              'modal w-full',
              sizeMap[size]
            )}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Header */}
            {(title || actions !== undefined) && (
              <div className="flex items-start justify-between px-6 py-4 border-b border-border sticky top-0 bg-bg-surface z-10">
                <div>
                  {title && (
                    <h2 className="font-display text-xl text-text-primary tracking-wide">{title}</h2>
                  )}
                  {subtitle && (
                    <p className="text-text-muted text-sm mt-0.5">{subtitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  {actions}
                  <button
                    onClick={onClose}
                    className="btn-icon ml-1"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="p-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
