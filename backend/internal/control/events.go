package control

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// EventHub 保存有界重放窗口并隔离慢订阅者。
// 发布只进行内存排队，不等待网络写入。
type EventHub struct {
	mu          sync.Mutex
	epoch       string
	sequence    uint64
	events      []Event
	bytes       int
	subscribers map[*Subscription]bool
}

// Subscription 保存单个流的有界队列与认证主体。
// 队列超限或会话撤销会关闭连接，客户端必须重新同步。
type Subscription struct {
	hub    *EventHub
	queue  chan Event
	bytes  int
	actor  int64
	closed bool
}

// NewEventHub 为本服务实例生成独立 epoch。
// epoch 与操作系统 bootId 没有替代关系。
func NewEventHub() (*EventHub, error) {
	epoch, err := ID()
	if err != nil {
		return nil, err
	}
	return &EventHub{epoch: epoch, subscribers: map[*Subscription]bool{}}, nil
}

// Cursor 在锁内捕获 bootstrap 使用的事件边界。
// 调用后收集快照期间发布的事件仍在重放窗口内。
func (h *EventHub) Cursor() (string, string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return fmt.Sprintf("%s:%d", h.epoch, h.sequence), h.epoch
}

// Publish 序列化不可变事件并裁剪数量、时间和字节预算。
// 慢客户端不会阻塞采集或任务提交。
func (h *EventHub) Publish(name string, payload any) error {
	return h.PublishForActor(name, payload, 0)
}

// PublishForActor 将仅属于某操作人的事件隔离到对应订阅。
// actor 为零的指标和公共资源变更才广播给所有已授权连接。
func (h *EventHub) PublishForActor(name string, payload any, actor int64) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if len(body) > 1<<20 {
		return fmt.Errorf("event exceeds size limit")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sequence++
	event := Event{ID: fmt.Sprintf("%s:%d", h.epoch, h.sequence), Name: name, Actor: actor, StreamEpoch: h.epoch, Payload: body, At: time.Now()}
	h.events = append(h.events, event)
	h.bytes += len(body)
	for len(h.events) > 0 && (len(h.events) > 10000 || h.bytes > 16<<20 || time.Since(h.events[0].At) > 10*time.Minute) {
		h.bytes -= len(h.events[0].Payload)
		h.events[0] = Event{}
		h.events = h.events[1:]
	}
	for sub := range h.subscribers {
		if actor != 0 && sub.actor != actor {
			continue
		}
		if sub.bytes+len(body) > 1<<20 || len(sub.queue) == cap(sub.queue) {
			delete(h.subscribers, sub)
			sub.closed = true
			close(sub.queue)
			continue
		}
		sub.bytes += len(body)
		sub.queue <- event
	}
	return nil
}

// Subscribe 原子订阅快照之后的变更并返回需要先写出的历史。
// 游标不在当前窗口时返回 reset，不假装无损续传。
func (h *EventHub) Subscribe(after string, actor int64) (*Subscription, []Event, bool, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	count := 0
	for sub := range h.subscribers {
		if sub.actor == actor {
			count++
		}
	}
	if count >= 8 {
		return nil, nil, false, Fail(429, "RATE_LIMITED", "当前账号的实时连接过多")
	}
	sub := &Subscription{hub: h, queue: make(chan Event, 256), actor: actor}
	h.subscribers[sub] = true
	history := []Event{}
	if after == "" {
		return sub, history, false, nil
	}
	parts := strings.Split(after, ":")
	if len(parts) != 2 || parts[0] != h.epoch {
		return sub, history, true, nil
	}
	n, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil || n > h.sequence {
		return sub, history, true, nil
	}
	first := h.sequence + 1
	if len(h.events) > 0 {
		first = h.sequence - uint64(len(h.events)) + 1
	}
	if n+1 < first {
		return sub, history, true, nil
	}
	for i, event := range h.events {
		if first+uint64(i) > n && (event.Actor == 0 || event.Actor == actor) {
			history = append(history, event)
		}
	}
	return sub, history, false, nil
}

// Next 在取消、撤销或队列关闭时终止订阅。
// 消费时同步扣除队列字节预算。
func (s *Subscription) Next(ctx context.Context) (Event, bool) {
	select {
	case <-ctx.Done():
		return Event{}, false
	case event, ok := <-s.queue:
		if ok {
			s.hub.mu.Lock()
			s.bytes -= len(event.Payload)
			ok = !s.closed
			s.hub.mu.Unlock()
		}
		return event, ok
	}
}

// Close 幂等移除订阅，释放队列和连接配额。
// HTTP handler 必须 defer 调用。
func (s *Subscription) Close() {
	s.hub.mu.Lock()
	defer s.hub.mu.Unlock()
	if s.hub.subscribers[s] {
		delete(s.hub.subscribers, s)
		s.closed = true
		close(s.queue)
	}
}

// Active 允许重放写出前检查撤销，不泄露已复制的历史缓冲。
// HTTP handler 必须在每批敏感数据前核对。
func (s *Subscription) Active() bool { s.hub.mu.Lock(); defer s.hub.mu.Unlock(); return !s.closed }

// Revoke 主动关闭某个账号的所有已有流。
// 注销、改密和权限撤销后不得继续读取。
func (h *EventHub) Revoke(actor int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for sub := range h.subscribers {
		if sub.actor == actor {
			delete(h.subscribers, sub)
			sub.closed = true
			close(sub.queue)
		}
	}
}

// Close 终止实例所有订阅，用于服务排空。
// 事件重放窗口不承诺跨进程保留。
func (h *EventHub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for sub := range h.subscribers {
		delete(h.subscribers, sub)
		sub.closed = true
		close(sub.queue)
	}
}
