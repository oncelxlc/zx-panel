package host

import "path/filepath"

// RuntimeCommand 返回每类运行时对应的固定系统入口名。
// 不接受浏览器提供命令名称，也不改动包管理器拥有的 /usr/bin 文件。
func RuntimeCommand(kind string) string {
	return map[string]string{"node": "node", "go": "go", "rust": "rustc", "python": "python3", "java": "java", "php": "php", "ruby": "ruby", "dotnet": "dotnet", "bun": "bun", "deno": "deno"}[kind]
}

// IsSystemRuntimeDefault 按系统公共 PATH 的入口解析当前默认可执行文件。
// 用户自行前置的 PATH 和已运行进程不受系统入口切换影响。
func IsSystemRuntimeDefault(kind, executable string) bool {
	name := RuntimeCommand(kind)
	if name == "" || !filepath.IsAbs(executable) {
		return false
	}
	actual, err := filepath.EvalSymlinks(executable)
	if err != nil {
		return false
	}
	for _, root := range []string{"/usr/local/bin", "/usr/bin", "/bin"} {
		path, err := filepath.EvalSymlinks(filepath.Join(root, name))
		if err == nil {
			return path == actual
		}
	}
	return false
}
