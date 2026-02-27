import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import Dashboard from '@/pages/Dashboard'
import Deployments from '@/pages/Deployments'
import Services from '@/pages/Services'
import Analytics from '@/pages/Analytics'
import Settings from '@/pages/Settings'

export default function App() {
  return (
    <div className="flex flex-col h-screen bg-void overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-void">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/deployments" element={<Deployments />} />
            <Route path="/services" element={<Services />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
