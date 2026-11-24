import type {Entry, Field, Props} from 'loom-frame';

const text = (key: string, label: string): Field => ({key, label, kind: 'text'});
const flag = (key: string, label: string): Field => ({key, label, kind: 'boolean'});
const json = (key: string, label: string): Field => ({key, label, kind: 'json'});
const count = (key: string, label: string, min: number, max: number): Field =>
  ({key, label, kind: 'number', min, max, step: 1});
const pick = (key: string, label: string, optionLabels: Record<string, string>): Field =>
  ({key, label, kind: 'select', options: Object.keys(optionLabels), optionLabels});

type CatalogOptions = {
  props?: Props; fields?: Field[]; deps?: string[]; viewport?: Entry['preview'];
};
const id = (name: string) => 'bettergi-ui:' + name;

function entry(slug: string, name: string, label: string, group: string, source: string,
  sourceName: string, description: string, options: CatalogOptions = {}): Entry {
  return {
    id: id(slug), name, label, group, source, sourceName, description,
    kind: options.deps ? 'composite' : 'basic',
    basicComponentIds: options.deps?.map(id),
    package: '', props: options.props ?? {}, fields: options.fields ?? [],
    preview: options.viewport ?? (options.fields?.some(field => field.kind === 'boolean') ? undefined : {states: false}),
  };
}

const layout = (height = 300, width = 690, scene = false): Entry['preview'] =>
  ({scene, states: false, viewport: {width, height, minWidth: 300}});
const labelField = text('label', '文字');
const disableField = flag('disabled', '禁用');
const valueField = text('value', '当前值');
const checkedField = flag('checked', '选中');
const openField = flag('open', '打开');
const appearances = {default: '次按钮', primary: '主按钮', transparent: '透明',
  danger: '危险', warning: '警告', success: '成功'};
const tones = {info: '信息', success: '成功', warning: '警告', danger: '错误'};
const icons = {play: '运行', settings: '设置', globe: '语言', search: '搜索', info: '信息',
  check: '确认', clock: '时间', folder: '目录', file: '文档', download: '下载',
  plus: '新增', x: '关闭', music: '音乐', monitor: '窗口'};
const controls = 'src/components/controls.tsx';
const collections = 'src/components/collections.tsx';
const overlays = 'src/components/overlays.tsx';
const panels = 'src/components/panels.tsx';
const media = 'src/components/media.tsx';
const renderer = 'src/preview/renderer.tsx';
const readmeExample = "# 脚本运行说明\n\n运行前请确认 **游戏窗口** 已连接，并在任务计划里选择运行账户。[^准备]\n\n> 第一次运行时，可以先用单条路线确认设置。\n\n## 配置参数\n\n| 参数 | 示例 | 说明 |\n| --- | --- | --- |\n| `region` | 枫丹 | 选择要执行的地区 |\n| `retry` | `2` | 失败后的重试次数 |\n\n[跳到运行步骤](#运行步骤) · [BetterGI 使用文档](https://www.bettergi.com/)\n\n## 运行步骤\n\n1. 选择一条路线。\n2. 确认执行账户与任务顺序。\n3. 检查参数后启动。\n\n```javascript\nconst options = { region: \"枫丹\", retry: 2 };\nconsole.log(options.region);\n```\n\n<details>\n<summary>运行失败怎么办？</summary>\n<p>检查游戏窗口是否可见，再从执行记录找到失败的步骤。</p>\n</details>\n\n[^准备]: 如果需要切换账户，请在脚本开始前完成。";

const entries: Entry[] = [
  entry('typography', 'Text', '标题与正文', '展示', controls, 'TextBlock / Run',
    '覆盖页面标题、分区标题、副标题、正文、强调正文和说明。', {
      props: {label: '软件设置', variant: 'section'},
      fields: [labelField, pick('variant', '层级', {title: '页面标题', section: '分区标题',
        subtitle: '副标题', body: '正文', strong: '强调正文', caption: '说明'})],
    }),
  entry('link', 'Link', '行内链接', '展示', controls, 'Hyperlink', '在正文中打开相关文档。', {
    props: {label: '查看 BetterGI 使用文档', href: 'https://www.bettergi.com/'},
    fields: [labelField, text('href', '链接地址')],
  }),
  entry('image', 'Image', '图片', '展示', media, 'Image / ImageBrush',
    '显示本地或网络图片，支持适应、裁切和加载失败时的回退。', {
      props: {fit: 'cover'}, fields: [pick('fit', '填充方式', {cover: '等比填充', contain: '等比适应', fill: '填充'})],
    }),
  entry('icon', 'Icon', '符号图标', '图标', controls, 'SymbolIcon / FontIcon / ImageIcon',
    '提供常见操作和状态的符号图标。', {
      props: {icon: 'settings', size: 24}, fields: [pick('icon', '图标', icons), count('size', '尺寸', 12, 64)],
    }),
  entry('font-icon', 'FontIcon', '字体图标', '图标', controls, 'FontIcon / FgiRegular',
    '在独立任务等组件里显示原版 Fgi 字体图标。', {
      props: {glyph: '\uf71d', size: 19},
      fields: [pick('glyph', '图标', {'\uf71d': '战斗', '\uf6d2': '七圣召唤', '\uf6b2': '伐木',
        '\uf438': '秘境', '\ue3a8': '钓鱼'}), count('size', '尺寸', 12, 64)],
    }),
  entry('badge', 'Badge', '徽标', '展示', controls, 'InfoBadge', '显示数量、运行状态或选项状态。', {
    props: {label: '3', tone: 'primary'},
    fields: [labelField, pick('tone', '表意', {default: '默认', primary: '数量', success: '成功', warning: '警告', danger: '错误'})],
  }),
  entry('button', 'Button', '按钮', '操作', controls, 'Button', '承载主操作、次操作和状态操作。', {
    props: {label: '保存配置', appearance: 'primary', disabled: false},
    fields: [labelField, pick('appearance', '外观', appearances), disableField],
  }),
  entry('icon-button', 'IconButton', '图标按钮', '操作', controls, 'Button.Icon',
    '标题栏、工具条和列表内的图标操作。', {
      props: {label: '打开设置', appearance: 'transparent', icon: 'settings', disabled: false},
      fields: [labelField, pick('icon', '图标', icons), pick('appearance', '外观', appearances), disableField],
    }),
  entry('toggle-button', 'ToggleButton', '双状态按钮', '操作', controls, 'TwoStateButton',
    '在同一入口切换启动和停止状态。', {
      props: {checked: false, disabled: false}, fields: [checkedField, disableField], deps: ['button'],
    }),
  entry('switch', 'Switch', '开关', '表单', controls, 'ToggleSwitch', '开启或关闭一个选项。', {
    props: {label: '启用实时触发', checked: true, disabled: false},
    fields: [labelField, checkedField, disableField],
  }),
  entry('checkbox', 'CheckBox', '复选框', '表单', controls, 'CheckBox', '独立勾选一个选项。', {
    props: {label: '运行前检查游戏窗口', checked: false, disabled: false},
    fields: [labelField, checkedField, disableField],
  }),
  entry('radio-group', 'RadioGroup', '单选选项组', '表单', controls, 'RadioButton',
    '在一组互斥配置中选择一项。', {
      props: {value: 'default', disabled: false},
      fields: [pick('value', '选项', {default: '按默认数量合成', reserve: '保留原粹树脂'}), disableField],
    }),
  entry('input', 'TextBox', '文本输入', '表单', controls, 'TextBox', '输入名称或配置值。', {
    props: {label: '任务名称', value: '每日任务', disabled: false},
    fields: [labelField, valueField, disableField],
  }),
  entry('textarea', 'TextArea', '多行输入', '表单', controls, 'TextBox.AcceptsReturn', '编辑备注或说明。', {
    props: {label: '备注', value: '完成每日任务后再运行采集。', disabled: false},
    fields: [labelField, valueField, disableField],
  }),
  entry('password', 'PasswordBox', '密码输入', '表单', controls, 'PasswordBox',
    '配置凭据时隐藏输入内容。', {
      props: {label: '密码', value: '', disabled: false},
      fields: [labelField, valueField, disableField],
    }),
  entry('number', 'NumberBox', '数字输入', '表单', controls, 'NumberBox', '支持输入、步进与范围限制。', {
    props: {label: '延时（秒）', value: 5, disabled: false},
    fields: [labelField, count('value', '当前值', 0, 60), disableField],
  }),
  entry('search', 'SearchField', '搜索框', '表单', controls, 'TextBox + SymbolIcon',
    '搜索列表项并清除查询。', {
      props: {label: '搜索脚本', value: '', disabled: false},
      fields: [labelField, valueField, disableField],
    }),
  entry('hotkey', 'HotkeyField', '快捷键录入', '表单', controls, 'HotKeyTextBox / KeyBindingTextBox / KeyCaptureBox',
    '在聚焦时捕获按键和修饰键。', {
      props: {label: '运行任务快捷键', value: 'Ctrl + F9', disabled: false},
      fields: [labelField, valueField, disableField],
    }),
  entry('select', 'ComboBox', '单选下拉框', '表单', controls, 'ComboBox', '在下拉列表中选定一个值。', {
    props: {label: '软件界面语言', value: 'zh', disabled: false},
    fields: [labelField, pick('value', '当前值', {zh: '简体中文', en: 'English', ja: '日本語'}), disableField],
  }),
  entry('multi-select', 'MultiSelectComboBox', '多选下拉框', '表单', controls, 'MultiSelectComboBox',
    '在下拉层中选择多个项目。', {
      props: {label: '执行地区', values: ['mondstadt', 'liyue'], disabled: false},
      fields: [labelField, json('values', '选中项 ID'), disableField],
    }),
  entry('cascading-select', 'CascadingComboBox', '级联选择框', '表单', controls, 'CascadeSelector',
    '可用分栏字段或单个级联菜单选择类别和所属项目。', {
      props: {value: 'fontaine/echo', presentation: 'fields'},
      fields: [valueField, pick('presentation', '呈现方式', {fields: '两个字段', menu: '级联菜单'})],
      deps: ['select', 'button'],
    }),
  entry('slider', 'Slider', '滑块', '表单', controls, 'Slider / Track / Thumb', '连续调节音量、透明度或尺寸。', {
    props: {label: '音量', value: 65, disabled: false},
    fields: [labelField, count('value', '当前值', 0, 100), disableField],
  }),
  entry('cron', 'CronEditor', 'Cron 与时间设置', '表单', panels, 'PuloniaCronEditor',
    '支持直接输入表达式、按周期生成和选择时分。', {
      props: {value: '0 4 * * *'}, fields: [valueField], deps: ['input', 'select', 'tabs'], viewport: layout(420),
    }),
  entry('tabs', 'Tabs', '页签', '导航', collections, 'TabControl',
    '在同一工作区内切换任务编排、触发方式和执行记录。', {
      props: {value: 'configuration'},
      fields: [pick('value', '当前页签', {configuration: '任务编排', triggers: '触发方式', history: '执行记录'})],
    }),
  entry('navigation', 'Navigation', '侧边导航', '导航', collections, 'NavigationView / NavigationViewItem',
    '主窗口导航栏，支持展开和紧凑两种状态。', {
      props: {value: 'home', compact: false}, fields: [valueField, flag('compact', '仅显示图标')],
      deps: ['icon'],
    }),
  entry('menu', 'DropdownMenu', '下拉菜单与子菜单', '浮层', overlays, 'DropDownButton / MenuItem',
    '在按钮旁展开操作菜单，支持分组和子菜单。', {deps: ['button', 'icon'], viewport: layout(380)}),
  entry('context-menu', 'ContextMenu', '右键菜单', '浮层', overlays, 'ContextMenu',
    '在项目附近打开操作和子菜单。', {deps: ['button', 'icon'], viewport: layout(380)}),
  entry('flyout', 'Flyout', '定位浮层', '浮层', overlays, 'Flyout / Popup',
    '将额外配置放在触发器旁边。', {
      props: {open: false}, fields: [openField], deps: ['button'], viewport: layout(352),
    }),
  entry('tooltip', 'Tooltip', '悬停提示', '浮层', overlays, 'ToolTip',
    '悬停或聚焦后解释图标操作。', {
      props: {label: '查看说明', hint: '可在任务运行前调整执行账户。'},
      fields: [labelField, text('hint', '提示')], deps: ['icon-button'],
    }),
  entry('card', 'Card', '信息卡片', '展示', collections, 'Card / CardAction',
    '在同一区域呈现标题、摘要和主要操作。', {
      props: {label: '硬件加速', hint: '管理识别和推理设备。'},
      fields: [labelField, text('hint', '说明')], deps: ['button', 'icon'],
    }),
  entry('settings-row', 'SettingsRow', '设置选项行', '设置', collections, 'CardControl',
    '在选项标题与描述右侧放置就近的开关。', {
      props: {label: '启用实时触发', hint: '在游戏中自动响应已启用的触发器。', checked: true},
      fields: [labelField, text('hint', '说明'), checkedField], deps: ['switch', 'icon'],
    }),
  entry('solo-task-button', 'SoloTaskButton', '独立任务按钮', '操作', controls, 'SoloTaskButton',
    '展示独立任务的启动、停止、处理及实例管理状态。', {
      props: {value: 'idle', active: 2, disabled: false},
      fields: [pick('value', '任务状态', {idle: '待启动', starting: '启动中', running: '运行中',
        stopping: '停止中', pending: '处理中', manage: '多实例管理'}), count('active', '运行实例', 0, 20), disableField],
      deps: ['button'],
    }),
  entry('settings-action-row', 'SettingsActionRow', '设置操作行', '设置', collections, 'CardControl / Grid',
    '把单个按钮或操作组放在设置说明的右侧。', {
      props: {label: '手动选择窗口', hint: '原神已经启动，但自动检测无法找到窗口时使用。',
        action: '选择捕获窗口', disabled: false, inline: false},
      fields: [labelField, text('hint', '说明'), text('action', '按钮文字'), disableField, flag('inline', '组内行')],
      deps: ['button', 'typography'],
    }),
  entry('expander', 'CardExpander', '可展开设置卡片', '设置', collections, 'CardExpander / Expander',
    '展开查看次要设置，再折叠以保留当前配置。', {
      props: {label: '本机外部访问服务', open: false, checked: false},
      fields: [labelField, openField, checkedField], deps: ['switch', 'icon'], viewport: layout(280),
    }),
  entry('divider', 'Divider', '分隔线', '布局', renderer, 'Separator', '分隔相邻的内容或操作组。'),
  entry('toolbar', 'Toolbar', '工具栏与操作组', '布局', collections, 'StackPanel / DockPanel',
    '把搜索、筛选、刷新和新建放在同一操作区。', {
      props: {value: ''}, fields: [valueField], deps: ['search', 'button', 'icon-button'],
    }),
  entry('split', 'SplitView', '可调整分栏', '布局', panels, 'GridSplitter',
    '调整列表区和详情区的相对宽度。', {
      props: {value: 200}, fields: [count('value', '左栏宽度', 155, 350)],
      deps: ['divider', 'typography'], viewport: layout(310),
    }),
  entry('list', 'List', '图文列表', '展示', collections, 'ListView / ListBox / ItemsControl',
    '可展示普通、可选择、分组和空列表。', {
      props: {value: 'daily', grouped: false, empty: false, selectable: true},
      fields: [valueField, flag('grouped', '按组显示'), flag('empty', '空列表'), flag('selectable', '允许选择')],
      deps: ['icon', 'badge'],
    }),
  entry('virtual-list', 'VirtualList', '虚拟列表', '展示', collections, 'VirtualizingStackPanel',
    '固定行高的长列表只渲染可见部分。', {
      props: {value: 'script-1', count: 180}, fields: [valueField, count('count', '行数', 0, 500)],
      deps: ['icon'], viewport: layout(330),
    }),
  entry('reorder', 'ReorderList', '拖拽排序列表', '展示', collections, 'ListView + DragDrop',
    '拖拽手柄或使用方向键调整顺序，也可移除一项。', {
      props: {order: ['daily', 'route', 'resin', 'mail']}, fields: [json('order', '项目顺序')],
      deps: ['icon-button'], viewport: layout(320),
    }),
  entry('table', 'DataGrid', '数据表格', '展示', collections, 'DataGrid / GridView',
    '可排序、选择行，并可用拖拽或键盘调整名称列宽。', {
      props: {value: 'stone', empty: false}, fields: [valueField, flag('empty', '空表格')],
      deps: ['icon', 'button'], viewport: layout(315),
    }),
  entry('tree', 'Tree', '树与树形表格', '展示', collections, 'TreeView / TreeListView',
    '展开或折叠分组节点，可用表格形式同时显示任务类型。', {
      props: {value: 'daily', table: true}, fields: [valueField, flag('table', '显示类型列')],
      deps: ['icon-button'], viewport: layout(335),
    }),
  entry('empty', 'EmptyState', '空状态', '反馈', collections, 'AccountRecordsEmptyState',
    '在剩余区域居中呈现空状态与必要操作。', {
      props: {label: '暂无账号记录', hint: '导入记录后可在这里查看库存。'},
      fields: [labelField, text('hint', '说明')], deps: ['icon', 'button'],
    }),
  entry('progress', 'Progress', '进度条', '反馈', controls, 'ProgressBar',
    '显示确定进度或等待状态。', {
      props: {label: '更新脚本仓库', value: 64, busy: false},
      fields: [labelField, count('value', '百分比', 0, 100), flag('busy', '等待状态')],
    }),
  entry('progress-ring', 'ProgressRing', '进度环', '反馈', controls, 'ProgressRing / Loading',
    '用紧凑圆环表示加载状态或已完成比例。', {
      props: {label: '加载中', value: 68, busy: true},
      fields: [labelField, count('value', '百分比', 0, 100), flag('busy', '等待状态')],
    }),
  entry('info-bar', 'InfoBar', '行内提示条', '反馈', overlays, 'InfoBar',
    '在受影响的区域显示反馈，并可就地关闭。', {
      props: {label: '配置已保存', hint: '新配置将在下次运行时生效。', tone: 'success', open: true},
      fields: [labelField, text('hint', '说明'), pick('tone', '状态', tones), openField], deps: ['icon', 'icon-button'],
    }),
  entry('snackbar', 'Snackbar', '短消息', '反馈', overlays, 'SnackbarPresenter',
    '在窗口下方显示可关闭的操作反馈。', {
      props: {label: '配置已保存', tone: 'success', open: false},
      fields: [labelField, pick('tone', '状态', tones), openField], deps: ['icon-button'], viewport: layout(260),
    }),
  entry('dialog', 'MessageDialog', '消息与确认弹窗', '窗体', overlays, 'ThemedMessageBox',
    '包含标题栏、消息图标、滚动正文及右对齐操作。', {
      props: {label: '确认运行', hint: '按当前执行顺序运行此计划？', tone: 'info', open: false},
      fields: [labelField, text('hint', '正文'), pick('tone', '状态', tones), openField],
      deps: ['button', 'icon', 'title-bar'], viewport: layout(420, 690, true),
    }),
  entry('form-dialog', 'FormDialog', '输入与表单弹窗', '窗体', overlays, 'PromptDialog / PuloniaPlanCreationDialog',
    '带名称、类型、备注、提交和取消的表单弹窗。', {
      props: {label: '新建任务计划', value: '', open: false}, fields: [labelField, valueField, openField],
      deps: ['input', 'select', 'textarea', 'button', 'title-bar'], viewport: layout(460, 690, true),
    }),
  entry('drawer', 'Drawer', '侧边抽屉', '浮层', overlays, 'CustomDrawer',
    '贴靠右边的编辑区域，支持旋出、关闭和保存。', {
      props: {open: false, value: '每日任务'}, fields: [openField, valueField],
      deps: ['input', 'button', 'title-bar'], viewport: layout(420, 680, true),
    }),
  entry('title-bar', 'TitleBar', '窗口标题栏', '窗体', overlays, 'TitleBar',
    '窗口标题、图标、最小化、最大化和关闭按钮。', {
      props: {label: 'BetterGI', compact: false}, fields: [labelField, flag('compact', '仅显示关闭')],
      deps: ['icon-button'], viewport: layout(180),
    }),
  entry('window', 'WindowFrame', '主窗体', '窗体', overlays, 'MainWindow / FluentWindow',
    '组合主导航、页面标题栏、选项行和窗口控制。', {
      props: {label: 'BetterGI', value: 'settings', compact: false},
      fields: [labelField, valueField, flag('compact', '紧凑导航')],
      deps: ['navigation', 'title-bar', 'switch', 'button'], viewport: {scene: true, states: false, fillCanvas: true, viewport: {width: 799, height: 530, minWidth: 360}},
    }),
  entry('tool-window', 'ToolWindow', '工具与管理窗体', '窗体', overlays, 'StorageManagementWindow / WpfUiWindow',
    '可打开工具窗口，通过列表和详情查看项目。', {
      props: {label: '存储空间', open: true}, fields: [labelField, openField],
      deps: ['title-bar', 'button', 'progress'], viewport: layout(335, 660, true),
    }),
  entry('markdown', 'MarkdownView', 'Markdown 阅读器', '展示', 'src/components/markdown.tsx', 'MarkdownView',
    '支持文档内锚点、脚注、表格、相对图片、代码高亮和 Mermaid 图。', {
      props: {value: readmeExample, baseUrl: ''},
      fields: [{...text('value', 'Markdown 正文'), multiline: true}, text('baseUrl', '文档地址')],
      deps: ['typography', 'link'], viewport: layout(540, 720),
    }),
  entry('log', 'LogView', '富文本运行日志', '展示', media, 'RichTextBox',
    '滚动查看任务阶段、时间和错误状态。', {
      props: {value: '[04:00:00] 开始执行计划\n[04:00:12] 已完成所有任务', empty: false},
      fields: [valueField, flag('empty', '空日志')], deps: ['typography'], viewport: layout(260),
    }),
  entry('code-editor', 'CodeEditor', '代码、JSON 与宏编辑器', '表单', media, 'CodeBox / JsonCodeBox / KeyMacroCodeBox',
    '显示行号，支持 JSON 格式提示与宏命令补全。', {
      props: {value: '{\n  "enabled": true\n}', language: 'json'},
      fields: [valueField, pick('language', '编辑模式', {json: 'JSON', macro: '键鼠宏', html: 'HTML'})],
      deps: ['textarea', 'info-bar'], viewport: layout(390),
    }),
  entry('file-picker', 'FilePicker', '文件／目录选择与拖放', '表单', media, 'OpenFileDialog / OpenFolderDialog',
    '选择文件、选择文件夹和拖放本地文件。', {
      props: {files: [], directory: false}, fields: [json('files', '已选择的文件'), flag('directory', '选择目录')],
      deps: ['button', 'icon'],
    }),
  entry('export', 'FileExport', '保存与导出', '操作', media, 'SaveFileDialog',
    '命名文件并下载 JSON 示例。', {
      props: {value: 'task-plan.json'}, fields: [valueField], deps: ['input', 'button'],
    }),
  entry('canvas', 'CanvasViewer', '地图、图像与遮罩画布', '展示', media, 'MapViewer / ImageEditWindow / AdjustableOverlayItem',
    '预览路线、标记点位、打开图片、选择区域与旋转。', {
      props: {mode: 'map'}, fields: [pick('mode', '内容', {map: '路线地图', image: '图片与选区', overlay: '遮罩画布'})],
      deps: ['button', 'slider'], viewport: layout(420, 690, true),
    }),
  entry('player', 'AudioPlayer', '音轨与播放控制', '展示', media, 'MusicPage / EnginePreviewView',
    '试听、调节音量，并可切换音轨和拖动播放进度。', {
      props: {voice: false}, fields: [flag('voice', '仅显示试听')], deps: ['list', 'slider', 'icon-button'],
      viewport: layout(360, 585),
    }),
  entry('subtitles', 'SubtitleWindow', '导览字幕浮窗', '窗体', media, 'GuideSubtitleWindow',
    '按浮窗方式显示简短字幕。', {
      props: {label: '沿小路向前，靠近传送锚点。'}, fields: [labelField], deps: ['typography'],
    }),
  entry('native-window', 'HostedSurface', '桌面与媒体宿主窗体', '窗体', media,
    'PickerWindow / ChildSessionWindow / CloudWebHostWindow / PictureInPictureWindow',
    '预览捕获窗口、桌面分身、云游戏与画中画的 Web 窗体布局。', {
      props: {kind: 'capture'},
      fields: [pick('kind', '窗体类型', {capture: '窗口选择', remote: '桌面分身', cloud: '云游戏', pip: '画中画'})],
      deps: ['title-bar', 'canvas', 'button'], viewport: layout(460, 730, true),
    }),
  entry('tray', 'TrayMenu', '托盘操作菜单', '浮层', renderer, 'NotifyIcon / ContextMenu',
    '预览托盘图标及其显示窗口、配置与退出入口。', {
      deps: ['icon-button', 'menu'], viewport: layout(330),
    }),
  entry('trigger-panel', 'TriggerPanel', '计划触发配置', '设置', panels, 'PuloniaTaskTriggerView',
    '配置定时或快捷键触发，选择时区并设置启用状态。', {
      deps: ['tabs', 'switch', 'hotkey', 'button', 'select'], viewport: layout(450, 660, true),
    }),
  entry('task-plan', 'PlanBoard', '任务计划与一条龙', '布局', panels, 'PuloniaTaskPlanPage / PuloniaOneDragonPage',
    '从任务库选择执行项，编排顺序、设置触发并查看执行记录。', {
      props: {label: '每日任务计划', showTabs: true}, fields: [labelField, flag('showTabs', '显示计划页签')],
      deps: ['tabs', 'search', 'icon-button', 'button'], viewport: layout(490, 810, true),
    }),
  entry('run-history', 'RunHistory', '任务执行记录', '展示', panels, 'PuloniaTaskHistoryView',
    '以主从分栏浏览运行记录、状态和日志。', {
      deps: ['badge', 'typography'], viewport: layout(345, 660, true),
    }),
  entry('strategy', 'StrategyPicker', '战斗策略选择器', '设置', 'src/features/tasks/strategy.tsx', 'CombatStrategyPicker',
    '在自动匹配和本地策略中搜索并选取。', {
      props: {value: 'default'}, fields: [valueField], deps: ['search', 'button'], viewport: layout(380),
    }),
  entry('inventory', 'InventoryView', '账号库存与事件', '展示', renderer, 'AccountRecordsInventoryView / AccountRecordsEventsDialog',
    '在库存表格与事件列表之间切换并查看记录详情。', {
      deps: ['tabs', 'search', 'button'], viewport: layout(430, 700, true),
    }),
  entry('resin', 'ResinEditor', '树脂用量设置', '设置', panels, 'CraftResinEditorView / ResinUsageEditorView',
    '选择默认合成方式或指定保留数量。', {
      deps: ['radio-group', 'number'], viewport: layout(265),
    }),
  entry('resource-center', 'ResourceList', '仓库、冷却、下载与语音配置', '展示', panels,
    'PuloniaRepositoryManagerWindow / PuloniaRouteCooldownView / DownloadCenterView / QuestVoiceSettingsWindow',
    '提供资源搜索、状态查看与配置操作。', {
      props: {kind: 'repositories'}, fields: [pick('kind', '内容', {repositories: '仓库', cooldown: '路线冷却', download: '下载中心', voice: '语音引擎'})],
      deps: ['search', 'badge', 'progress', 'button'], viewport: layout(345, 630, true),
    }),
];

const entriesById = new Map(entries.map(entry => [entry.id, entry]));

function basics(componentId: string): string[] {
  const component = entriesById.get(componentId);
  if (!component) return [];
  return component.kind === 'basic' ? [componentId] : (component.basicComponentIds ?? []).flatMap(basics);
}

const mainWindow = entriesById.get(id('window'))!;
const application: Entry = {
  ...entry('all', '全部', '全部', '展示', 'src/app/app.tsx', 'BetterGIApp',
    'BetterGI Web', {
      deps: [],
      viewport: {fillCanvas: true, height: 724, states: false, highlight: false},
    }),
  directoryLevel: 'kind',
};
export const catalog = [mainWindow, application, ...entries.filter(entry => entry !== mainWindow)].map(entry => ({
  ...entry,
  basicComponentIds: entry.basicComponentIds && [...new Set(entry.basicComponentIds.flatMap(basics))],
}));
