import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PlatformApp from "./Platform.jsx";

const isPlatform = window.location.pathname.replace(/\/+$/, "") === "/platform";
createRoot(document.getElementById("root")).render(isPlatform ? <PlatformApp /> : <App />);
