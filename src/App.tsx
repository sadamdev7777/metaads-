import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./lib/auth";
import { StoreProvider } from "./lib/store";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Approvals from "./pages/Approvals";
import Products from "./pages/Products";
import MediaPage from "./pages/Media";
import Campaigns from "./pages/Campaigns";
import CampaignNew from "./pages/CampaignNew";
import Analysis from "./pages/Analysis";
import AIOffice from "./pages/AIOffice";
import Settings from "./pages/Settings";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-8 text-sm text-muted">Loading…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <StoreProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/products" element={<Products />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/campaigns/new" element={<CampaignNew />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/ai-office" element={<AIOffice />} />
          <Route path="/settings" element={<Navigate to="/settings/rules" replace />} />
          <Route path="/settings/:tab" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </StoreProvider>
  );
}
