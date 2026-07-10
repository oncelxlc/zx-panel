package security

import (
	"fmt"
	"os/exec"
	"path/filepath"
)

// LookPathAllowed 只允许查找白名单中的固定命令名，避免把用户输入当作命令路径执行。
func LookPathAllowed(command string, allowedCommands ...string) (string, error) {
	if command == "" {
		return "", fmt.Errorf("%w: empty command", ErrInvalidInput)
	}
	if filepath.Base(command) != command {
		return "", fmt.Errorf("%w: command path is not allowed", ErrInvalidInput)
	}
	if !isAllowedCommand(command, allowedCommands) {
		return "", fmt.Errorf("%w: command is not allowed", ErrInvalidInput)
	}

	path, err := exec.LookPath(command)
	if err != nil {
		return "", err
	}

	return path, nil
}

// isAllowedCommand 判断命令名是否位于调用方显式提供的白名单中。
func isAllowedCommand(command string, allowedCommands []string) bool {
	for _, allowed := range allowedCommands {
		if command == allowed {
			return true
		}
	}

	return false
}
