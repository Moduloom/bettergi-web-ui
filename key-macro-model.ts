export type MacroMode = 'once' | 'hold' | 'toggle';
export type Macro = {
  id: string; label: string; filename: string; content: string;
  enabled: boolean; hotkey: string; hotkeyType: 'KeyboardMonitor' | 'GlobalRegister'; mode: MacroMode;
};
export const macroCommands = {
  keypress: ['按键', 'keypress(e)', '按一下键盘键'],
  keydown: ['按下键', 'keydown(e)', '按下键盘键并保持'],
  keyup: ['松开键', 'keyup(e)', '松开键盘键'],
  click: ['鼠标点击', 'click(left)', '点击鼠标键，可附加游戏画面坐标'],
  mousedown: ['鼠标按下', 'mousedown(left)', '按下鼠标键并保持'],
  mouseup: ['鼠标松开', 'mouseup(left)', '松开鼠标键'],
  moveby: ['相对移动', 'moveby(100, 0)', '从当前位置移动指定像素'],
  moveto: ['绝对移动', 'moveto(960, 540)', '游戏画面坐标以 1920×1080 为准'],
  scroll: ['滚轮', 'scroll(1)', '正数向上'],
  wait: ['等待', 'wait(0.1)', '单位为秒'],
} as const;
export type Command = keyof typeof macroCommands;
export type Step = {name: Command | 'comment'; args: string[]; comment: string; line: number};
export type Diagnostic = {line: number; message: string};

export const templates: readonly {id: string; label: string; name: string; mode: MacroMode; script: string}[] = [
  {id: 'blank', label: '空白宏', name: '新建宏', mode: 'once', script: ''},
  {id: 'click', label: '连点左键（切换循环）', name: '连点左键', mode: 'toggle',
    script: '// 按一下开始连点，再按一下停止\nclick(left)\nwait(0.05)'},
  {id: 'hold', label: '按住一个键 1 秒（单次）', name: '按住 E', mode: 'once',
    script: 'keydown(e)\nwait(1)\nkeyup(e)'},
  {id: 'charge-jump', label: '重击接跳跃（按住循环）', name: '重击跳', mode: 'hold',
    script: '// 按住时循环：重击后跳跃取消后摇\nmousedown(left)\nwait(0.35)\nmouseup(left)\nkeypress(space)  // 跳跃取消\nwait(0.4)'},
];

export function normalizeMacro(item: Partial<Macro> & Pick<Macro, 'id' | 'label' | 'content'>): Macro {
  return {
    ...item, enabled: item.enabled ?? true, filename: item.filename ?? item.label + '.txt',
    mode: item.mode ?? 'once', hotkey: item.hotkey ?? '', hotkeyType: item.hotkeyType ?? 'KeyboardMonitor',
  };
}

export function readMacroFile(name: string, text: string): Macro {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const label = name.replace(/\.txt$/i, '');
  const item = normalizeMacro({id: crypto.randomUUID(), label, filename: name, content: ''});
  let start = 0;
  for (; start < lines.length; start++) {
    const parsed = /^\s*\/\/\s*@(\w+)\s*(.*?)\s*$/.exec(lines[start]);
    if (!parsed) break;
    const [, key, raw] = parsed;
    const value = raw.toLowerCase();
    switch (key.toLowerCase()) {
      // Imports follow the desktop behavior and require the recipient to choose a new binding.
      case 'hotkey': break;
      case 'hotkeytype':
        if (value === 'globalregister') item.hotkeyType = 'GlobalRegister';
        else if (value === 'keyboardmonitor') item.hotkeyType = 'KeyboardMonitor';
        break;
      case 'mode':
        if (value === 'once' || value === 'hold' || value === 'toggle') item.mode = value;
        break;
      case 'enabled':
        if (value === 'true' || value === 'false') item.enabled = value === 'true';
        break;
      default:
        item.content = lines.slice(start).join('\n').trimEnd();
        if (item.mode === 'hold') item.hotkeyType = 'KeyboardMonitor';
        return item;
    }
  }
  item.content = lines.slice(start).join('\n').trimEnd();
  if (item.mode === 'hold') item.hotkeyType = 'KeyboardMonitor';
  return item;
}

export function exportMacro(item: Macro) {
  return [
    '// @hotkey' + (item.hotkey ? ' ' + item.hotkey : ''), '// @hotkeyType ' + item.hotkeyType,
    '// @mode ' + item.mode, '// @enabled ' + item.enabled,
    ...(item.content ? item.content.replace(/\r\n?/g, '\n').trimEnd().split('\n') : []), '',
  ].join('\r\n');
}

function splitInstructions(code: string) {
  const tokens: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (!depth && (char === ';' || char === ',')) {
      if (code.slice(start, index).trim()) tokens.push(code.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (code.slice(start).trim()) tokens.push(code.slice(start).trim());
  return tokens;
}

const keyName = /^(?:(?:vk_)?[a-z\d]|f(?:[1-9]|1\d|2[0-4])|numpad\d|space|enter|return|tab|esc|escape|backspace|back|delete|del|insert|ins|home|end|pageup|pagedown|pgup|pgdn|prior|next|(?:arrow)?(?:up|down|left|right)|[lr]?(?:ctrl|control|shift|alt|menu|win)|capslock|printscreen|pause|numlock|scrolllock|add|subtract|multiply|divide|decimal|minus|equal|equals|comma|period|slash|backslash|semicolon|apostrophe|quote|grave|lbracket|rbracket|(?:vk_)?oem[_\w]+)$/i;
export const mouseKeys = ['left', 'right', 'middle', 'x1', 'x2'];
const int = (value: string) => /^[+-]?\d+$/.test(value) && Number(value) >= -2147483648 && Number(value) <= 2147483647;
const point = (x: string, y: string) => int(x) && int(y)
  && Number(x) >= 0 && Number(x) <= 1920 && Number(y) >= 0 && Number(y) <= 1080;

function invalid(name: Command, args: string[]) {
  switch (name) {
    case 'keypress': case 'keydown': case 'keyup':
      return args.length !== 1 || !keyName.test(args[0]) ? '需要一个有效的键盘键。' : '';
    case 'click': case 'mousedown': case 'mouseup':
      if (args.length && ![...mouseKeys, 'xbutton1', 'xbutton2'].includes(args[0].toLowerCase())) return '无法识别的鼠标键。';
      if (args.length <= 1 || (name === 'click' && args.length === 3 && point(args[1], args[2]))) return '';
      return name === 'click' ? '请填写鼠标键，或填写鼠标键和两个游戏画面坐标。' : '只接受一个鼠标键。';
    case 'moveby': return args.length === 2 && args.every(int) ? '' : '需要两个整数。';
    case 'moveto': return args.length === 2 && point(args[0], args[1]) ? '' : '需要两个有效的游戏画面坐标。';
    case 'scroll': return args.length === 1 && int(args[0]) ? '' : '需要整数格数。';
    case 'wait': return args.length === 1 && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(args[0]) &&
      Number(args[0]) >= 0 && Number(args[0]) <= 3600 ? '' : '等待时间必须在 0 到 3600 秒之间。';
  }
}

export function parseMacro(script: string) {
  const steps: Step[] = [];
  const diagnostics: Diagnostic[] = [];
  script.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      steps.push({name: 'comment', args: [], comment: trimmed.replace(/^(#|\/\/)\s*/, ''), line});
      return;
    }
    const commentAt = trimmed.indexOf('//');
    const code = commentAt === -1 ? trimmed : trimmed.slice(0, commentAt);
    const comment = commentAt === -1 ? '' : trimmed.slice(commentAt + 2).trim();
    const tokens = splitInstructions(code);
    const first = steps.length;
    for (const token of tokens) {
      const match = /^([a-z]+)\s*(?:\(([^()]*)\))?$/i.exec(token);
      const name = match?.[1].toLowerCase() as Command | undefined;
      if (!name || !Object.hasOwn(macroCommands, name)) {
        diagnostics.push({line, message: '无法识别的指令：' + token});
        continue;
      }
      const args = match?.[2]?.trim() ? match[2].split(',').map(value => value.trim()) : [];
      const issue = invalid(name, args);
      if (issue) diagnostics.push({line, message: name + '：' + issue});
      else steps.push({name, args: args.length || !['click', 'mousedown', 'mouseup'].includes(name) ? args : ['left'],
        comment: '', line});
    }
    if (comment && steps.length > first) steps[steps.length - 1].comment = comment;
  });
  return {steps, diagnostics};
}

export function writeSteps(steps: readonly Step[]) {
  return steps.map(step => step.name === 'comment' ? '// ' + step.comment :
    step.name + '(' + step.args.join(', ') + ')' + (step.comment ? '  // ' + step.comment : '')).join('\n');
}
