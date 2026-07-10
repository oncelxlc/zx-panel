package security

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var (
	sqlTautologyPattern = regexp.MustCompile(`(?i)(?:^|[\s'"(;])\s*(?:or|and)\s+['"]?[[:alnum:]_]+['"]?\s*=\s*['"]?[[:alnum:]_]+['"]?`)
	sqlUnionPattern     = regexp.MustCompile(`(?i)\bunion\s+(?:all\s+)?select\b`)
	sqlStackedPattern   = regexp.MustCompile(`(?i)(?:;|--|/\*)\s*(?:drop|alter|truncate|delete|insert|update)\b`)
	sqlSleepPattern     = regexp.MustCompile(`(?i)\b(?:sleep|benchmark)\s*\(`)

	noSQLStringPattern = regexp.MustCompile(`(?i)(?:^|[{"'\s,])\$(?:ne|gt|gte|lt|lte|in|nin|regex|where|expr|or|and)\b`)

	shellControlPattern = regexp.MustCompile(`(?i)(?:;|&&|\|\|?|\n|\r)\s*(?:rm|cat|sh|bash|cmd|powershell|pwsh|curl|wget|nc|netcat|whoami|id|chmod|chown|sudo)\b`)
	shellExecPattern    = regexp.MustCompile(`(?i)\b(?:sh|bash|cmd|powershell|pwsh)\s+(?:/c|-c)\b`)
)

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

func validateInputValue(value any) error {
	if findUnsafeInput(value) {
		return ErrInvalidInput
	}

	return nil
}

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

func IsUnsafeString(input string) bool {
	normalized := strings.TrimSpace(input)
	if normalized == "" {
		return false
	}

	return hasSQLInjectionShape(normalized) ||
		hasNoSQLInjectionShape(normalized) ||
		hasCommandInjectionShape(normalized)
}

func IsUnsafeNoSQLKey(key string) bool {
	_, ok := noSQLOperatorKeys[strings.ToLower(strings.TrimSpace(key))]
	return ok
}

func hasSQLInjectionShape(input string) bool {
	return sqlTautologyPattern.MatchString(input) ||
		sqlUnionPattern.MatchString(input) ||
		sqlStackedPattern.MatchString(input) ||
		sqlSleepPattern.MatchString(input)
}

func hasNoSQLInjectionShape(input string) bool {
	return noSQLStringPattern.MatchString(input)
}

func hasCommandInjectionShape(input string) bool {
	return strings.Contains(input, "$(") ||
		strings.Contains(input, "`") ||
		shellControlPattern.MatchString(input) ||
		shellExecPattern.MatchString(input)
}

func invalidInputError(location string) error {
	if location == "" {
		return ErrInvalidInput
	}

	return fmt.Errorf("%w: %s", ErrInvalidInput, location)
}
