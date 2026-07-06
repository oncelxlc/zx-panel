import { ConfigProvider } from "antd";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.scss";

ReactDOM.createRoot(document.getElementById("root") as HTMLDivElement).render(
  <StrictMode>
    <ConfigProvider>
      <App/>
    </ConfigProvider>
  </StrictMode>,
);
