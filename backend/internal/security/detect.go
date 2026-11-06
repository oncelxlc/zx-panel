package security

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// 注入检测规则集中保存经过约束的组合型正则表达式。
// 规则保持包内私有，避免业务层绕过统一检测入口直接调用。
var (
	// SQL 规则只匹配组合型危险形态，避免将普通 select/admin 文本误判为注入。
	// 多个表达式分别覆盖恒真条件、联合查询、堆叠语句和延时函数。
	sqlTautologyPattern = regexp.MustCompile(`(?i)(?:^|[\s'"(;])\s*(?:or|and)\s+['"]?[[:alnum:]_]+['"]?\s*=\s*['"]?[[:alnum:]_]+['"]?`)
	sqlUnionPattern     = regexp.MustCompile(`(?i)\bunion\s+(?:all\s+)?select\b`)
	sqlStackedPattern   = regexp.MustCompile(`(?i)(?:;|--|/\*)\s*(?:drop|alter|truncate|delete|insert|update)\b`)
	sqlSleepPattern     = regexp.MustCompile(`(?i)\b(?:sleep|benchmark)\s*\(`)

	// NoSQL 规则覆盖常见 Mongo 操作符字符串形态。
	// 结构化 map 键还会通过 noSQLOperatorKeys 执行精确检查。
	noSQLStringPattern = regexp.MustCompile(`(?i)(?:^|[{"'\s,])\$(?:ne|gt|gte|lt|lte|in|nin|regex|where|expr|or|and)\b`)

	// 命令规则匹配 shell 控制符、命令替换和危险命令组合。
	// 该规则仅是基础防线，实际命令执行仍必须使用显式白名单。
	shellControlPattern = regexp.MustCompile(`(?i)(?:;|&&|\|\|?|\n|\r)\s*(?:rm|cat|sh|bash|cmd|powershell|pwsh|curl|wget|nc|netcat|whoami|id|chmod|chown|sudo)\b`)
	shellExecPattern    = regexp.MustCompile(`(?i)\b(?:sh|bash|cmd|powershell|pwsh)\s+(?:/c|-c)\b`)
)

// noSQLOperatorKeys 列出禁止从外部输入透传的 NoSQL 操作符。
// 键名会先转为小写，再通过该集合执行精确匹配。
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

// validateInputValue 递归检查请求输入是否包含危险形态。
// 命中风险时返回统一哨兵错误供中间件映射响应。
func validateInputValue(value any) error {
	if findUnsafeInput(value) {
		return ErrInvalidInput
	}

	return nil
}

// findUnsafeInput 在解码后的请求结构中查找危险内容。
// 字符串值和 NoSQL 操作符键都会进入对应检测流程。
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
// 空白输入直接放行，其他输入依次检查 SQL、NoSQL 和命令风险。
func IsUnsafeString(input string) bool {
	normalized := strings.TrimSpace(input)
	if normalized == "" {
		return false
	}

	return hasSQLInjectionShape(normalized) ||
		hasNoSQLInjectionShape(normalized) ||
		hasCommandInjectionShape(normalized)
}

// IsUnsafeNoSQLKey 判断 JSON key 是否是危险 NoSQL 操作符。
// 判断使用去空白和小写后的精确键名。
func IsUnsafeNoSQLKey(key string) bool {
	_, ok := noSQLOperatorKeys[strings.ToLower(strings.TrimSpace(key))]
	return ok
}

// hasSQLInjectionShape 检查 SQL 注入常见组合形态。
// 多个规则组合覆盖不同攻击类别并降低普通文本误判。
func hasSQLInjectionShape(input string) bool {
	return sqlTautologyPattern.MatchString(input) ||
		sqlUnionPattern.MatchString(input) ||
		sqlStackedPattern.MatchString(input) ||
		sqlSleepPattern.MatchString(input)
}

// hasNoSQLInjectionShape 检查字符串形式的 NoSQL 操作符注入。
// 业务层仍必须构造安全查询，不能只依赖该形态检测。
func hasNoSQLInjectionShape(input string) bool {
	return noSQLStringPattern.MatchString(input)
}

// hasCommandInjectionShape 检查 shell 控制符和命令替换形态。
// 命中后输入会在进入业务命令逻辑前被拒绝。
func hasCommandInjectionShape(input string) bool {
	return strings.Contains(input, "$(") ||
		strings.Contains(input, "`") ||
		shellControlPattern.MatchString(input) ||
		shellExecPattern.MatchString(input)
}

// invalidInputError 包装输入位置便于内部定位来源。
// errors.Is 仍可识别底层 ErrInvalidInput 哨兵错误。
func invalidInputError(location string) error {
	if location == "" {
		return ErrInvalidInput
	}

	return fmt.Errorf("%w: %s", ErrInvalidInput, location)
}
