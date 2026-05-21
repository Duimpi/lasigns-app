'use client'

import { Modal } from './Modal'
import { AlertTriangle } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmLabel?: string
  danger?: boolean
  isLoading?: boolean
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  danger = false,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      preventOutsideClose={false}
    >
      <div className="flex flex-col items-center text-center gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
          danger ? 'bg-red-900/30 text-red-400' : 'bg-accent-muted text-accent'
        }`}>
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-display text-xl text-text-primary">{title}</h3>
          <p className="text-text-secondary text-sm mt-2">{message}</p>
        </div>
        <div className="flex gap-3 w-full">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={isLoading}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={isLoading}
          >
            {isLoading ? <span className="spinner w-4 h-4" /> : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
