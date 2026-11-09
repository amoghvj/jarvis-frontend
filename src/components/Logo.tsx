import { Radar } from 'lucide-react'

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lg = size === 'lg'
  return (
    <div className="flex items-center gap-2.5">
      <div className={`grid place-items-center rounded-lg bg-accent/10 ring-1 ring-accent/30 text-accent ${lg ? 'h-11 w-11' : 'h-8 w-8'}`}>
        <Radar className={lg ? 'h-6 w-6' : 'h-4 w-4'} />
      </div>
      <span className={`font-semibold tracking-[0.18em] text-white ${lg ? 'text-xl' : 'text-sm'}`}>J.A.R.V.I.S.</span>
    </div>
  )
}

