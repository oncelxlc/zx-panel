
    (function () {
      var theme = "dark";
      try {
        theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
        // 登录页忽略历史选择，首屏与路由内的主题策略保持一致。
        if (!/^\/(?:login|setup)\/*$/i.test(window.location.pathname)) {
          var stored = window.localStorage.getItem("zx-panel-theme");
          if (stored === "light" || stored === "dark") theme = stored;
        }
      } catch {
        // 无法读取偏好时保留已解析的系统主题或默认暗色。
      }
      document.documentElement.dataset.theme = theme;
      document.documentElement.classList.toggle("dark", theme === "dark");
    })();
  
