package api

import "strings"

// routeMatches 为 Gin 已声明路径构造准确的 Allow 响应。
// 动态参数只匹配一个路径段，不把未知 API 当作存在的资源。
func routeMatches(pattern, path string) bool {
	expected, actual := strings.Split(pattern, "/"), strings.Split(path, "/")
	if len(expected) != len(actual) {
		return false
	}
	for i, part := range expected {
		if strings.HasPrefix(part, ":") && actual[i] != "" {
			continue
		}
		if part != actual[i] {
			return false
		}
	}
	return true
}
