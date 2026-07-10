package security

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var (
	// SQL 规则只匹配组合型危险形态，避免将普通 select/admin 文本误判为注入。
	sqlTautologyPattern = regexp.MustCompile(`(?i)(?:^|[\s'"(;])\s*(?:or|and)\s+['"]?[[:alnum:]_]+['"]?\s*=\s*['"]?[[:alnum:]_]+['"]?`)
	sqlUnionPattern     = regexp.MustCompile(`(?i)\bunion\s+(?:all\s+)?select\b`)
	sqlStackedPattern   = regexp.MustCompile(`(?i)(?:;|--|/\*)\s*(?:drop|alter|truncate|delete|insert|update)\b`)
	sqlSleepPattern     = regexp.MustCompile(`(?i)\b(?:sleep|benchmark)\s*\(`)

	// NoSQL 规则覆盖常见 Mongo 操作符字符串形态。
	noSQLStringPattern = regexp.MustCompile(`(?i)(?:^|[{"'\s,])\$(?:ne|gt|gte|lt|lte|in|nin|regex|where|expr|or|and)\b`)

	// 命令规则匹配 shell 控制符、命令替换和危险命令组合。
	shellControlPattern = regexp.MustCompile(`(?i)(?:;|&&|\|\|?|\n|\r)\s*(?:rm|cat|sh|bash|cmd|powershell|pwsh|curl|wget|nc|netcat|whoami|id|chmod|chown|sudo)\b`)
	shellExecPattern    = regexp.MustCompile(`(?i)\b(?:sh|bash|cmd|powershell|pwsh)\s+(?:/c|-c)\b`)
)

// noSQLOperatorKeys 列出 JSON 对象中不应从外部输入直接透传的 NoSQL 操作符。
var noSQLOperatorKeys = map[string]struct{}{
	"$and":   {},
	"$expr":  {},
	"$gt":    {},
	"$gte":   {},
	"$in":    {},
	"$lt":    {},
	"$lte":   {},
	"$ne":    {},
	"$nin":   {},
	"$or":    {},
	"$regex": {},
	"$where": {},
}

// validateInputValue 递归检查任意请求输入值是否包含危险形态。
func validateInputValue(value any) error {
	if findUnsafeInput(value) {
		return ErrInvalidInput
	}

	return nil
}

// findUnsafeInput 在 query/form/JSON 解码后的结构中查找危险字符串或 NoSQL 操作符 key。
func findUnsafeInput(value any) bool {
	switch typed := value.(type) {
	case string:
		return IsUnsafeString(typed)
	case []string:
		for _, item := range typed {
			if IsUnsafeString(item) {
				return true
			}
		}
	case map[string][]string:
		for key, values := range typed {
			if IsUnsafeString(key) || findUnsafeInput(values) {
				return true
			}
		}
	case url.Values:
		for key, values := range typed {
			if IsUnsafeString(key) || findUnsafeInput(values) {
				return true
			}
		}
	case map[string]any:
		for key, nested := range typed {
			if IsUnsafeNoSQLKey(key) || IsUnsafeString(key) || findUnsafeInput(nested) {
				return true
			}
		}
	case []any:
		for _, nested := range typed {
			if findUnsafeInput(nested) {
				return true
			}
		}
	default:
		return false
	}

	return false
}

// IsUnsafeString 判断单个字符串是否呈现明显注入形态。
func IsUnsafeString(input string) bool {
	normalized := strings.TrimSpace(input)
	if normalized == "" {
		return false
	}

	return hasSQLInjectionShape(normalized) ||
		hasNoSQLInjectionShape(normalized) ||
		hasCommandInjectionShape(normalized)
}

// IsUnsafeNoSQLKey 判断 JSON key 是否是需要拦截的 NoSQL 操作符。
func IsUnsafeNoSQLKey(key string) bool {
	_, ok := noSQLOperatorKeys[strings.ToLower(strings.TrimSpace(key))]
	return ok
}

// hasSQLInjectionShape 检查 SQL 注入常见组合形态。
func hasSQLInjectionShape(input string) bool {
	return sqlTautologyPattern.MatchString(input) ||
		sqlUnionPattern.MatchString(input) ||
		sqlStackedPattern.MatchString(input) ||
		sqlSleepPattern.MatchString(input)
}

// hasNoSQLInjectionShape 检查字符串形式的 NoSQL 操作符注入。
func hasNoSQLInjectionShape(input string) bool {
	return noSQLStringPattern.MatchString(input)
}

// hasCommandInjectionShape 检查 shell 控制符和命令替换形态。
func hasCommandInjectionShape(input string) bool {
	return strings.Contains(input, "$(") ||
		strings.Contains(input, "`") ||
		shellControlPattern.MatchString(input) ||
		shellExecPattern.MatchString(input)
}

// invalidInputError 包装输入位置，便于内部排查时定位来源。
func invalidInputError(location string) error {
	if location == "" {
		return ErrInvalidInput
	}

	return fmt.Errorf("%w: %s", ErrInvalidInput, location)
}
