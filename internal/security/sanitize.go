package security

import (
	"reflect"
	"strings"
	"unicode"
)

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

func sanitizeInPlace(value any) {
	if value == nil {
		return
	}

	sanitizeValueInPlace(reflect.ValueOf(value))
}

func sanitizeValueInPlace(value reflect.Value) {
	if !value.IsValid() {
		return
	}
	if value.Kind() == reflect.Pointer {
		if value.IsNil() {
			return
		}
		sanitizeValueInPlace(value.Elem())
		return
	}
	if value.Kind() == reflect.Interface {
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
