import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Schedule from "@/pages/Schedule";
import Translate from "@/pages/Translate";
import Book from "@/pages/Book";
import Presentations from "@/pages/Presentations";
import Assistant from "@/pages/Assistant";
import Setup from "@/pages/Setup";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="writing" element={<Navigate to="/book" replace />} />
        <Route path="translate" element={<Translate />} />
        <Route path="book" element={<Book />} />
        <Route path="presentations" element={<Presentations />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="setup" element={<Setup />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
