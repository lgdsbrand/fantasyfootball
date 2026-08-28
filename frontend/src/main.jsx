import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FantasyHub from "./fantasy/FantasyHub.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <FantasyHub />
  </StrictMode>
);
