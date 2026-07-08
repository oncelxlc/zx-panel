import App from "@/App";
import { router } from "@/routes/router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import "./styles.scss";
import { ThemeProvider } from "./theme/ThemeProvider";

ReactDOM.createRoot(document.getElementById("root") as HTMLDivElement).render(
  <StrictMode>
    <ThemeProvider>
      {/*<App/>*/}
      <RouterProvider router={router}/>
    </ThemeProvider>
  </StrictMode>,
);
