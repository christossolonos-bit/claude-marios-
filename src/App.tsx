import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Schedule from "@/pages/Schedule";
import Projects from "@/pages/Projects";
import Seminars from "@/pages/Seminars";
import Writing from "@/pages/Writing";
import Translate from "@/pages/Translate";
import Book from "@/pages/Book";
import Assistant from "@/pages/Assistant";
import Sales from "@/pages/Sales";
import Marketing from "@/pages/Marketing";
import MediaKit from "@/pages/MediaKit";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="projects" element={<Projects />} />
        <Route path="seminars" element={<Seminars />} />
        <Route path="writing" element={<Writing />} />
        <Route path="translate" element={<Translate />} />
        <Route path="book" element={<Book />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="sales" element={<Sales />} />
        <Route path="marketing" element={<Marketing />} />
        <Route path="media-kit" element={<MediaKit />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
