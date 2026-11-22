import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import { FullPageLoader } from "./components/UI";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import MembersPage from "./pages/MembersPage";
import MemberDetailsPage from "./pages/MemberDetailsPage";
import PaymentsPage from "./pages/PaymentsPage";
import AddPaymentPage from "./pages/AddPaymentPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/AdminPage";
import AccessRequestPage from "./pages/AccessRequestPage";

function Protected({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status && user.status !== "active") return <Navigate to="/access" replace />;
  if (user.isApproved === false || user.approved === false) return <Navigate to="/access" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

function PrivatePage({ children, admin }) {
  return <Protected admin={admin}><AppShell>{children}</AppShell></Protected>;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  const home = user?.status && user.status !== "active" ? "/access" : "/";
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/register" element={user ? <Navigate to={home} replace /> : <RegisterPage />} />
      <Route path="/access" element={<AccessRequestPage />} />
      <Route path="/" element={<PrivatePage><DashboardPage /></PrivatePage>} />
      <Route path="/members" element={<PrivatePage><MembersPage /></PrivatePage>} />
      <Route path="/members/:id" element={<PrivatePage><MemberDetailsPage /></PrivatePage>} />
      <Route path="/payments" element={<PrivatePage><PaymentsPage /></PrivatePage>} />
      <Route path="/payments/new" element={<PrivatePage admin><AddPaymentPage /></PrivatePage>} />
      <Route path="/settings" element={<PrivatePage><SettingsPage /></PrivatePage>} />
      <Route path="/admin" element={<PrivatePage admin><AdminPage /></PrivatePage>} />
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
  );
}
