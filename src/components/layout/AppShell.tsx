import { Outlet } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'

export const AppShell = () => {
  return (
    <div className="dark flex flex-col h-screen bg-charcoal text-white">
      <NavBar variant="dark" />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
