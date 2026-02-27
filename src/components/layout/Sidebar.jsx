import { NavLink } from 'react-router-dom'
import { LayoutDashboard, GitBranch, Server, BarChart2, Settings } from 'lucide-react'
import useStore from '@/store/useStore'
import clsx from 'clsx'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/deployments', icon: GitBranch,        label: 'Deployments' },
  { to: '/services',    icon: Server,           label: 'Services' },
  { to: '/analytics',   icon: BarChart2,        label: 'Analytics' },
  { to: '/settings',    icon: Settings,         label: 'Settings' },
]

export default function Sidebar() {
  const session     = useStore(s => s.session)
  const deployments = useStore(s => s.deployments)
  const alerts      = useStore(s => s.alerts)
  const scoring     = useStore(s => s.metrics.scoring)

  return (
    <aside className="w-[180px] bg-ink border-r border-edge flex flex-col flex-shrink-0">
      {/* Nav links */}
      <nav className="flex-1 py-4 flex flex-col gap-0.5 px-2">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => clsx(
            'flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-display font-medium tracking-wide transition-all duration-150',
            isActive
              ? 'bg-surface text-frost border border-edge'
              : 'text-muted hover:text-cloud hover:bg-surface/50'
          )}>
            <Icon size={13} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* System status panel */}
      <div className="border-t border-edge p-3 space-y-2.5">
        <p className="text-[8px] font-display text-muted tracking-[2px] uppercase">System</p>

        <StatusRow label="Session" value={session ? 'ACTIVE' : 'IDLE'} color={session ? 'text-signal' : 'text-muted'} dot={!!session} />
        <StatusRow label="History" value={`${deployments.length} runs`} color="text-ghost" />
        <StatusRow label="Alerts"  value={`${alerts.length} fired`}     color={alerts.length > 0 ? 'text-warn' : 'text-muted'} />

        {session && (
          <div className="pt-1 border-t border-edge">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-display text-muted">Risk</span>
              <span className={clsx('text-xs font-mono font-semibold',
                scoring.score >= 72 ? 'text-danger' :
                scoring.score >= 50 ? 'text-warn'   : 'text-ok')}>
                {scoring.score}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function StatusRow({ label, value, color, dot }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[8px] font-display text-dim">{label}</span>
      <div className="flex items-center gap-1">
        {dot && <div className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />}
        <span className={clsx('text-[9px] font-mono', color)}>{value}</span>
      </div>
    </div>
  )
}
