import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import SearchPage from "./pages/SearchPage";
import ResultsPage from "./pages/ResultsPage";
import FlightDetailPage from "./pages/FlightDetailPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import MyBookingsPage from "./pages/MyBookingsPage";
import SearchHistoryPage from "./pages/SearchHistoryPage";

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/flights/:scheduleId" element={<FlightDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/bookings" element={<MyBookingsPage />} />
          <Route path="/search-history" element={<SearchHistoryPage />} />
        </Routes>
      </main>
    </>
  );
}
