package security

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"unicode/utf8"
)

// JSONError 保留传输错误的稳定分类，不暴露请求内容。
// 调用方负责通过统一响应层发送错误。
type JSONError struct {
	Status  int
	Code    string
	Message string
}

// Error 实现标准错误接口，仅输出适合公开的消息。
// 请求值和内部解析错误不会进入响应。
func (e *JSONError) Error() string { return e.Message }

// DecodeJSON 严格读取一个大小受限的 JSON 对象。
// 不改写字符串，拒绝未知、重复及大小写别名字段。
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return &JSONError{415, "UNSUPPORTED_MEDIA_TYPE", "请求必须使用 application/json"}
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, DefaultMaxBodyBytes))
	if err != nil {
		return &JSONError{413, "BODY_TOO_LARGE", "请求体超过 1 MiB 限制"}
	}
	return DecodeBytes(body, dst)
}

// DecodeBytes 校验完整结构后再写入 DTO，避免反射清洗秘密值。
// 操作联合类型可在识别 action 后用该函数再次校验具体 DTO。
func DecodeBytes(body []byte, dst any) error {
	trimmed := bytes.TrimSpace(body)
	malformed := &JSONError{400, "MALFORMED_JSON", "请求必须是无重复字段的单个 JSON 对象"}
	if len(trimmed) == 0 || trimmed[0] != '{' || !validUnicode(trimmed) {
		return malformed
	}
	dec := json.NewDecoder(bytes.NewReader(trimmed))
	dec.UseNumber()
	if err := checkTokens(dec, 0); err != nil {
		return malformed
	}
	if _, err := dec.Token(); err != io.EOF {
		return malformed
	}
	var raw any
	if err := json.Unmarshal(trimmed, &raw); err != nil {
		return malformed
	}
	typ := reflect.TypeOf(dst)
	if typ == nil || typ.Kind() != reflect.Pointer {
		return fmt.Errorf("JSON target must be a pointer")
	}
	if err := exactKeys(raw, typ.Elem()); err != nil {
		return &JSONError{422, "INVALID_INPUT", "请求字段不符合接口契约"}
	}
	dec = json.NewDecoder(bytes.NewReader(trimmed))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return &JSONError{422, "INVALID_INPUT", "请求字段类型或名称不正确"}
	}
	return nil
}

// checkTokens 递归拒绝所有层级的重复键。
// 字段值保持原样，校验不会将密码内容视为命令。
func checkTokens(dec *json.Decoder, depth int) error {
	if depth > 64 {
		return fmt.Errorf("JSON nesting exceeds limit")
	}
	token, err := dec.Token()
	if err != nil {
		return err
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	if delim != '{' && delim != '[' {
		return fmt.Errorf("unexpected delimiter")
	}
	keys := map[string]bool{}
	for dec.More() {
		if delim == '{' {
			key, err := dec.Token()
			if err != nil {
				return err
			}
			name, ok := key.(string)
			if !ok || keys[name] {
				return fmt.Errorf("duplicate key")
			}
			keys[name] = true
		}
		if err := checkTokens(dec, depth+1); err != nil {
			return err
		}
	}
	_, err = dec.Token()
	return err
}

// validUnicode 拒绝 JSON 解码器会默默替换的无效 UTF-8 或孤立代理项。
// 合法的 Unicode、转义反斜线以及秘密中的空白均保持不变。
func validUnicode(body []byte) bool {
	if !utf8.Valid(body) {
		return false
	}
	for i := 0; i < len(body); i++ {
		if body[i] != '\\' {
			continue
		}
		if i+1 >= len(body) {
			return false
		}
		if body[i+1] != 'u' {
			i++
			continue
		}
		if i+6 > len(body) {
			return false
		}
		value, err := strconv.ParseUint(string(body[i+2:i+6]), 16, 16)
		if err != nil {
			return false
		}
		i += 5
		if value >= 0xDC00 && value <= 0xDFFF {
			return false
		}
		if value >= 0xD800 && value <= 0xDBFF {
			if i+6 >= len(body) || body[i+1] != '\\' || body[i+2] != 'u' {
				return false
			}
			next, err := strconv.ParseUint(string(body[i+3:i+7]), 16, 16)
			if err != nil || next < 0xDC00 || next > 0xDFFF {
				return false
			}
			i += 6
		}
	}
	return true
}

// exactKeys 对字段执行精确大小写匹配，并阻止 null 被悄悄转成空字符串等零值。
// 指针允许显式空值，json.RawMessage 留给联合类型的第二次严格解码。
func exactKeys(value any, typ reflect.Type) error {
	if value == nil {
		if typ.Kind() == reflect.Pointer || typ.Kind() == reflect.Interface || typ == reflect.TypeOf(json.RawMessage{}) {
			return nil
		}
		return fmt.Errorf("null is not valid for this field")
	}
	for typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}
	if typ == reflect.TypeOf(json.RawMessage{}) {
		return nil
	}
	switch v := value.(type) {
	case map[string]any:
		if typ.Kind() == reflect.Map {
			for _, item := range v {
				if err := exactKeys(item, typ.Elem()); err != nil {
					return err
				}
			}
			return nil
		}
		if typ.Kind() != reflect.Struct {
			return nil
		}
		fields := map[string]reflect.Type{}
		for i := 0; i < typ.NumField(); i++ {
			f := typ.Field(i)
			name := strings.Split(f.Tag.Get("json"), ",")[0]
			if name != "" && name != "-" {
				fields[name] = f.Type
			}
		}
		for key, item := range v {
			field, ok := fields[key]
			if !ok {
				return fmt.Errorf("unknown field")
			}
			if err := exactKeys(item, field); err != nil {
				return err
			}
		}
	case []any:
		if typ.Kind() == reflect.Slice || typ.Kind() == reflect.Array {
			for _, item := range v {
				if err := exactKeys(item, typ.Elem()); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
