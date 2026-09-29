package control

import (
	"context"
	"testing"
)

// TestEventReplayAndBackpressure 验证重放边界、epoch 与慢订阅者隔离。
// 有界队列不会为保持假完整性而无限增长。
func TestEventReplayAndBackpressure(t *testing.T) {
	h, err := NewEventHub()
	if err != nil {
		t.Fatal(err)
	}
	cursor, _ := h.Cursor()
	if err = h.Publish("task.updated", map[string]int{"revision": 1}); err != nil {
		t.Fatal(err)
	}
	sub, replay, reset, err := h.Subscribe(cursor, 1)
	if err != nil || reset || len(replay) != 1 {
		t.Fatalf("unexpected replay %v %v %v", replay, reset, err)
	}
	defer sub.Close()
	bad, _, reset, _ := h.Subscribe("other:1", 2)
	defer bad.Close()
	if !reset {
		t.Fatal("old epoch did not reset")
	}
	for i := 0; i < 260; i++ {
		if err := h.Publish("metrics.sample", i); err != nil {
			t.Fatal(err)
		}
	}
	n := 0
	for {
		_, ok := sub.Next(context.Background())
		if !ok {
			break
		}
		n++
	}
	if n != 0 {
		t.Fatalf("queue bound=%d", n)
	}
}
