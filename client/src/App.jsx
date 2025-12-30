import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import SortPage from './pages/SortPage'
import DuplicatesPage from './pages/DuplicatesPage'
import FaceSearchPage from './pages/FaceSearchPage'
import ToastContainer from '@/components/ToastContainer'
import './index.css'

const navItem = (to, label) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `block rounded-lg px-3 py-2 text-sm font-semibold transition ${
        isActive ? 'bg-sky-500/15 text-sky-200' : 'text-slate-200 hover:bg-slate-800'
      }`
    }
  >
    {label}
  </NavLink>
)

const App = () => (
  <BrowserRouter>
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-8">
        <aside className="w-56 shrink-0 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm font-medium text-sky-300">HebPhotoSort</p>
          <h1 className="mt-1 text-xl font-semibold text-slate-50">ניווט</h1>
          <div className="mt-4 space-y-2">
            {navItem('/sort', 'מיון תמונות')}
            {navItem('/duplicates', 'בדיקת כפילויות')}
            {navItem('/faces', 'חיפוש לפי פנים')}
          </div>
        </aside>

        <section className="flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/sort" replace />} />
            <Route path="/sort" element={<SortPage />} />
            <Route path="/duplicates" element={<DuplicatesPage />} />
            <Route path="/faces" element={<FaceSearchPage />} />
            <Route path="*" element={<Navigate to="/sort" replace />} />
          </Routes>
        </section>
      </div>

      <ToastContainer />
    </div>
  </BrowserRouter>
)

export default App
