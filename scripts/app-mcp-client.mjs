import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

// One-shot client for the installed official MCP server. No private IPC or credential access.
const serverPath = 'C:/Program Files/WindowsApps/OpenAI.Codex_26.1002.7124.0_x64__2p2nqsd0c76g0/app/resources/plugins/openai-bundled/plugins/codex-app-tools/server.mjs';
const [requestPath, outputPath] = process.argv.slice(2);
let child;
let timer;
try {
  if (!requestPath) throw new Error('Usage: node scripts/app-mcp-client.mjs request.json [output.json]');
  const request = JSON.parse(await readFile(requestPath, 'utf8'));
  if (!['tools/list', 'tools/call'].includes(request.method)) throw new Error('Only tools/list and tools/call are supported.');
  if (!process.env.CODEX_APP_TOOLS_PIPE_PATH) throw new Error('Required official app MCP environment is missing.');
  const params = request.params ?? {};
  if ('_meta' in params) throw new Error('Caller-supplied metadata is not accepted; use the real executor environment.');
  if (request.method === 'tools/call') {
    if (!process.env.CODEX_THREAD_ID) throw new Error('CODEX_THREAD_ID is missing; no session-id guess or fabricated metadata is allowed.');
    params._meta = { 'openai/threadId': process.env.CODEX_THREAD_ID };
    if (process.env.CODEX_TURN_ID) params._meta['openai/turnId'] = process.env.CODEX_TURN_ID;
    if (process.env.CODEX_TOOL_CALL_ID) params._meta['openai/toolCallId'] = process.env.CODEX_TOOL_CALL_ID;
  }
  child = spawn(process.execPath, [serverPath], {
    env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  const response = await new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;
    const fail = (error) => { if (!settled) { settled = true; reject(error); } };
    const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
    timer = setTimeout(() => fail(new Error('Official MCP request timed out; stopped without retry.')), 60000);
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('exit', () => fail(new Error('Official MCP server exited before completing the request.')));
    // Consume stderr without dumping potentially sensitive host diagnostics.
    child.stderr.on('data', () => {});
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        let message;
        try { message = JSON.parse(line); } catch { fail(new Error('Invalid MCP JSON response.')); return; }
        if (message.method && message.id !== undefined) {
          fail(new Error('MCP server requested an interactive response; stopped without auto-approval.'));
          return;
        }
        if (message.id === 1) {
          if (message.error) { fail(new Error('MCP initialization failed.')); return; }
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: request.method, params });
        } else if (message.id === 2 && !settled) {
          settled = true;
          resolve(message);
        }
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'codex-project-app-mcp-client', version: '1.0.0' },
    } });
  });
  const serialized = `${JSON.stringify(response, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, serialized, 'utf8');
  else process.stdout.write(serialized);
  if (response.error || response.result?.isError) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  child?.kill();
}
