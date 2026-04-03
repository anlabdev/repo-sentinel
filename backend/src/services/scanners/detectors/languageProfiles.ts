export type ScriptLanguage = "javascript" | "python" | "powershell" | "shell" | "java";

interface BehaviorProfile {
  command: RegExp[];
  download: RegExp[];
  write: RegExp[];
  execute: RegExp[];
  secretRead: RegExp[];
  networkSend: RegExp[];
  decode: RegExp[];
  suspiciousDecodeContext: RegExp[];
}

const JAVASCRIPT_PROFILE: BehaviorProfile = {
  command: [/child_process/i, /exec\(/i, /spawn\(/i, /curl\s+[^|]+\|\s*(sh|bash)/i, /wget\s+[^|]+\|\s*(sh|bash)/i],
  download: [/fetch\(/i, /axios\.(get|post)\(/i, /https?\.get\(/i, /download/i],
  write: [/writeFileSync\(/i, /writeFile\(/i, /appendFile\(/i, /fs\.promises\.writeFile\(/i],
  execute: [/exec\(/i, /spawn\(/i],
  secretRead: [/process\.env\[[^\]]+\]/i, /process\.env\.[A-Z0-9_]+/i, /Authorization\s*[:=]/i, /Bearer\s+/i, /API[_-]?KEY/i, /SECRET[_-]?KEY/i, /ACCESS[_-]?TOKEN/i],
  networkSend: [/fetch\(/i, /axios\.(post|put|get)\(/i],
  decode: [/atob\(/i, /Buffer\.from\([^\n)]*base64/i, /decodeURIComponent\(/i, /fromCharCode\(/i],
  suspiciousDecodeContext: [/base64/i, /hex/i, /payload/i, /tmp\.(exe|dll|sh)/i, /eval\(/i, /new Function\(/i]
};

const PYTHON_PROFILE: BehaviorProfile = {
  command: [/subprocess\.(Popen|run)\(/i, /os\.system\(/i, /curl\s+[^|]+\|\s*(sh|bash)/i, /wget\s+[^|]+\|\s*(sh|bash)/i],
  download: [/requests\.(get|post)\(/i, /urllib\.request\.(urlretrieve|urlopen)/i],
  write: [/open\([^\n]+["']wb["']/i, /write\(/i],
  execute: [/subprocess\.(Popen|run)\(/i, /os\.system\(/i],
  secretRead: [/os\.environ\[[^\]]+\]/i, /os\.getenv\(/i, /Authorization\s*[:=]/i, /Bearer\s+/i, /API[_-]?KEY/i, /SECRET[_-]?KEY/i, /ACCESS[_-]?TOKEN/i],
  networkSend: [/requests\.(post|put|get)\(/i],
  decode: [/base64\.b64decode\(/i, /bytes\.fromhex\(/i, /codecs\.decode\(/i],
  suspiciousDecodeContext: [/base64/i, /hex/i, /payload/i, /tmp\.(exe|dll|sh)/i, /shellcode/i]
};

const POWERSHELL_PROFILE: BehaviorProfile = {
  command: [/Invoke-WebRequest/i, /Start-Process/i, /powershell\s+-enc/i, /cmd\.exe\s+\/c/i],
  download: [/Invoke-WebRequest/i, /Start-BitsTransfer/i, /Net\.WebClient/i],
  write: [/Set-Content\b/i, /Out-File\b/i, /WriteAllBytes/i],
  execute: [/Start-Process\b/i, /powershell\s+-enc/i, /cmd\.exe\s+\/c/i],
  secretRead: [/\$env:[A-Z0-9_]+/i, /Authorization\s*[:=]/i, /Bearer\s+/i, /API[_-]?KEY/i, /SECRET[_-]?KEY/i, /ACCESS[_-]?TOKEN/i],
  networkSend: [/Invoke-WebRequest/i, /Invoke-RestMethod/i, /Net\.WebClient/i],
  decode: [/FromBase64String\(/i, /-EncodedCommand/i],
  suspiciousDecodeContext: [/base64/i, /encodedcommand/i, /payload/i, /tmp\.(exe|dll|ps1)/i]
};

const SHELL_PROFILE: BehaviorProfile = {
  command: [/curl\s+[^|]+\|\s*(sh|bash)/i, /wget\s+[^|]+\|\s*(sh|bash)/i, /sh\s+/i, /bash\s+/i],
  download: [/curl\s+/i, /wget\s+/i],
  write: [/>\s*\S+/i, /tee\s+/i, /cat\s+.*>/i],
  execute: [/sh\s+/i, /bash\s+/i, /chmod\s+\+x/i],
  secretRead: [/\$[A-Z_][A-Z0-9_]*/i, /Authorization\s*[:=]/i, /Bearer\s+/i, /API[_-]?KEY/i, /SECRET[_-]?KEY/i, /ACCESS[_-]?TOKEN/i],
  networkSend: [/curl\s+/i, /wget\s+/i],
  decode: [/base64\s+(-d|--decode)/i, /xxd\s+-r/i],
  suspiciousDecodeContext: [/base64/i, /hex/i, /payload/i, /tmp\.(exe|dll|sh)/i]
};

const JAVA_PROFILE: BehaviorProfile = {
  command: [/ProcessBuilder\(/i, /Runtime\.getRuntime\(\)\.exec/i],
  download: [/HttpClient\(/i, /HttpURLConnection/i, /new URL\(/i],
  write: [/FileOutputStream\(/i, /Files\.write\(/i],
  execute: [/ProcessBuilder\(/i, /Runtime\.getRuntime\(\)\.exec/i],
  secretRead: [/System\.getenv\(/i, /Authorization\s*[:=]/i, /Bearer\s+/i, /API[_-]?KEY/i, /SECRET[_-]?KEY/i, /ACCESS[_-]?TOKEN/i],
  networkSend: [/HttpClient\(/i, /HttpURLConnection/i, /new URL\(/i],
  decode: [/Base64\.getDecoder\(\)\.decode/i, /URLDecoder\.decode/i],
  suspiciousDecodeContext: [/base64/i, /hex/i, /payload/i, /tmp\.(exe|dll|jar)/i]
};

const PROFILES: Record<ScriptLanguage, BehaviorProfile> = {
  javascript: JAVASCRIPT_PROFILE,
  python: PYTHON_PROFILE,
  powershell: POWERSHELL_PROFILE,
  shell: SHELL_PROFILE,
  java: JAVA_PROFILE
};

export function detectScriptLanguage(filePath: string, content?: string): ScriptLanguage | undefined {
  const lower = filePath.toLowerCase();
  if (/\.(js|ts|jsx|tsx)$/.test(lower)) return "javascript";
  if (/\.py$/.test(lower)) return "python";
  if (/\.ps1$/.test(lower)) return "powershell";
  if (/\.(sh|bash|cmd|bat)$/.test(lower)) return "shell";
  if (/\.java$/.test(lower)) return "java";

  if (!content) return undefined;
  const head = content.split(/\r?\n/, 3).join("\n");
  if (/^#!.*\b(node|deno|bun)\b/i.test(head)) return "javascript";
  if (/^#!.*\bpython(3)?\b/i.test(head)) return "python";
  if (/^#!.*\b(pwsh|powershell)\b/i.test(head)) return "powershell";
  if (/^#!.*\b(sh|bash)\b/i.test(head)) return "shell";

  if (/process\.env\.|require\(|module\.exports|child_process|fetch\(/i.test(content)) return "javascript";
  if (/import\s+requests|from\s+\w+\s+import|def\s+\w+\(|os\.getenv\(|subprocess\./i.test(content)) return "python";
  if (/\$env:|Invoke-WebRequest|Start-Process|param\s*\(/i.test(content)) return "powershell";
  if (/^set -e/m.test(content) || /\becho\s+\$[A-Z_]/m.test(content) || /\bchmod\s+\+x\b/i.test(content)) return "shell";
  if (/public\s+class|System\.getenv\(|ProcessBuilder|Runtime\.getRuntime\(\)/i.test(content)) return "java";
  return undefined;
}

export function getBehaviorProfile(filePath: string, content?: string) {
  const language = detectScriptLanguage(filePath, content);
  return language ? { language, profile: PROFILES[language] } : undefined;
}

export function hasPattern(content: string, patterns: RegExp[]) {
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });
}

export function findPatternLine(content: string, patterns: RegExp[]) {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        return index + 1;
      }
    }
  }
  return undefined;
}
