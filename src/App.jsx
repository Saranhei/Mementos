import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isConfigured } from './lib/supabase.js'
import { Home } from './screens/Home.jsx'
import { CreateEvent } from './screens/CreateEvent.jsx'
import { EventPage } from './screens/EventPage.jsx'
import { SetupNotice } from './screens/SetupNotice.jsx'

export const App = () => {
  if (!isConfigured) return <SetupNotice />
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/nuevo" element={<CreateEvent />} />
        <Route path="/e/:code" element={<EventPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
