#!/usr/bin/env python3
"""在专用 WSL 实验资源上验收真实发布包；不读取原项目 .env。"""
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import tarfile
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timedelta, timezone
import io
import re
import threading

LAB = Path('/opt/zx-panel-lab')
ETC = Path('/etc/zx-panel-lab')
REPO = Path('/mnt/e/Github/zx-panel')
ORIGIN = 'https://127.0.0.1:27443'
ARCH = {'x86_64': 'amd64', 'aarch64': 'arm64'}[os.uname().machine]


def run(args, **kwargs):
    """所有命令使用参数数组，默认捕获输出避免秘密进入控制台。"""
    return subprocess.run(args, check=True, text=True, capture_output=True, **kwargs).stdout.strip()


def save(path, body, mode=0o600):
    """实验配置使用明确权限，秘密仅写受控文件。"""
    if path.parent == Path('/etc/systemd/system'):
        assert path.name.startswith('zx-panel-lab') and not path.is_symlink()
        assert not path.exists() or path.read_text().startswith('# zx-panel-lab owned\n')
    path.write_text(body, encoding='utf-8')
    path.chmod(mode)


def prepare():
    """安装专用数据库、TLS 代理和两个 systemd 单元，运行时工具仅位于实验目录。"""
    assert os.geteuid() == 0 and (LAB / '.zx-panel-lab').is_file()
    ETC.chmod(0o755)
    env = ETC / 'database.env'
    if not env.exists():
        password = secrets.token_hex(32)
        save(env, f'DATABASE_URL=postgres://zx_lab:{password}@127.0.0.1:25433/zx_panel_lab?sslmode=disable\n')
        save(ETC / 'postgres.password', password + '\n')
    os.environ['DATABASE_URL'] = env.read_text().strip().split('=', 1)[1]
    db_owner = pwd.getpwnam('zx-lab-db')
    os.chown(ETC / 'postgres.password', db_owner.pw_uid, db_owner.pw_gid)
    pgdata = LAB / 'postgres'
    pgdata.mkdir(exist_ok=True, mode=0o700)
    os.chown(pgdata, db_owner.pw_uid, db_owner.pw_gid)
    if not (pgdata / 'PG_VERSION').exists():
        run(['runuser', '-u', 'zx-lab-db', '--', '/usr/lib/postgresql/16/bin/initdb', '-D', str(pgdata), '-U', 'zx_lab', '--auth-host=scram-sha-256', '--auth-local=trust', '--pwfile=' + str(ETC / 'postgres.password')])
    save(Path('/etc/systemd/system/zx-panel-lab-postgres.service'), '# zx-panel-lab owned\n[Unit]\nDescription=Isolated zx-panel acceptance PostgreSQL\n[Service]\nUser=zx-lab-db\nGroup=zx-lab-db\nRuntimeDirectory=zx-panel-lab-postgres\nRuntimeDirectoryMode=0700\nExecStart=/usr/lib/postgresql/16/bin/postgres -D /opt/zx-panel-lab/postgres -p 25433 -h 127.0.0.1 -k /run/zx-panel-lab-postgres\nTimeoutStopSec=60\nKillSignal=SIGINT\n', 0o644)
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'start', 'zx-panel-lab-postgres.service'])
    for _ in range(60):
        ready = subprocess.run(['pg_isready', '-h', '127.0.0.1', '-p', '25433'], capture_output=True)
        if ready.returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Isolated PostgreSQL did not become ready')
    pg = ['runuser', '-u', 'zx-lab-db', '--', 'psql', '-h', '/run/zx-panel-lab-postgres', '-p', '25433', '-U', 'zx_lab']
    if run([*pg, '-d', 'postgres', '-Atc', "SELECT count(*) FROM pg_database WHERE datname='zx_panel_lab'"]) == '0':
        run([*pg, '-d', 'postgres', '-c', 'CREATE DATABASE zx_panel_lab'])
    assert run([*pg, '-d', 'zx_panel_lab', '-Atc', 'SELECT current_database()']) == 'zx_panel_lab'
    uid = pwd.getpwnam('zx-lab-web').pw_uid
    gid = pwd.getpwnam('zx-lab-web').pw_gid
    for path in ['staging', 'cache/artifacts', 'exports']:
        directory = Path('/var/lib/zx-panel-lab') / path
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chown(directory, uid, gid)
    cache = Path('/var/lib/zx-panel-lab/cache')
    os.chown(cache, uid, gid)
    Path('/etc/zx-panel/apps').mkdir(parents=True, exist_ok=True, mode=0o755)
    cfg = {
        'mode': 'production',
        'http': {'listen': '127.0.0.1:25001', 'publicOrigin': 'https://127.0.0.1:27443', 'allowedHosts': ['127.0.0.1:27443'], 'trustedProxies': ['127.0.0.1'], 'cookieSecure': True},
        'paths': {'dataRoot': '/var/lib/zx-panel-lab', 'runtimeRoot': str(LAB / 'runtimes'), 'stagingRoot': '/var/lib/zx-panel-lab/staging', 'artifactCacheRoot': '/var/lib/zx-panel-lab/cache/artifacts', 'exportRoot': '/var/lib/zx-panel-lab/exports', 'appRoots': [str(LAB / 'apps')], 'secretKeyFile': str(ETC / 'keys/app-secrets.key')},
        'privileged': {'enabled': True, 'socketPath': '/run/zx-panel-lab-helper/control.sock', 'panelUid': uid, 'serviceAccounts': ['zx-lab-app']}, 'logLevel': 'info',
    }
    save(ETC / 'config.json', json.dumps(cfg, indent=2) + '\n', 0o644)
    for name in ['zx-panel', 'zx-panel-helper']:
        shutil.copyfile(REPO / ('release/linux-' + ARCH) / name, LAB / 'bin' / name)
        (LAB / 'bin' / name).chmod(0o755)
    server = str(LAB / 'bin/zx-panel')
    flags = ['--config', str(ETC / 'config.json')]
    run([server, 'check-config', *flags])
    schema = subprocess.run([server, 'migrate', 'status', *flags], capture_output=True)
    if schema.returncode:
        run([server, 'migrate', 'up', *flags])
    if not (ETC / 'keys/app-secrets.key').exists():
        run(['runuser', '-u', 'zx-lab-web', '--', server, 'init-key', *flags])
    if not (ETC / 'setup-token').exists():
        output = run([server, 'setup-token', *flags])
        save(ETC / 'setup-token', output.splitlines()[-1] + '\n')
    units()
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'start', 'zx-panel-lab-helper.service', 'zx-panel-lab.service'])
    if not (ETC / 'tls.key').exists():
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(ETC / 'tls.key'), '-out', str(ETC / 'tls.crt'), '-days', '7', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'])
        (ETC / 'tls.key').chmod(0o600)
    proxy = (REPO / 'deploy/nginx.conf').read_text().replace('127.0.0.1:25000', '127.0.0.1:25001')
    save(ETC / 'nginx.conf', 'pid /run/zx-panel-lab-nginx/nginx.pid;\nerror_log stderr;\nevents {}\nhttp { access_log off; server { listen 127.0.0.1:27443 ssl; ssl_certificate /etc/zx-panel-lab/tls.crt; ssl_certificate_key /etc/zx-panel-lab/tls.key;\n' + proxy + '\n} }\n', 0o644)
    save(Path('/etc/systemd/system/zx-panel-lab-nginx.service'), '# zx-panel-lab owned\n[Unit]\nDescription=Isolated zx-panel acceptance TLS proxy\n[Service]\nRuntimeDirectory=zx-panel-lab-nginx\nExecStart=/usr/sbin/nginx -c /etc/zx-panel-lab/nginx.conf -g "daemon off;"\n', 0o644)
    run(['systemctl', 'daemon-reload'])
    run(['systemctl', 'start', 'zx-panel-lab-nginx.service'])
    no_cli = run(['runuser', '-u', 'zx-lab-web', '--', '/bin/sh', '-c', 'command -v node || true; command -v go || true'])
    assert not no_cli, 'System Node/Go unexpectedly present'
    print('Isolated PostgreSQL, production server/helper and HTTPS proxy started without system Node/Go.', flush=True)
    if not (LAB / 'tools/go/bin/go').exists():
        with urllib.request.urlopen('https://go.dev/dl/?mode=json&include=all', timeout=60) as response:
            releases = json.load(response)
        entry = next(file for release in releases if release['version'] == 'go1.27.1' for file in release['files'] if file['os'] == 'linux' and file['arch'] == ARCH and file['kind'] == 'archive')
        archive = LAB / 'tools/go.tar.gz'
        digest = hashlib.sha256()
        with urllib.request.urlopen('https://dl.google.com/go/' + entry['filename'], timeout=120) as response, archive.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                output.write(chunk)
        assert digest.hexdigest() == entry['sha256'], 'Official Go checksum mismatch'
        with tarfile.open(archive) as package:
            package.extractall(LAB / 'tools', filter='data')
        archive.unlink()
    print(run([str(LAB / 'tools/go/bin/go'), 'version']), flush=True)


def units():
    """从交付单元生成隔离实例，拒绝覆盖不属于实验的同名文件。"""
    replacements = {'/opt/zx-panel/zx-panel': str(LAB / 'bin/zx-panel'), '/etc/zx-panel/config.json': str(ETC / 'config.json'), '/etc/zx-panel/database.env': str(ETC / 'database.env'), '/var/lib/zx-panel': '/var/lib/zx-panel-lab', '/opt/zx-panel/runtimes': str(LAB / 'runtimes'), '/srv/zx-apps': str(LAB / 'apps'), '/run/zx-panel-helper': '/run/zx-panel-lab-helper', 'RuntimeDirectory=zx-panel-helper': 'RuntimeDirectory=zx-panel-lab-helper', 'User=zx-panel': 'User=zx-lab-web', 'Group=zx-panel': 'Group=zx-lab-web', 'zx-panel-helper.service': 'zx-panel-lab-helper.service'}
    for source, name in [('zx-panel.service', 'zx-panel-lab.service'), ('zx-panel-helper.service', 'zx-panel-lab-helper.service')]:
        target = Path('/etc/systemd/system') / name
        assert not target.exists() or target.read_text().startswith('# zx-panel-lab owned\n')
        unit = (REPO / 'deploy' / source).read_text()
        for old, new in replacements.items():
            unit = unit.replace(old, new)
        if name == 'zx-panel-lab.service':
            unit = unit.replace('ReadOnlyPaths=', f'Environment=PATH=/usr/sbin:/usr/bin:/sbin:/bin\nEnvironment=ZX_PANEL_LOG_LEVEL=debug\nReadOnlyPaths={ETC} ')
        save(target, '# zx-panel-lab owned\n' + unit, 0o644)


class API:
    """通过真实 HTTPS Cookie/CSRF API 操作，不直接改写业务状态。"""
    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()
        self.client = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(ETC / 'tls.crt'))), urllib.request.HTTPCookieProcessor(self.cookies))
        self.csrf = self.call('/auth/session')['csrfToken']

    def call(self, path, body=None, method=None, key=None):
        headers = {'Origin': ORIGIN}
        if body is not None:
            headers.update({'Content-Type': 'application/json', 'X-CSRF-Token': self.csrf})
        if key:
            headers['Idempotency-Key'] = key
        request = urllib.request.Request(ORIGIN + '/api/v1' + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
        try:
            with self.client.open(request, timeout=90) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            try:
                result = json.load(error)
            except ValueError:
                raise RuntimeError(f'{path}: HTTP {error.code}, proxy not ready') from None
            detail = result.get('error', {})
            raise RuntimeError(f'{path}: HTTP {error.code} {detail.get("code")} {detail.get("message", "")}') from None
        assert result['success'] and result['meta']['requestId']
        return result['data']

    def wait(self, task, timeout=900):
        deadline = time.monotonic() + timeout
        previous = None
        while time.monotonic() < deadline:
            task = self.call('/tasks/' + task['id'])
            state = (task['status'], task.get('stage'))
            if state != previous:
                print(f'Task {task["action"]}: {state}', flush=True)
                previous = state
            if task['status'] in ['succeeded', 'failed', 'canceled', 'interrupted']:
                assert task['status'] == 'succeeded', f'Task failed: {task.get("error")} {task.get("result")}'
                return task
            time.sleep(1)
        raise RuntimeError('Task deadline exceeded')

    def operation(self, body):
        plan = self.call('/operations/preview', body)
        assert plan['canExecute'], f'Preflight blocked: {plan["blockedReasons"]}'
        task = self.call('/operations', {'planId': plan['id'], 'confirmationText': plan['confirmationText']}, key=secrets.token_hex(24))
        return self.wait(task)

    def app_action(self, app_id, action):
        app = self.call('/apps/' + app_id)
        return self.operation({'action': 'app.' + action, 'appId': app_id, 'expectedRevision': app['revision']})

    def wait_app(self, app_id, status, metrics=False):
        """等待共享采集器的真实快照；unknown/预热不替换成预期状态。"""
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            app = self.call('/apps/' + app_id)
            if app['status'] == status and (not metrics or app['memoryBytes'] is not None and app['memoryBytes'] > 0 and app['cpuUsagePercent'] is not None):
                return app
            time.sleep(1)
        raise AssertionError('Application observation did not reach ' + status)


def login():
    """实验凭据仅保存在 root 文件中；既有实验账号不重复初始化。"""
    api = API()
    credentials = ETC / 'credentials.json'
    if not credentials.exists():
        save(credentials, json.dumps({'username': 'lab.admin', 'password': secrets.token_urlsafe(30)}))
    identity = json.loads(credentials.read_text())
    if api.call('/setup/status')['setupRequired']:
        os.environ['DATABASE_URL'] = (ETC / 'database.env').read_text().strip().split('=', 1)[1]
        token = run([str(LAB / 'bin/zx-panel'), 'setup-token', '--config', str(ETC / 'config.json')]).splitlines()[-1]
        api.call('/auth/setup', {'token': token, **identity})
        api = API()
    api.call('/auth/login', identity)
    api.csrf = api.call('/auth/session')['csrfToken']
    session = next(cookie for cookie in api.cookies if cookie.name == '__Host-zx-panel-session')
    assert session.secure and session.has_nonstandard_attr('HttpOnly')
    return api


def acceptance():
    """真实官方安装、systemd 生命周期和脱敏导出；所有应用文件只属于实验目录。"""
    api = login()
    for task in api.call('/tasks')['items']:
        if task['action'] == 'runtime.install' and task['status'] in ['queued', 'running']:
            api.wait(task)
    facts = api.call('/bootstrap')
    assert facts['system']['appSupervisor'] == 'systemd'
    assert facts['capabilities']['installRuntime']['enabled']
    sample = api.call('/metrics/latest')
    for _ in range(5):
        if sample['cpuUsagePercent']['value'] is not None:
            break
        time.sleep(2)
        sample = api.call('/metrics/latest')
    assert sample['cpuUsagePercent']['value'] is not None and sample['memory']['usedBytes'] > 0
    report = {'environment': 'Ubuntu 24.04 / ' + os.uname().machine + ' / ' + os.uname().release, 'checks': ['Cookie HTTPS / HttpOnly / CSRF', 'shared real CPU / memory / filesystem metrics']}
    for kind in ['node', 'go']:
        installs = api.call(f'/runtimes/{kind}/installations')['items']
        if not any(item['ownership'] == 'panel' and item['state'] == 'ready' for item in installs):
            releases = api.call(f'/runtimes/{kind}/releases')['items']
            if not releases:
                task = api.call('/runtimes/catalog/refresh', {'kinds': [kind]}, key=secrets.token_hex(24))
                api.wait(task)
                releases = api.call(f'/runtimes/{kind}/releases')['items']
            assert releases, f'Empty official catalog for {kind}'
            release = releases[0]
            task = api.operation({'action': 'runtime.install', 'releaseId': release['id'], 'makeDefault': True})
        installed = next(item for item in api.call(f'/runtimes/{kind}/installations')['items'] if item['ownership'] == 'panel' and item['state'] == 'ready')
        report[kind] = {'version': installed['version'], 'installationId': installed['id']}
        print(f'Official {kind} installation ready.', flush=True)
    node = next(item for item in api.call('/runtimes/node/installations')['items'] if item['ownership'] == 'panel' and item['state'] == 'ready')
    blocked = api.call('/operations/preview', {'action': 'runtime.uninstall', 'installationId': node['id'], 'expectedRevision': node['revision']})
    assert not blocked['canExecute'] and any(reason['code'] == 'DEFAULT_IN_USE' for reason in blocked['blockedReasons'])
    directory = LAB / 'apps/node demo %n'
    directory.mkdir(exist_ok=True)
    owner = pwd.getpwnam('zx-lab-app')
    os.chown(directory, owner.pw_uid, owner.pw_gid)
    save(directory / 'server.js', "const { spawn } = require('node:child_process');\nspawn(process.execPath, ['-e', 'setInterval(() => { for(let i=0;i<2000000;i++) Math.sqrt(i); }, 100)'], {stdio:'inherit'});\nconsole.log('secret=' + process.env.LAB_SECRET);\nconsole.log('long-secret=' + process.env.LAB_LONG_SECRET);\nconsole.log('args=' + JSON.stringify(process.argv.slice(2)));\nsetInterval(() => console.log('lab-heartbeat ' + Date.now()), 250);\n", 0o644)
    secret_file = ETC / 'app-secret'
    if not secret_file.exists():
        save(secret_file, secrets.token_urlsafe(24))
    secret = secret_file.read_text()
    long_secret_file = ETC / 'long-app-secret'
    if not long_secret_file.exists():
        save(long_secret_file, secrets.token_hex(9000))
    long_secret = long_secret_file.read_text()
    changes = [{'action': 'set', 'key': 'LAB_SECRET', 'value': secret, 'secret': True}, {'action': 'set', 'key': 'LAB_LONG_SECRET', 'value': long_secret, 'secret': True}]
    apps = api.call('/apps')['items']
    existing = next((app for app in apps if app['name'] == 'lab-node-demo'), None)
    draft = {'name': 'lab-node-demo', 'workingDirectory': str(directory), 'runAsUser': 'zx-lab-app', 'restartPolicy': 'no', 'execution': {'kind': 'node', 'args': ['literal $HOME %n', ' two words '], 'runtimeInstallationId': node['id'], 'entryFile': 'server.js'}}
    if existing is None:
        task = api.operation({'action': 'app.create', 'app': draft, 'environmentChanges': changes})
        app_id = task['result']['appId']
        api.wait_app(app_id, 'stopped')
    else:
        app_id = existing['id']
        api.app_action(app_id, 'stop')
        revision = api.call('/apps/' + app_id)['revision']
        api.operation({'action': 'app.update', 'appId': app_id, 'expectedRevision': revision, 'app': draft, 'environmentChanges': changes})
    api.app_action(app_id, 'start')
    app = api.wait_app(app_id, 'running', metrics=True)
    assert secret not in json.dumps(app) and long_secret not in json.dumps(app)
    original_pid = app['mainPid']
    api.operation({'action': 'app.update', 'appId': app_id, 'expectedRevision': app['revision'], 'app': draft, 'environmentChanges': []})
    saved = api.wait_app(app_id, 'running')
    assert saved['mainPid'] == original_pid and saved['pendingRestart']
    api.app_action(app_id, 'restart')
    updated = api.wait_app(app_id, 'running')
    assert updated['mainPid'] != original_pid and not updated['pendingRestart']
    log_filter = {'sourceId': 'app:' + app_id, 'level': 'all', 'search': '', 'from': (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace('+00:00', 'Z'), 'to': ''}
    time.sleep(2)
    page = api.call('/logs?' + urllib.parse.urlencode(log_filter))
    assert page['items'] and secret not in json.dumps(page) and long_secret[:100] not in json.dumps(page)
    assert any(item['message'] == 'long-secret=[REDACTED]' and not item['truncated'] for item in page['items'])
    assert 'literal $HOME %n' in json.dumps(page)
    export = api.wait(api.call('/logs/exports', log_filter, key=secrets.token_hex(24)))
    with api.client.open(ORIGIN + '/api/v1/logs/exports/' + export['result']['exportId'] + '/download') as response:
        exported = response.read().decode()
    assert secret not in exported and long_secret[:100] not in exported and 'long-secret=[REDACTED]' in exported
    report['checks'] += ['official Node/Go SHA256 install and verification', 'default uninstall blocked', 'Node registered stopped', 'systemd start/restart and cgroup observation', 'saving config preserves running PID', 'literal args preserved', 'short and 18000-byte secret redaction in API/log/export']
    report['longSecretBytes'] = len(long_secret.encode())
    report['appId'] = app_id
    save(LAB / 'reports/acceptance.json', json.dumps(report, indent=2) + '\n', 0o644)
    print('Core Linux acceptance passed; demo app remains running for stability checks.', flush=True)


def helper_request():
    """用于实验的 Unix peer 身份检查；不在子进程环境传递数据库秘密。"""
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(10)
            connection.connect('/run/zx-panel-lab-helper/control.sock')
            connection.sendall(sys.stdin.buffer.read() + b'\n')
            with connection.makefile('rb') as stream:
                line = stream.readline(1024 * 1024)
        print(line.decode() if line else json.dumps({'denied': True}))
    except (PermissionError, ConnectionResetError):
        print(json.dumps({'denied': True}))


def helper_as(account, request):
    """每次使用独立真实账号连接，不模拟 SO_PEERCRED。"""
    return json.loads(run(['/usr/sbin/runuser', '-u', account, '--', '/usr/bin/python3', str(REPO / 'scripts/wsl-lab.py'), 'helper'], input=json.dumps(request), env={'PATH': '/usr/bin:/bin'}))


def boundaries():
    """验收 helper 拒绝、坏摘要/逃逸、二进制生命周期和引用保护。"""
    api = login()
    assert helper_as('zx-lab-web', {'action': 'probe', 'id': ''})['ok']
    for account in ['root', 'zx-lab-app']:
        assert helper_as(account, {'action': 'probe', 'id': ''}).get('denied')
    assert helper_as('zx-lab-web', {'action': 'probe', 'id': '', 'command': 'id'})['code'] == 'INVALID_INPUT'
    owner = pwd.getpwnam('zx-lab-web')
    for corrupt in [True, False]:
        stage_id, target_id = secrets.token_hex(16), secrets.token_hex(16)
        stage = Path('/var/lib/zx-panel-lab/staging') / stage_id
        stage.mkdir(mode=0o700)
        os.chown(stage, owner.pw_uid, owner.pw_gid)
        archive = stage / 'archive.tar.gz'
        with tarfile.open(archive, 'w:gz') as package:
            header = tarfile.TarInfo('node-lab/../../escape-probe')
            header.size = 1
            package.addfile(header, io.BytesIO(b'x'))
        archive.chmod(0o600)
        os.chown(archive, owner.pw_uid, owner.pw_gid)
        digest = '0' * 64 if corrupt else hashlib.sha256(archive.read_bytes()).hexdigest()
        response = helper_as('zx-lab-web', {'action': 'runtime.commit', 'id': target_id, 'kind': 'node', 'version': '1.0.0', 'stageId': stage_id, 'sha256': digest, 'archiveRoot': 'node-lab'})
        assert response['code'] == 'HOST_ACTION_FAILED' and not (LAB / 'runtimes/node' / target_id).exists()
        assert stage.resolve().parent == Path('/var/lib/zx-panel-lab/staging') and re.fullmatch('[a-f0-9]{32}', stage.name)
        shutil.rmtree(stage)
    node = next(item for item in api.call('/runtimes/node/installations')['items'] if item['ownership'] == 'panel')
    refs = api.call('/runtime-installations/' + node['id'] + '/references')
    print('Node references: complete=' + str(refs['complete']) + ', apps=' + str(len(refs['apps'])) + ', processes=' + str(len(refs['processes'])), flush=True)
    assert refs['apps']
    if refs['complete']:
        assert refs['processes']
    directory = LAB / 'apps/binary-demo'
    directory.mkdir(exist_ok=True)
    shutil.copyfile('/usr/bin/sleep', directory / 'sleep')
    (directory / 'sleep').chmod(0o755)
    name = 'lab-binary-' + secrets.token_hex(4)
    draft = {'name': name, 'workingDirectory': str(directory), 'runAsUser': 'zx-lab-app', 'restartPolicy': 'no', 'execution': {'kind': 'binary', 'args': ['300'], 'executablePath': str(directory / 'sleep'), 'buildToolchainLabel': 'system coreutils test copy'}}
    task = api.operation({'action': 'app.create', 'app': draft, 'environmentChanges': []})
    app_id = task['result']['appId']
    api.wait_app(app_id, 'stopped')
    api.app_action(app_id, 'start')
    app = api.call('/apps/' + app_id)
    blocked = api.call('/operations/preview', {'action': 'app.delete', 'appId': app_id, 'expectedRevision': app['revision']})
    assert not blocked['canExecute']
    api.app_action(app_id, 'stop')
    api.app_action(app_id, 'delete')
    assert (directory / 'sleep').is_file() and not Path('/etc/systemd/system/zx-panel-app-' + app_id + '.service').exists()
    journal = run(['journalctl', '--unit=zx-panel-app-' + app_id + '.service', '--no-pager', '-o', 'cat'])
    assert journal and 'No entries' not in journal
    report = json.loads((LAB / 'reports/acceptance.json').read_text())
    report['checks'] += ['Unix SO_PEERCRED allowed/denied identities', 'helper strict JSON', 'helper SHA256 rejection', 'helper archive traversal rejection', 'binary registered stopped / start / stop / delete', 'running app deletion blocked', 'deletion preserves files and journal', 'configured runtime references']
    report['referenceComplete'] = refs['complete']
    save(LAB / 'reports/acceptance.json', json.dumps(report, indent=2) + '\n', 0o644)
    print('Helper and application boundary checks passed.', flush=True)


def sample():
    """只输出实验进程的资源数字，不读取命令行或环境。"""
    result = {'at': datetime.now(timezone.utc).isoformat()}
    for name in ['zx-panel-lab', 'zx-panel-lab-helper', 'zx-panel-lab-postgres']:
        pid = int(run(['systemctl', 'show', name + '.service', '-p', 'MainPID', '--value']))
        base = Path('/proc') / str(pid)
        status = dict(line.split(':', 1) for line in (base / 'status').read_text().splitlines() if ':' in line)
        stat = (base / 'stat').read_text().rsplit(')', 1)[1].split()
        result[name] = {'pid': pid, 'rssKiB': int(status.get('VmRSS', '0 kB').split()[0]), 'threads': int(status['Threads']), 'fds': len(list((base / 'fd').iterdir())), 'cpuSeconds': (int(stat[11]) + int(stat[12])) / os.sysconf('SC_CLK_TCK')}
        group = Path('/sys/fs/cgroup') / run(['systemctl', 'show', name + '.service', '-p', 'ControlGroup', '--value']).lstrip('/')
        cpu = dict(line.split() for line in (group / 'cpu.stat').read_text().splitlines())
        result[name].update({'cgroupCPUSeconds': int(cpu['usage_usec']) / 1_000_000, 'cgroupMemoryBytes': int((group / 'memory.current').read_text()), 'cgroupProcesses': len((group / 'cgroup.procs').read_text().splitlines())})
    journal = run(['journalctl', '-u', 'zx-panel-lab.service', '--no-pager', '-o', 'cat', '--grep=panel resource sample', '-n', '1'])
    count = re.search(r'goroutines=(\d+)', journal)
    result['goroutines'] = int(count[1]) if count else None
    size = run(['runuser', '-u', 'zx-lab-db', '--', 'psql', '-h', '/run/zx-panel-lab-postgres', '-p', '25433', '-U', 'zx_lab', '-d', 'zx_panel_lab', '-Atc', "SELECT pg_database_size(current_database()),pg_total_relation_size('app.metrics_aggregates')"])
    result['databaseBytes'], result['metricsBytes'] = map(int, size.split('|'))
    print(json.dumps(result))


def load():
    """把仅实验日志生产者调整为每秒约一百行，给有界列表提供持续输入。"""
    api = login()
    report = json.loads((LAB / 'reports/acceptance.json').read_text())
    source = LAB / 'apps/node demo %n/server.js'
    body = source.read_text()
    assert ', 250);' in body or ', 10);' in body
    save(source, body.replace(', 250);', ', 10);'), 0o644)
    api.app_action(report['appId'], 'restart')
    print('Lab log producer enabled: approximately 100 lines per second.', flush=True)


def logs():
    """真实 journal 历史翻页与筛选不跨越时间边界，失效锚点必须明确失败。"""
    api = login()
    report = json.loads((LAB / 'reports/acceptance.json').read_text())
    app_id = report['appId']
    end = datetime.now(timezone.utc) - timedelta(seconds=2)
    start = end - timedelta(minutes=5)
    filters = {'sourceId': 'app:' + app_id, 'level': 'info', 'search': 'lab-heartbeat', 'from': start.isoformat(), 'to': end.isoformat(), 'limit': 50}
    first = api.call('/logs?' + urllib.parse.urlencode(filters))
    assert len(first['items']) == 50 and first['nextCursor']
    second = api.call('/logs?' + urllib.parse.urlencode({**filters, 'cursor': first['nextCursor']}))
    assert len(second['items']) == 50
    assert not {item['id'] for item in first['items']} & {item['id'] for item in second['items']}
    for item in first['items'] + second['items']:
        assert item['level'] == 'info' and 'lab-heartbeat' in item['message']
        assert start <= datetime.fromisoformat(item['at'].replace('Z', '+00:00')) <= end
    token = first['items'][-1]['id'].removeprefix('j:')
    import base64
    position = base64.urlsafe_b64decode(token + '=' * (-len(token) % 4)).decode()
    missing = re.sub(r'b=[0-9a-f]+', 'b=' + '0' * 32, position)
    response = helper_as('zx-lab-web', {'action': 'app.logs', 'id': app_id, 'after': missing, 'from': filters['from'], 'to': filters['to'], 'limit': 50})
    assert response['code'] == 'HOST_ACTION_FAILED'
    report['checks'] += ['journal history pagination without duplicates', 'journal text/level/time filters', 'missing journal anchor rejected']
    save(LAB / 'reports/acceptance.json', json.dumps(report, indent=2) + '\n', 0o644)
    print('Journal paging, filtering and missing-anchor checks passed.', flush=True)


def stop():
    """结束本任务的日志生产者与四个实验服务，保留数据供复验。"""
    api = login()
    report = json.loads((LAB / 'reports/acceptance.json').read_text())
    app_id = report['appId']
    assert re.fullmatch('[a-f0-9]{32}', app_id)
    if api.call('/apps/' + app_id)['status'] != 'stopped':
        api.app_action(app_id, 'stop')
    for name in ['zx-panel-lab-nginx', 'zx-panel-lab', 'zx-panel-lab-helper', 'zx-panel-lab-postgres']:
        path = Path('/etc/systemd/system') / (name + '.service')
        assert path.read_text().startswith('# zx-panel-lab owned\n')
        run(['systemctl', 'stop', name + '.service'])
    print('Lab producer and dedicated services stopped; data and packages retained.', flush=True)


def recovery():
    """通过代理检查 SSE、停服重连、真实下载取消/中断和生产备份 CLI。"""
    api = login()
    bootstrap = api.call('/bootstrap')
    frames = []
    closed = threading.Event()
    def consume():
        try:
            with api.client.open(ORIGIN + '/api/v1/events', timeout=30) as stream:
                for raw in stream:
                    text = raw.decode().strip()
                    if text.startswith('event:'):
                        frames.append((time.monotonic(), text[6:].strip()))
        finally:
            closed.set()
    observer = threading.Thread(target=consume, daemon=True)
    observer.start()
    started = time.monotonic()
    while time.monotonic() - started < 18:
        time.sleep(0.2)
    assert sum(name == 'metrics.sample' for _, name in frames) >= 5, 'Nginx buffered SSE'
    api.call('/auth/logout', {})
    assert closed.wait(3), 'SSE remained open after logout'
    api = login()
    run(['systemctl', 'restart', 'zx-panel-lab.service'])
    for _ in range(30):
        try:
            fresh = api.call('/bootstrap')
            break
        except (RuntimeError, urllib.error.URLError):
            time.sleep(1)
    else:
        raise RuntimeError('Restart recovery failed')
    assert fresh['streamEpoch'] != bootstrap['streamEpoch']
    old = urllib.request.Request(ORIGIN + '/api/v1/events', headers={'Last-Event-ID': bootstrap['streamCursor']})
    with api.client.open(old, timeout=10) as stream:
        while True:
            line = stream.readline().decode().strip()
            if line.startswith('event:'):
                assert line == 'event: reset', 'Old epoch was not reset'
                break
    installed = {item['version'] for item in api.call('/runtimes/go/installations')['items']}
    release = next(item for item in api.call('/runtimes/go/releases')['items'] if item['version'] not in installed)
    op = {'action': 'runtime.install', 'releaseId': release['id'], 'makeDefault': False}
    outcomes = []
    for action in ['cancel', 'crash']:
        plan = api.call('/operations/preview', op)
        assert plan['canExecute']
        task = api.call('/operations', {'planId': plan['id'], 'confirmationText': plan['confirmationText']}, key=secrets.token_hex(24))
        for _ in range(300):
            task = api.call('/tasks/' + task['id'])
            if task['stage'] == 'download':
                break
            assert task['status'] in ['queued', 'running']
            time.sleep(0.05)
        else:
            raise RuntimeError('Did not observe cancellable download')
        if action == 'cancel':
            api.call('/tasks/' + task['id'] + '/cancel', {})
        else:
            run(['systemctl', 'kill', '--kill-whom=main', '--signal=SIGKILL', 'zx-panel-lab.service'])
        for _ in range(60):
            try:
                task = api.call('/tasks/' + task['id'])
                if task['status'] in ['canceled', 'interrupted', 'succeeded', 'failed']:
                    break
            except (RuntimeError, urllib.error.URLError):
                pass
            time.sleep(1)
        expected = 'canceled' if action == 'cancel' else 'interrupted'
        assert task['status'] == expected, f'{action}: unexpected {task["status"]}'
        assert not (Path('/var/lib/zx-panel-lab/staging') / task['id']).exists()
        outcomes.append({'operation': action, 'taskId': task['id'], 'status': task['status']})
    os.environ['DATABASE_URL'] = (ETC / 'database.env').read_text().strip().split('=', 1)[1]
    backup = LAB / 'reports' / ('production-' + secrets.token_hex(4) + '.dump')
    run([str(LAB / 'bin/zx-panel'), 'backup', '--config', str(ETC / 'config.json'), '--output', str(backup)])
    assert backup.stat().st_mode & 0o777 == 0o600
    assert backup.read_bytes()[:5] == b'PGDMP'
    shutil.copyfile(ETC / 'keys/app-secrets.key', ETC / 'keys/independent-backup.key')
    (ETC / 'keys/independent-backup.key').chmod(0o600)
    report = json.loads((LAB / 'reports/acceptance.json').read_text())
    report['checks'] += ['Nginx SSE delivers samples without buffering', 'logout closes SSE', 'restart changes stream epoch', 'old epoch explicitly resets', 'download cancellation cleanup', 'SIGKILL running-task interruption recovery', 'production pg_dump CLI produces private custom-format backup']
    report['recoveryTasks'] = outcomes
    save(LAB / 'reports/acceptance.json', json.dumps(report, indent=2) + '\n', 0o644)
    print('SSE, restart, cancellation, interruption and backup CLI checks passed.', flush=True)


if __name__ == '__main__':
    if sys.argv[1:] == ['prepare']:
        prepare()
    elif sys.argv[1:] == ['acceptance']:
        acceptance()
    elif sys.argv[1:] == ['units']:
        units()
    elif sys.argv[1:] == ['helper']:
        helper_request()
    elif sys.argv[1:] == ['boundaries']:
        boundaries()
    elif sys.argv[1:] == ['sample']:
        sample()
    elif sys.argv[1:] == ['recovery']:
        recovery()
    elif sys.argv[1:] == ['load']:
        load()
    elif sys.argv[1:] == ['logs']:
        logs()
    elif sys.argv[1:] == ['stop']:
        stop()
    else:
        raise SystemExit('Usage: wsl-lab.py prepare')
