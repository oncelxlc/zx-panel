
    (function () {
      var theme = "dark";
      var themeStyle = "default";
      try {
        // 登录页固定深色；不读取或覆盖后台偏好，避免首屏闪亮。
        if (!/^\/login\/*$/i.test(window.location.pathname)) {
          theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
          if (!/^\/setup\/*$/i.test(window.location.pathname)) {
            var stored = window.localStorage.getItem("zx-panel-theme");
            if (stored === "light" || stored === "dark") theme = stored;
            if (window.localStorage.getItem("zx-panel-theme-style") === "islands") {
              themeStyle = "islands";
            }
          }
        }
      } catch {
        // 无法读取偏好时保留已解析的系统主题或默认暗色。
      }
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.themeStyle = themeStyle;
      document.documentElement.classList.toggle("dark", theme === "dark");
    })();
  
