package server

// Version 通过正式构建 ldflags 注入，不依赖主机 Node/Go CLI。
// 开发构建使用可辨识的开发版本。
var Version = "1.1.0-dev"

// Commit 记录发布所用源码修订，未注入时不伪造 Git 信息。
// 用户未要求提交时保持 unknown。
var Commit = "unknown"

// BuildTime 使用发布脚本记录 UTC 构建时间。
// 不在进程启动时改写成虚假的构建时间。
var BuildTime = "unknown"
