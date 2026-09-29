#!/usr/bin/env python3
"""WSL 内一次性 ARM64 系统模拟；只读共享交付文件，不共享仓库秘密或现有数据库。"""
import hashlib
import json
import os
from pathlib import Path
import pwd
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path('/opt/zx-panel-arm64-lab')
PRIVATE = Path('/etc/zx-panel-arm64-lab')
REPO = Path('/mnt/e/Github/zx-panel')
IMAGE_URL = 'https://cloud-images.ubuntu.com/releases/noble/release-20260911/'
IMAGE_NAME = 'ubuntu-24.04-server-cloudimg-arm64.img'


def command(args, **kwargs):
    """参数数组执行，输出默认留在调用方而非终端。"""
    return subprocess.run(args, text=True, capture_output=True, check=True, **kwargs).stdout


def ssh(script, timeout=1200):
    """仅通过独立回环转发访问新虚拟机，首次密钥存入专用 known_hosts。"""
    return command(['ssh', '-i', str(PRIVATE / 'id_ed25519'), '-p', '27222', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'UserKnownHostsFile=' + str(PRIVATE / 'known_hosts'), '-o', 'ConnectTimeout=15', 'labadmin@127.0.0.1', script], timeout=timeout)


def prepare():
    """校验官方镜像摘要、创建独立磁盘和密钥，以非 root 宿主账号运行 QEMU。"""
    assert os.geteuid() == 0
    if ROOT.exists():
        assert (ROOT / '.zx-panel-arm64-lab').is_file() and not ROOT.is_symlink()
    else:
        assert not PRIVATE.exists()
        try:
            pwd.getpwnam('zx-lab-vm')
        except KeyError:
            pass
        else:
            raise RuntimeError('Pre-existing VM account')
        ROOT.mkdir(mode=0o755)
        (ROOT / '.zx-panel-arm64-lab').touch()
    for port in [27222]:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))
    command(['apt-get', 'install', '-y', '--no-install-recommends', 'qemu-system-arm', 'qemu-efi-aarch64', 'qemu-utils', 'cloud-image-utils', 'openssh-client'])
    try:
        owner = pwd.getpwnam('zx-lab-vm')
    except KeyError:
        command(['useradd', '--system', '--user-group', '--home-dir', str(ROOT), '--shell', '/usr/sbin/nologin', 'zx-lab-vm'])
        owner = pwd.getpwnam('zx-lab-vm')
    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    if not (PRIVATE / 'id_ed25519').exists():
        command(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(PRIVATE / 'id_ed25519')])
    public_key = (PRIVATE / 'id_ed25519.pub').read_text().strip()
    with urllib.request.urlopen(IMAGE_URL + 'SHA256SUMS', timeout=60) as response:
        sums = response.read().decode()
    digest = next(line.split()[0] for line in sums.splitlines() if line.split()[-1].lstrip('*') == IMAGE_NAME)
    image = ROOT / IMAGE_NAME
    if not image.exists():
        part = image.with_suffix('.part')
        with urllib.request.urlopen(IMAGE_URL + IMAGE_NAME, timeout=120) as response, part.open('wb') as output:
            shutil.copyfileobj(response, output, 1024 * 1024)
        part.rename(image)
    with image.open('rb') as source:
        assert hashlib.file_digest(source, 'sha256').hexdigest() == digest
    print('Official Ubuntu ARM64 image SHA256 verified.', flush=True)
    inputs = ROOT / 'input'
    for name in ['release/linux-arm64', 'deploy', 'scripts']:
        (inputs / name).mkdir(parents=True, exist_ok=True)
    for name in ['zx-panel', 'zx-panel-helper']:
        shutil.copy2(REPO / 'release/linux-arm64' / name, inputs / 'release/linux-arm64' / name)
    for name in ['zx-panel.service', 'zx-panel-helper.service', 'nginx.conf']:
        shutil.copy2(REPO / 'deploy' / name, inputs / 'deploy' / name)
    for name in ['wsl-lab.sh', 'wsl-lab.py', 'wsl-release-checks.py']:
        shutil.copy2(REPO / 'scripts' / name, inputs / 'scripts' / name)
    state = ROOT / 'state'
    state.mkdir(mode=0o700, exist_ok=True)
    os.chown(state, owner.pw_uid, owner.pw_gid)
    disk = state / 'root.qcow2'
    if not disk.exists():
        command(['qemu-img', 'create', '-f', 'qcow2', '-F', 'qcow2', '-b', str(image), str(disk), '12G'])
    variables = state / 'AAVMF_VARS.fd'
    if not variables.exists():
        shutil.copyfile('/usr/share/AAVMF/AAVMF_VARS.fd', variables)
    config = {
        'hostname': 'zx-panel-arm64-lab', 'manage_etc_hosts': True, 'ssh_pwauth': False, 'disable_root': True,
        'users': [{'name': 'labadmin', 'groups': ['sudo'], 'shell': '/bin/bash', 'lock_passwd': True, 'sudo': ['ALL=(ALL) NOPASSWD:ALL'], 'ssh_authorized_keys': [public_key]}],
        'runcmd': [['mkdir', '-p', '/mnt/e/Github/zx-panel'], ['mount', '-t', '9p', '-o', 'trans=virtio,version=9p2000.L,ro', 'zxinput', '/mnt/e/Github/zx-panel']],
    }
    (state / 'user-data').write_text('#cloud-config\n' + json.dumps(config))
    (state / 'meta-data').write_text('instance-id: zx-panel-arm64-lab-v1\nlocal-hostname: zx-panel-arm64-lab\n')
    command(['cloud-localds', str(state / 'seed.img'), str(state / 'user-data'), str(state / 'meta-data')])
    for path in state.iterdir():
        os.chown(path, owner.pw_uid, owner.pw_gid)
        path.chmod(0o600)
    args = ['qemu-system-aarch64', '-machine', 'virt', '-cpu', 'max', '-accel', 'tcg,thread=multi', '-smp', '2', '-m', '2048', '-display', 'none', '-monitor', 'none', '-serial', 'file:' + str(state / 'console.log'), '-drive', 'if=pflash,format=raw,readonly=on,file=/usr/share/AAVMF/AAVMF_CODE.fd', '-drive', 'if=pflash,format=raw,file=' + str(variables), '-drive', 'if=virtio,format=qcow2,file=' + str(disk), '-drive', 'if=virtio,format=raw,readonly=on,file=' + str(state / 'seed.img'), '-netdev', 'user,id=net0,hostfwd=tcp:127.0.0.1:27222-:22', '-device', 'virtio-net-pci,netdev=net0,romfile=', '-virtfs', 'local,path=' + str(inputs) + ',mount_tag=zxinput,security_model=none,readonly=on', '-device', 'virtio-rng-pci']
    command(['systemd-run', '--unit=zx-panel-arm64-vm', '--collect', '-p', 'User=zx-lab-vm', '-p', 'NoNewPrivileges=yes', '-p', 'ProtectSystem=strict', '-p', 'ReadWritePaths=' + str(state), '-p', 'PrivateTmp=yes', '-p', 'MemoryMax=2500M', '-p', 'CapabilityBoundingSet=', *args])
    print('ARM64 VM started with a private disk, readonly inputs and loopback SSH forwarding.', flush=True)
    for attempt in range(120):
        if command(['systemctl', 'show', 'zx-panel-arm64-vm.service', '-p', 'ActiveState', '--value']).strip() != 'active':
            raise RuntimeError('ARM64 VM exited; inspect its dedicated journal')
        try:
            result = ssh('uname -m; cloud-init status --wait', timeout=120)
            assert 'aarch64' in result
            ssh('mountpoint -q /mnt/e/Github/zx-panel || sudo mount -t 9p -o trans=virtio,version=9p2000.L,ro zxinput /mnt/e/Github/zx-panel')
            print('ARM64 systemd guest and cloud-init ready.', flush=True)
            return
        except (subprocess.SubprocessError, AssertionError):
            if attempt % 6 == 0:
                print('Waiting for ARM64 guest boot...', flush=True)
            time.sleep(5)
    raise RuntimeError('ARM64 guest boot timed out; retained private console log')


def verify():
    """在 ARM64 来宾中复用相同验收脚本，输出报告而不输出凭据。"""
    reports = ROOT / 'reports'
    reports.mkdir(mode=0o700, exist_ok=True)
    for phase, script in [
        ('prepare', 'sudo bash /mnt/e/Github/zx-panel/scripts/wsl-lab.sh prepare'),
        ('acceptance', 'sudo python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py acceptance'),
        ('boundaries', 'sudo python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py boundaries'),
        ('recovery', 'sudo python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py recovery'),
        ('logs', 'sudo python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py logs'),
    ]:
        print('ARM64 phase: ' + phase, flush=True)
        if phase == 'prepare' and ssh('systemctl is-active zx-panel-lab.service || true').strip() == 'active':
            print('ARM64 prepared services already active; continuing verification.', flush=True)
            continue
        try:
            result = ssh(script, timeout=1800)
        except subprocess.CalledProcessError as error:
            (reports / (phase + '-failure.log')).write_text((error.stdout or '') + (error.stderr or ''))
            raise RuntimeError('ARM64 phase failed: ' + phase + '; inspect its private report') from None
        (reports / (phase + '.log')).write_text(result)
        print('ARM64 phase passed: ' + phase, flush=True)
    report = ssh('sudo cat /opt/zx-panel-lab/reports/acceptance.json')
    (reports / 'acceptance.json').write_text(report)
    print('ARM64 emulated-system acceptance recorded.', flush=True)


if __name__ == '__main__':
    if sys.argv[1:] == ['prepare']:
        prepare()
    elif sys.argv[1:] == ['verify']:
        verify()
    elif sys.argv[1:] == ['stop']:
        ssh('sudo python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py stop')
        ssh('sudo shutdown -h now')
    else:
        raise SystemExit('Usage: wsl-arm64-lab.py prepare|verify|stop')
