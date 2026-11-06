package security

import (
	"strings"
	"testing"
)

// TestStrictJSON 检查常见绕过与秘密内容的无损解码。
// false 是合法值，而字段是否必填继续由业务层判断。
func TestStrictJSON(t *testing.T) {
	type input struct {
		Password    string   `json:"password"`
		MakeDefault *bool    `json:"makeDefault"`
		Args        []string `json:"args"`
	}
	for _, body := range []string{"", `null`, `[]`, `{} {}`, `{"Password":"x"}`, `{"password":"a","password":"b"}`, `{"host":"remote"}`, `{"password":"\ud800"}`, `{"password":"\udc00"}`, "{\"password\":\"\xff\"}", `{"password":` + strings.Repeat("[", 65) + strings.Repeat("]", 65) + `}`} {
		var got input
		if DecodeBytes([]byte(body), &got) == nil {
			t.Errorf("accepted %s", body)
		}
	}
	for _, body := range []string{`{"password":"\ud83d\ude00"}`, `{"password":"\\ud800"}`} {
		var got input
		if err := DecodeBytes([]byte(body), &got); err != nil {
			t.Fatal("valid Unicode rejected", err)
		}
	}
	var got input
	for _, body := range []string{`{"password":null}`, `{"args":null}`, `{"args":[null]}`} {
		if DecodeBytes([]byte(body), &got) == nil {
			t.Fatal("null was coerced into a non-nullable field")
		}
	}
	if err := DecodeBytes([]byte(`{"args":[""],"makeDefault":null}`), &got); err != nil || len(got.Args) != 1 || got.Args[0] != "" || got.MakeDefault != nil {
		t.Fatal("explicit empty argument or nullable pointer rejected", err)
	}
	if err := DecodeBytes([]byte("{\"password\":\"  a;$()\\n  \",\"makeDefault\":false}"), &got); err != nil {
		t.Fatal(err)
	}
	if got.Password != "  a;$()\n  " || got.MakeDefault == nil || *got.MakeDefault {
		t.Fatalf("input changed: %#v", got)
	}
}
