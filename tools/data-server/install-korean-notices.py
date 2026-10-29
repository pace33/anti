#!/usr/bin/env python3
"""Install the versioned notices API into the existing Korean v2 service.

Run from a reviewed/merged pace33/anti checkout on the data server. Existing
service source is backed up and patched narrowly; no existing app DB is touched.
The notices DB is separate. A restart is deliberately a separate operator step.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
from datetime import datetime, timezone


def integrate(source):
    if "import { createKoreanNotices } from './korean-notices.mjs';" not in source:
        anchor = "import crypto from 'node:crypto';"
        assert source.count(anchor) == 1, 'Korean v2 import anchor changed'
        source = source.replace(anchor, anchor + "\nimport { createKoreanNotices } from './korean-notices.mjs';")
    if 'const notices = createKoreanNotices({ dataDir });' not in source:
        anchor = '  initPokemonEconomy(db);'
        assert source.count(anchor) == 1, 'Korean v2 initialization anchor changed'
        source = source.replace(anchor, anchor + '\n  const notices = createKoreanNotices({ dataDir });')
    if "sub === '/notices'" not in source:
        anchor = 'const mayReadPublic = !hasBearer && ('
        assert source.count(anchor) == 1, 'Korean v2 public read gate changed'
        source = source.replace(anchor, anchor + "(req.method === 'GET' && (sub === '/notices' || sub.startsWith('/notices/'))) || ")
    if 'await notices.handle(req, res, actor, sub, url)' not in source:
        anchor = "      if (req.method === 'GET' && sub === '/health') {"
        assert source.count(anchor) == 1, 'Korean v2 routing anchor changed'
        source = source.replace(anchor, '      if (await notices.handle(req, res, actor, sub, url)) return true;\n\n' + anchor)
    return source


def atomic_write(path, content):
    temp = path.with_suffix(path.suffix + '.notices-tmp')
    temp.write_bytes(content)
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-root', type=Path, required=True)
    parser.add_argument('--admin-uid', action='append', default=[])
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = args.api_root / 'src' / 'korean-v2.js'
    original = target.read_bytes()
    modified = integrate(original.decode('utf-8')).encode('utf-8')
    assert integrate(modified.decode('utf-8')).encode('utf-8') == modified, 'Patch must be idempotent'
    module = Path(__file__).with_name('korean-notices.mjs')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backups = args.api_root / 'backups' / ('korean-notices-' + stamp)
    result = {'check': args.check, 'integrationChanged': original != modified, 'moduleSha256': hashlib.sha256(module.read_bytes()).hexdigest()}
    for uid in args.admin_uid:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', uid):
            raise ValueError('Invalid Firebase UID')
    if not args.check:
        backups.mkdir(parents=True)
        shutil.copy2(target, backups / target.name)
        installed = target.with_name('korean-notices.mjs')
        if installed.exists():
            shutil.copy2(installed, backups / installed.name)
        atomic_write(installed, module.read_bytes())
        if modified != original:
            atomic_write(target, modified)
        if args.admin_uid:
            override = Path.home() / '.config/systemd/user/aiedue-database.service.d/korean-notices.conf'
            uids = set(args.admin_uid)
            if override.exists():
                shutil.copy2(override, backups / override.name)
                found = re.search(r'KOREAN_NOTICE_ADMIN_UIDS=([A-Za-z0-9_,\-]+)', override.read_text())
                if not found:
                    raise ValueError('Existing notices override has unrecognized format; preserved for manual review')
                uids.update(found.group(1).split(','))
            override.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(override, ('[Service]\nEnvironment="KOREAN_NOTICE_ADMIN_UIDS=' + ','.join(sorted(uids)) + '"\n').encode())
        result['backup'] = str(backups)
        result['installedModule'] = str(installed)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
