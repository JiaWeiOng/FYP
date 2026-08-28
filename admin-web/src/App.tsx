import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Scans from "./pages/Scans";
import Users from "./pages/Users";
import Blocklist from "./pages/Blocklist";
import Hotspots from "./pages/Hotspots";
import Dataset from "./pages/Dataset";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/scans" element={<Scans />} />
        <Route path="/users" element={<Users />} />
        <Route path="/hotspots" element={<Hotspots />} />
        <Route path="/dataset" element={<Dataset />} />
        <Route path="/blocklist" element={<Blocklist />} />
      </Route>
      <Route path="*" element={<Login />} />
    </Routes>
  );
}
