import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProviders } from './providers'

// Guest and staff surfaces are separate bundles: a guest scanning a QR never
// downloads dashboard code, and vice versa.
const Landing = lazy(() => import('@/features/marketing/Landing'))
const DemoStage = lazy(() => import('@/features/marketing/DemoStage'))
const GuestApp = lazy(() => import('@/features/guest/GuestApp'))
const Login = lazy(() => import('@/features/auth/Login'))
const RestaurantPicker = lazy(() => import('@/features/onboarding/RestaurantPicker'))
const CreateRestaurant = lazy(() => import('@/features/onboarding/CreateRestaurant'))
const Dashboard = lazy(() => import('@/features/dashboard/DashboardApp'))
const PrintQr = lazy(() => import('@/features/dashboard/tables/PrintQr'))

export function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/demo" element={<DemoStage />} />
            <Route path="/m/:slug/*" element={<GuestApp />} />
            <Route path="/entrar" element={<Login />} />
            <Route path="/app" element={<RestaurantPicker />} />
            <Route path="/app/novo" element={<CreateRestaurant />} />
            <Route path="/app/:slug/mesas/imprimir" element={<PrintQr />} />
            <Route path="/app/:slug/*" element={<Dashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProviders>
  )
}
