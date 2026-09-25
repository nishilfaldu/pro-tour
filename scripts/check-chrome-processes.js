import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const uidFields = status => {
  const match = status.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m);
  const parent = status.match(/^PPid:\s+(\d+)/m);
  if (!match || !parent) return null;
  return { uids: match.slice(1).map(Number), parent: Number(parent[1]) };
};

export async function inspectChromeProcesses(browserUid, chromeHome, procRoot = '/proc') {
  const entries = await readdir(procRoot);
  const processes = new Map();
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const root = join(procRoot, entry);
      const [status, comm, rawCommand] = await Promise.all([
        readFile(join(root, 'status'), 'utf8'),
        readFile(join(root, 'comm'), 'utf8'),
        readFile(join(root, 'cmdline')),
      ]);
      const fields = uidFields(status);
      if (!fields) continue;
      processes.set(Number(entry), {
        pid: Number(entry), parent: fields.parent, uids: fields.uids,
        name: comm.trim().slice(0, 32),
        args: rawCommand.toString('utf8').split('\0').filter(Boolean),
      });
    } catch (error) {
      // A process can exit while /proc is being read.
      if (error.code !== 'ENOENT' && error.code !== 'ESRCH' && error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
    }
  }
  const roots = [...processes.values()].filter(process =>
    ['chrome', 'google-chrome'].includes(process.name) &&
    process.args.includes(`--user-data-dir=${chromeHome}`) &&
    process.args.includes('--remote-debugging-port=9223') &&
    !process.args.some(arg => arg.startsWith('--type=')));
  const rootIds = new Set(roots.map(process => process.pid));
  const descendants = [...processes.values()].filter(process => {
    let parent = process.parent;
    const seen = new Set([process.pid]);
    while (processes.has(parent) && !seen.has(parent)) {
      if (rootIds.has(parent)) return true;
      seen.add(parent);
      parent = processes.get(parent).parent;
    }
    return false;
  });
  const network = descendants.filter(process => process.args.some(arg =>
    arg.includes('network.mojom.NetworkService')));
  const wrongUid = [...roots, ...network].filter(process =>
    process.uids.some(uid => uid !== browserUid));
  const ok = roots.length > 0 && network.length > 0 && wrongUid.length === 0;
  return {
    ok,
    rootCount: roots.length,
    networkCount: network.length,
    // Safe diagnostics: no arguments, environment, or file paths.
    processes: (roots.length ? [...roots, ...network] : [...processes.values()].filter(process =>
      ['chrome', 'google-chrome'].includes(process.name) &&
      process.uids.includes(browserUid))).slice(0, 20).map(({ pid, parent, uids, name }) =>
      ({ pid, parent, uids, name })),
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [uid, chromeHome, procRoot = '/proc'] = process.argv.slice(2);
  if (!/^\d+$/.test(uid) || !chromeHome) throw new Error('Expected browser UID and Chrome home');
  const result = await inspectChromeProcesses(Number(uid), chromeHome, procRoot);
  if (!result.ok) {
    process.stderr.write(`Chrome process verification failed: roots=${result.rootCount} network=${result.networkCount}\n`);
    for (const entry of result.processes) {
      process.stderr.write(`pid=${entry.pid} ppid=${entry.parent} uid=${entry.uids.join('/')} name=${entry.name}\n`);
    }
    process.exitCode = 1;
  }
}
