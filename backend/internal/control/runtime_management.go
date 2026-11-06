package control

import (
	"context"
	"time"
	"zx-panel/internal/host"
)

// runtimeTargetRequest 从持久安装事实构造 helper 请求，前端不能指定路径。
// 面板目录仍由 helper 根据 ID 推导，外部目标还需核实来源和指纹。
func runtimeTargetRequest(action string, installation Installation) host.Request {
	request := host.Request{Action: action, ID: installation.ID, Kind: installation.Kind}
	if installation.Ownership == "external" {
		request.Executable = installation.Path
	}
	return request
}

// setSystemDefault 提交用户确认的系统入口切换，再广播真实状态变更。
// 指纹变化或 helper 拒绝时不会更改面板默认指针。
func (s *Service) setSystemDefault(ctx context.Context, task *Task, work Work) error {
	installation, err := s.installation(ctx, work.Operation.InstallationID)
	if err != nil {
		return err
	}
	if work.Runtime == nil {
		return Fail(409, "RUNTIME_SOURCE_UNVERIFIED", "缺少已核实的运行时目标")
	}
	if err = s.taskStage(ctx, task, "commit", false, nil, nil); err != nil {
		return err
	}
	commit, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Minute)
	defer cancel()
	request := runtimeTargetRequest("runtime.system-default", installation)
	request.Fingerprint = work.Runtime.Fingerprint
	if _, err = s.Host.Call(commit, request); err != nil {
		return Fail(409, "SYSTEM_DEFAULT_FAILED", "系统入口切换未完成，请核对权限、目标文件和入口冲突后重新预检")
	}
	task.Result = map[string]any{"installationId": installation.ID, "systemDefaultChanged": true}
	return s.Events.Publish("runtime.changed", map[string]string{"kind": installation.Kind})
}
