package security

import (
	"fmt"
	"os/exec"
	"path/filepath"
)

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

func isAllowedCommand(command string, allowedCommands []string) bool {
	for _, allowed := range allowedCommands {
		if command == allowed {
			return true
		}
	}

	return false
}
