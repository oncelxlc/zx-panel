#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PLANNING_FILES = ['task_plan.md', 'progress.md', 'findings.md'];

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function resolveWorkspace(input) {
  if (input && typeof input.cwd === 'string' && input.cwd) {
    return input.cwd;
  }

  return process.cwd();
}

function removePlanningFiles(workspace) {
  for (const name of PLANNING_FILES) {
    const target = path.join(workspace, name);

    try {
      if (fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
      }
    } catch {
      // Cleanup should stay best-effort and never block Codex from finishing.
    }
  }
}

const input = readHookInput();
const workspace = resolveWorkspace(input);

removePlanningFiles(workspace);

process.stdout.write(JSON.stringify({ continue: true }));
