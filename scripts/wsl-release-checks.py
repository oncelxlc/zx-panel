#!/usr/bin/env python3
"""补充发布验收，仅允许操作带所有权标记的 WSL 专用实验资源。"""
import hashlib
import json
import os
from pathlib import Path
import runpy
import secrets
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.parse

REPO = Path('/mnt/e/Github/zx-panel')
LAB = Path('/opt/zx-panel-lab')
MODULE = runpy.run_path(str(REPO / 'scripts/wsl-lab.py'), run_name='lab_library')
run = MODULE['run']
UNITS = ['zx-panel-lab-postgres', 'zx-panel-lab-helper', 'zx-panel-lab', 'zx-panel-lab-nginx']
OVERRIDE = Path('/run/systemd/system/zx-panel-lab-helper.service.d/90-reference-test.conf')


def installed(api, installation_id):
    """以持久登记重新读取修订，禁止复用默认切换前的修订号。"""
    return next(item for item in api.call('/runtimes/node/installations')['items'] if item['id'] == installation_id)


def preview(api, installation_id):
    """卸载目标只能是 API 产生的安装 ID。"""
    item = installed(api, installation_id)
    return api.call('/operations/preview', {'action': 'runtime.uninstall', 'installationId': item['id'], 'expectedRevision': item['revision']})


def references(api, installation_id, process):
    """等待共享进程采样赶上实际进程变化，不把未知当成空引用。"""
    for _ in range(30):
        result = api.call('/runtime-installations/' + installation_id + '/references')
        if result['complete'] and bool(result['processes']) == process:
            return result
        time.sleep(1)
    raise AssertionError('Process references did not become complete with expected processes')


def require_block(plan, code):
    """核对真实错误语义，不只检查 HTTP 成功或任意失败。"""
    assert not plan['canExecute'] and code in {item['code'] for item in plan['blockedReasons']}, plan['blockedReasons']


def enable_temporary_references():
    """仅在下载/安装完成后为引用检查授予临时能力，缩短权限生效时间。"""
    assert not OVERRIDE.exists()
    OVERRIDE.parent.mkdir(exist_ok=True)
    OVERRIDE.write_text('# zx-panel-lab temporary reference acceptance\n[Service]\nCapabilityBoundingSet=CAP_SYS_PTRACE\nSystemCallFilter=~ptrace process_vm_readv process_vm_writev kcmp\nRuntimeMaxSec=15min\nRestart=no\n')
    OVERRIDE.chmod(0o644)
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'restart', 'zx-panel-lab-helper'])
    return check_reference_helper()


def check_reference_helper():
    """核对运行中的 helper 身份、能力和过滤，不把 Type=simple 的返回当成就绪。"""
    observations = []
    for _ in range(30):
        # Type=simple 在 exec 前返回；必须等真实二进制、能力、seccomp 和 Socket 就绪。
        pid = run(['systemctl', 'show', 'zx-panel-lab-helper', '-p', 'MainPID', '--value'])
        status = dict(line.split(':', 1) for line in Path('/proc/' + pid + '/status').read_text().splitlines() if ':' in line)
        executable = os.readlink('/proc/' + pid + '/exe')
        observations.append({'executable': executable, 'capEffective': status['CapEff'].strip(), 'seccomp': int(status['Seccomp'])})
        if executable == str(LAB / 'bin/zx-panel-helper') and int(status['CapEff'], 16) & (1 << 19) and status['Seccomp'].strip() == '2' and Path('/run/zx-panel-lab-helper/control.sock').is_socket():
            break
        time.sleep(1)
    else:
        raise AssertionError('Helper did not reach required privilege/filter state: ' + str(observations[-1]))
    assert MODULE['helper_as']('zx-lab-web', {'action': 'probe', 'id': ''})['ok']
    filters = run(['systemctl', 'show', 'zx-panel-lab-helper', '-p', 'SystemCallFilter', '--value'])
    assert all(name in filters for name in ['ptrace', 'process_vm_readv', 'process_vm_writev', 'kcmp'])
    return {'firstObservation': observations[0], 'readyObservation': observations[-1], 'observations': len(observations)}


def uninstall(api, report, resume=None, deployment=False):
    """真实官方安装和卸载，覆盖默认/配置/进程以及预检后的引用竞争。"""
    original = next(item for item in api.call('/runtimes/node/installations')['items'] if item['isPanelDefault'])
    assert original['ownership'] == 'panel'
    old_apps = {item['id']: item['execution'] for item in api.call('/apps')['items']}
    if resume is None:
        versions = {item['version'] for item in api.call('/runtimes/node/installations')['items']}
        catalog = api.call('/runtimes/node/releases')
        if not catalog['items']:
            api.wait(api.call('/runtimes/catalog/refresh', {'kinds': ['node']}, key=secrets.token_hex(24)))
            catalog = api.call('/runtimes/node/releases')
        release = next(item for item in catalog['items'] if item['version'] not in versions)
        task = api.operation({'action': 'runtime.install', 'releaseId': release['id'], 'makeDefault': False})
        candidate = installed(api, task['result']['installationId'])
    else:
        # 仅复用本脚本失败报告中的新装版本，不接受调用者指定任意既有安装。
        candidate = installed(api, resume['id'])
        assert candidate['ownership'] == 'panel' and not candidate['isPanelDefault'] and candidate['version'] == resume['version']
        report['installationResumedFromFailedCheck'] = True
    candidate_id = candidate['id']
    path = Path(candidate['path'])
    assert path.resolve().parent == (LAB / 'runtimes/node').resolve() and path.name == candidate_id
    report['installation'] = {'id': candidate_id, 'version': candidate['version']}
    report['checks'].append('new official installation preserves existing default and app bindings')
    assert installed(api, original['id'])['isPanelDefault']
    assert old_apps == {item['id']: item['execution'] for item in api.call('/apps')['items']}
    report['helper'] = check_reference_helper() if deployment else enable_temporary_references()
    process = None
    app_id = None
    try:
        api.operation({'action': 'runtime.set-default', 'installationId': candidate_id, 'expectedRevision': candidate['revision']})
        require_block(preview(api, candidate_id), 'DEFAULT_IN_USE')
        previous = installed(api, original['id'])
        api.operation({'action': 'runtime.set-default', 'installationId': previous['id'], 'expectedRevision': previous['revision']})
        directory = LAB / 'apps/node demo %n'
        draft = {'name': 'lab-reference-' + secrets.token_hex(4), 'workingDirectory': str(directory), 'runAsUser': 'zx-lab-app', 'restartPolicy': 'no', 'execution': {'kind': 'node', 'args': [], 'runtimeInstallationId': candidate_id, 'entryFile': 'server.js'}}
        task = api.operation({'action': 'app.create', 'app': draft, 'environmentChanges': []})
        app_id = task['result']['appId']
        api.wait_app(app_id, 'stopped')
        require_block(preview(api, candidate_id), 'RUNTIME_IN_USE')
        assert references(api, candidate_id, False)['apps']
        api.app_action(app_id, 'delete')
        app_id = None
        assert (directory / 'server.js').is_file()
        report['checks'] += ['default runtime uninstall denied', 'stopped app configuration reference denies uninstall']
        plan = preview(api, candidate_id)
        assert plan['canExecute']
        process = subprocess.Popen(['runuser', '-u', 'zx-lab-app', '--', str(path / 'bin/node'), '-e', 'setInterval(() => {}, 1000)'], env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin'}, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        refs = references(api, candidate_id, True)
        assert not refs['apps']
        report['observedPids'] = [item['pid'] for item in refs['processes']]
        require_block(preview(api, candidate_id), 'RUNTIME_IN_USE')
        denied = MODULE['helper_as']('zx-lab-web', {'action': 'runtime.remove', 'kind': 'node', 'id': candidate_id})
        assert denied['code'] == 'HOST_ACTION_FAILED' and path.is_dir()
        try:
            api.call('/operations', {'planId': plan['id'], 'confirmationText': plan['confirmationText']}, key=secrets.token_hex(24))
        except RuntimeError as error:
            assert 'HTTP 409 RUNTIME_IN_USE' in str(error)
        else:
            raise AssertionError('A new process reference did not invalidate acceptance')
        report['checks'] += ['complete cross-user process references', 'process-only reference denies preflight and helper removal', 'new process after preview denies durable acceptance']
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=10)
        process = None
        references(api, candidate_id, False)
        candidate = installed(api, candidate_id)
        task = api.operation({'action': 'runtime.uninstall', 'installationId': candidate_id, 'expectedRevision': candidate['revision']})
        assert task['result']['directoryRemoved'] and task['result']['registrationRemoved']
        assert not path.exists()
        assert candidate_id not in {item['id'] for item in api.call('/runtimes/node/installations')['items']}
        assert installed(api, original['id'])['isPanelDefault'] and Path(original['path']).is_dir()
        assert old_apps == {item['id']: item['execution'] for item in api.call('/apps')['items']}
        report['uninstallTaskId'] = task['id']
        report['checks'].append('successful uninstall removes only tested runtime directory and registration')
    finally:
        if process is not None and process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
        if app_id is not None:
            api.app_action(app_id, 'delete')
        previous = installed(api, original['id'])
        if not previous['isPanelDefault']:
            api.operation({'action': 'runtime.set-default', 'installationId': previous['id'], 'expectedRevision': previous['revision']})


def export_limit(api, report):
    """由真实 systemd 应用输出超过 50 MiB 日志，核实拒绝与临时文件清理。"""
    node = next(item for item in api.call('/runtimes/node/installations')['items'] if item['isPanelDefault'])
    directory = LAB / 'apps' / ('export-limit-' + secrets.token_hex(4))
    assert shutil.disk_usage(LAB).free > 1 << 30
    directory.mkdir(mode=0o755)
    (directory / 'server.js').write_text("const { once } = require('node:events');\nasync function main() {\n  const payload = 'x'.repeat(10000);\n  for (let i=0; i<6000; i++) {\n    if (!process.stdout.write('export-limit-' + i + ' ' + payload + '\\n')) await once(process.stdout, 'drain');\n  }\n  console.log('export-small-marker');\n  console.log('export-limit-finished');\n  setInterval(() => {}, 1000);\n}\nmain().catch(() => process.exit(1));\n")
    (directory / 'server.js').chmod(0o644)
    draft = {'name': directory.name, 'workingDirectory': str(directory), 'runAsUser': 'zx-lab-app', 'restartPolicy': 'no', 'execution': {'kind': 'node', 'args': [], 'runtimeInstallationId': node['id'], 'entryFile': 'server.js'}}
    task = api.operation({'action': 'app.create', 'app': draft, 'environmentChanges': []})
    app_id = task['result']['appId']
    # 用服务端任务时间界定新来源；结束时间由后端受理导出时冻结。
    started = task['createdAt']
    try:
        api.app_action(app_id, 'start')
        filters = {'sourceId': 'app:' + app_id, 'level': 'all', 'search': 'export-limit-finished', 'from': started, 'to': ''}
        for _ in range(90):
            request_url = MODULE['ORIGIN'] + '/api/v1/logs?' + urllib.parse.urlencode(filters)
            try:
                with api.client.open(request_url) as response:
                    result = json.load(response)
            except urllib.error.HTTPError as error:
                result = json.load(error)
                raise AssertionError('Log filter rejected: ' + str(result.get('error'))) from None
            if result['data']['items']:
                break
            time.sleep(1)
        else:
            raise AssertionError('Journal did not receive the bounded producer completion marker')
        filters['search'] = 'export-small-marker'
        small = api.wait(api.call('/logs/exports', filters, key=secrets.token_hex(24)))
        assert 0 < small['result']['bytes'] < 1024
        filters['search'] = 'export-limit-'
        large = api.call('/logs/exports', filters, key=secrets.token_hex(24))
        for _ in range(120):
            large = api.call('/tasks/' + large['id'])
            if large['status'] in ['succeeded', 'failed', 'canceled', 'interrupted']:
                break
            time.sleep(1)
        assert large['status'] == 'failed' and large['error']['code'] == 'EXPORT_TOO_LARGE', large.get('error')
        assert not (Path('/var/lib/zx-panel-lab/exports') / (large['id'] + '.log')).exists()
        try:
            api.client.open(MODULE['ORIGIN'] + '/api/v1/logs/exports/' + large['id'] + '/download')
        except urllib.error.HTTPError as error:
            assert error.code == 404
        else:
            raise AssertionError('Failed export remained downloadable')
        report.update({'appId': app_id, 'producerMinimumBytes': 6000 * 10000, 'limitBytes': 50 << 20, 'smallExportBytes': small['result']['bytes'], 'failedTaskId': large['id'], 'failureCode': large['error']['code']})
        report['checks'] += ['real journald producer exceeds 50 MiB', 'filtered small export succeeds', 'oversize export fails with EXPORT_TOO_LARGE', 'failed export file removed and download denied']
    finally:
        api.app_action(app_id, 'stop')
        api.app_action(app_id, 'delete')
        assert (directory / 'server.js').is_file()


def main():
    """正式模板复验也只操作实验单元，任何正常退出都恢复原单元和能力集。"""
    assert len(sys.argv) in [2, 3] and sys.argv[1] in ['uninstall', 'export', 'deployment'] and os.geteuid() == 0
    assert len(sys.argv) == 2 or sys.argv[1] != 'export' and sys.argv[2] == '--resume-installation'
    assert MODULE['ARCH'] in ['amd64', 'arm64']
    action = sys.argv[1]
    assert (LAB / '.zx-panel-lab').is_file() and not LAB.is_symlink()
    assert not OVERRIDE.exists() and not OVERRIDE.parent.is_symlink()
    for name in UNITS:
        assert Path('/etc/systemd/system/' + name + '.service').read_text().startswith('# zx-panel-lab owned\n')
        assert subprocess.run(['systemctl', 'is-active', '--quiet', name], capture_output=True).returncode != 0
    originals = {name: Path('/etc/systemd/system/' + name + '.service').read_text() for name in ['zx-panel-lab', 'zx-panel-lab-helper']}
    original_capabilities = run(['systemctl', 'show', 'zx-panel-lab-helper', '-p', 'CapabilityBoundingSet', '--value']).split()
    report = {'environment': os.uname().machine + ' / ' + os.uname().release, 'checks': [], 'temporaryCapability': 'CAP_SYS_PTRACE' if action == 'uninstall' else None, 'persistentUnitChanged': False, 'deploymentTemplateApplied': action == 'deployment'}
    resume = None
    if len(sys.argv) == 3:
        previous = json.loads((LAB / ('reports/' + action + '.json')).read_text())
        assert not previous.get('passed') and previous['environment'] == report['environment'] and previous['temporaryCapabilityRemoved'] and previous['servicesStopped']
        resume = previous['installation']
    api = None
    try:
        if action == 'deployment':
            # 复用正式模板的已有路径/账号映射；不增加额外能力或实验过滤覆盖。
            MODULE['units']()
            report['deploymentTemplateSha256'] = hashlib.sha256((REPO / 'deploy/zx-panel-helper.service').read_bytes()).hexdigest()
        for name in ['zx-panel', 'zx-panel-helper']:
            shutil.copyfile(REPO / ('release/linux-' + MODULE['ARCH']) / name, LAB / 'bin' / name)
            (LAB / 'bin' / name).chmod(0o755)
        report['binariesSha256'] = {name: hashlib.sha256((LAB / 'bin' / name).read_bytes()).hexdigest() for name in ['zx-panel', 'zx-panel-helper']}
        run(['systemctl', 'daemon-reload'])
        for name in UNITS:
            run(['systemctl', 'start', name])
        for _ in range(30):
            try:
                api = MODULE['login']()
                break
            except (RuntimeError, OSError):
                time.sleep(1)
        assert api is not None
        if action in ['uninstall', 'deployment']:
            uninstall(api, report, resume, deployment=action == 'deployment')
        else:
            export_limit(api, report)
        report['passed'] = True
    finally:
        # 先停止有临时能力的进程，再删除本脚本拥有的覆盖；不覆盖其他 drop-in。
        run(['systemctl', 'stop', 'zx-panel-lab-helper'])
        if OVERRIDE.exists():
            assert OVERRIDE.read_text().startswith('# zx-panel-lab temporary reference acceptance\n')
            OVERRIDE.unlink()
        if OVERRIDE.parent.exists() and not list(OVERRIDE.parent.iterdir()):
            OVERRIDE.parent.rmdir()
        for name in reversed(UNITS):
            run(['systemctl', 'stop', name])
        if action == 'deployment':
            for name, body in originals.items():
                MODULE['save'](Path('/etc/systemd/system/' + name + '.service'), body, 0o644)
        run(['systemctl', 'daemon-reload'])
        capabilities = run(['systemctl', 'show', 'zx-panel-lab-helper', '-p', 'CapabilityBoundingSet', '--value']).split()
        assert sorted(capabilities) == sorted(original_capabilities)
        report['labUnitsRestored'] = all(Path('/etc/systemd/system/' + name + '.service').read_text() == body for name, body in originals.items())
        assert report['labUnitsRestored']
        report['restoredCapabilities'] = capabilities
        report['temporaryCapabilityRemoved'] = not OVERRIDE.exists()
        report['servicesStopped'] = True
        (LAB / ('reports/' + action + '.json')).write_text(json.dumps(report, indent=2) + '\n')
        print('Original lab units and capabilities restored; dedicated services stopped.', flush=True)
    print(action + ' acceptance passed.', flush=True)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    main()
