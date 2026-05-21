import { cn } from '@/lib/utils'

interface LoadingProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Loading({ className, size = 'md' }: LoadingProps) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }
  return (
    <div className={cn('spinner', sizeMap[size], className)} />
  )
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-64">
      <div className="flex flex-col items-center gap-3">
        <Loading size="lg" />
        <p className="text-text-muted text-sm">Loading...</p>
      </div>
    </div>
  )
}

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn(
      'animate-pulse bg-bg-elevated rounded',
      className
    )} />
  )
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full">
      <div className="border-b border-border px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b border-border/50 px-4 py-4">
          <div className="flex gap-6 items-center">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className={cn('h-3', j === 0 ? 'w-24' : 'flex-1')} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
