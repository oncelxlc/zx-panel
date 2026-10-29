package security

import (
	"reflect"
	"strings"
	"unicode"
)

// SanitizeString 清理字符串中的 NUL、危险控制字符和首尾空白。
// 正常可见业务文本保持原顺序，不执行内容转义或替换。
func SanitizeString(input string) string {
	cleaned := strings.Map(func(r rune) rune {
		if r == 0 {
			return -1
		}
		if unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' {
			return -1
		}

		return r
	}, input)

	return strings.TrimSpace(cleaned)
}

// SanitizeValue 返回输入值的递归清洗副本。
// 常见结构、切片、数组和 map 在不修改原值的前提下完成处理。
func SanitizeValue(value any) any {
	if value == nil {
		return nil
	}

	sanitized := sanitizeCopy(reflect.ValueOf(value))
	if !sanitized.IsValid() {
		return nil
	}

	return sanitized.Interface()
}

// sanitizeInPlace 原地清洗 Gin 绑定后的 DTO。
// 空值或无效指针会被安全跳过，避免反射操作触发 panic。
func sanitizeInPlace(value any) {
	if value == nil {
		return
	}

	sanitizeValueInPlace(reflect.ValueOf(value))
}

// sanitizeValueInPlace 通过反射递归清洗可设置字段。
// 该函数服务于请求绑定流程并原地更新字符串内容。
func sanitizeValueInPlace(value reflect.Value) {
	if !value.IsValid() {
		return
	}
	if value.Kind() == reflect.Pointer {
		// 指针字段进入其元素，避免替换整个指针造成调用方引用丢失。
		if value.IsNil() {
			return
		}
		sanitizeValueInPlace(value.Elem())
		return
	}
	if value.Kind() == reflect.Interface {
		// interface 字段优先替换为清洗副本，不可赋值时再深入底层值。
		if value.IsNil() {
			return
		}
		sanitized := sanitizeCopy(value.Elem())
		if sanitized.IsValid() && sanitized.Type().AssignableTo(value.Type()) && value.CanSet() {
			value.Set(sanitized)
			return
		}
		sanitizeValueInPlace(value.Elem())
		return
	}

	switch value.Kind() {
	case reflect.String:
		if value.CanSet() {
			value.SetString(SanitizeString(value.String()))
		}
	case reflect.Struct:
		for i := 0; i < value.NumField(); i++ {
			field := value.Field(i)
			// 跳过不可设置的非结构字段，避免反射 panic。
			if field.CanSet() || field.Kind() == reflect.Pointer || field.Kind() == reflect.Struct {
				sanitizeValueInPlace(field)
			}
		}
	case reflect.Slice:
		for i := 0; i < value.Len(); i++ {
			sanitizeValueInPlace(value.Index(i))
		}
	case reflect.Array:
		for i := 0; i < value.Len(); i++ {
			sanitizeValueInPlace(value.Index(i))
		}
	case reflect.Map:
		if value.IsNil() || !value.CanSet() {
			return
		}
		sanitized := sanitizeCopy(value)
		if sanitized.IsValid() && sanitized.Type().AssignableTo(value.Type()) {
			value.Set(sanitized)
		}
	}
}

// sanitizeCopy 构造清洗后的反射值副本。
// 该实现支持 map key 等不能原地修改的输入位置。
func sanitizeCopy(value reflect.Value) reflect.Value {
	if !value.IsValid() {
		return reflect.Value{}
	}

	switch value.Kind() {
	case reflect.String:
		return reflect.ValueOf(SanitizeString(value.String())).Convert(value.Type())
	case reflect.Pointer:
		if value.IsNil() {
			return reflect.Zero(value.Type())
		}
		sanitizedElem := sanitizeCopy(value.Elem())
		ptr := reflect.New(value.Type().Elem())
		if sanitizedElem.IsValid() && sanitizedElem.Type().AssignableTo(value.Type().Elem()) {
			ptr.Elem().Set(sanitizedElem)
		} else {
			ptr.Elem().Set(value.Elem())
		}
		return ptr
	case reflect.Interface:
		if value.IsNil() {
			return reflect.Zero(value.Type())
		}
		sanitizedElem := sanitizeCopy(value.Elem())
		if sanitizedElem.IsValid() && sanitizedElem.Type().AssignableTo(value.Type()) {
			return sanitizedElem
		}
		if sanitizedElem.IsValid() && sanitizedElem.Type().AssignableTo(value.Elem().Type()) {
			return sanitizedElem
		}
		return value
	case reflect.Struct:
		// 结构体副本只写入可设置字段，未导出字段保持零值以避免越权访问。
		sanitized := reflect.New(value.Type()).Elem()
		for i := 0; i < value.NumField(); i++ {
			sourceField := value.Field(i)
			targetField := sanitized.Field(i)
			if !targetField.CanSet() {
				continue
			}
			sanitizedField := sanitizeCopy(sourceField)
			if sanitizedField.IsValid() && sanitizedField.Type().AssignableTo(targetField.Type()) {
				targetField.Set(sanitizedField)
			} else {
				targetField.Set(sourceField)
			}
		}
		return sanitized
	case reflect.Slice:
		if value.IsNil() {
			return reflect.Zero(value.Type())
		}
		sanitized := reflect.MakeSlice(value.Type(), value.Len(), value.Cap())
		for i := 0; i < value.Len(); i++ {
			sanitizedElem := sanitizeCopy(value.Index(i))
			if sanitizedElem.IsValid() && sanitizedElem.Type().AssignableTo(value.Type().Elem()) {
				sanitized.Index(i).Set(sanitizedElem)
			} else {
				sanitized.Index(i).Set(value.Index(i))
			}
		}
		return sanitized
	case reflect.Array:
		sanitized := reflect.New(value.Type()).Elem()
		for i := 0; i < value.Len(); i++ {
			sanitizedElem := sanitizeCopy(value.Index(i))
			if sanitizedElem.IsValid() && sanitizedElem.Type().AssignableTo(value.Type().Elem()) {
				sanitized.Index(i).Set(sanitizedElem)
			} else {
				sanitized.Index(i).Set(value.Index(i))
			}
		}
		return sanitized
	case reflect.Map:
		if value.IsNil() {
			return reflect.Zero(value.Type())
		}
		// map key 也可能来自外部输入，需要复制到新 map 中统一清洗。
		sanitized := reflect.MakeMapWithSize(value.Type(), value.Len())
		iter := value.MapRange()
		for iter.Next() {
			key := sanitizeCopy(iter.Key())
			item := sanitizeCopy(iter.Value())
			if !key.IsValid() || !key.Type().AssignableTo(value.Type().Key()) {
				key = iter.Key()
			}
			if !item.IsValid() || !item.Type().AssignableTo(value.Type().Elem()) {
				item = iter.Value()
			}
			sanitized.SetMapIndex(key, item)
		}
		return sanitized
	default:
		return value
	}
}
