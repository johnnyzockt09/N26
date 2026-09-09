import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout';
import { AdminRoute, ProtectedRoute } from './components/protected';
import { LandingPage } from './pages/landing';
import { LoginPage } from './pages/login';
import { RegisterPage } from './pages/register';
import { DashboardPage } from './pages/dashboard';
import { LinkPage } from './pages/link';
import { TransferPage } from './pages/transfer';
import { TransactionsPage } from './pages/transactions';
import { InvoicesPage } from './pages/invoices';
import { AdminPage } from './pages/admin';
import { LevelsPage } from './pages/levels';
import { LevelPage } from './pages/level';
import { NotFoundPage } from './pages/notFound';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/link" element={<LinkPage />} />
          <Route path="/transfer" element={<TransferPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/levels" element={<LevelsPage />} />
          <Route path="/levels/:id" element={<LevelPage />} />
        </Route>

        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}