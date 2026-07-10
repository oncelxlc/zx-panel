import "./MainHeader.scss";
import { Link } from "react-router";

export function MainHeader() {
  return (
    <div className="header-layout">
      <div className="header-layout__left">
        <Link to="./">ZX PANEL</Link>
      </div>
      <div className="header-layout__right"></div>
    </div>
  );
}