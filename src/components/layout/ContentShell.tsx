import { Outlet } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'

export const ContentShell = () => {
  return (
    <div className="flex flex-col min-h-screen bg-stone text-ink">
      <NavBar variant="light" />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
